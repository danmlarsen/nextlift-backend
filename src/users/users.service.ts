import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, UserType } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { UNCONFIRMED_USER_MAX_AGE_DAYS } from 'src/common/constants';

@Injectable()
export class UsersService {
  constructor(
    private prismaService: PrismaService,
    @InjectPinoLogger(UsersService.name) private readonly logger: PinoLogger,
  ) {}

  async getUser(filter: Prisma.UserWhereInput) {
    this.logger.info(`Fetching user`, { filter });
    try {
      return await this.prismaService.user.findFirst({ where: filter });
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to fetch user`, { filter, error });
      throw new InternalServerErrorException('Failed to fetch user');
    }
  }

  async createUser(data: Prisma.UserCreateInput) {
    // Never log `data`: it carries the bcrypt password hash.
    this.logger.info(`Creating a new user`, { email: data.email });
    try {
      return await this.prismaService.user.create({ data });
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to create user`, { email: data.email, error });
      throw new InternalServerErrorException('Failed to create user');
    }
  }

  async updateUser(id: number, data: Prisma.UserUpdateInput) {
    // Log only which fields changed, never their values (password / refresh
    // token hashes flow through here).
    this.logger.info(`Updating user`, { id, fields: Object.keys(data) });
    try {
      return await this.prismaService.user.update({ where: { id }, data });
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to update user`, {
        id,
        fields: Object.keys(data),
        error,
      });
      throw new InternalServerErrorException('Failed to update user');
    }
  }

  // Prune abandoned registrations: never confirmed, never logged in, past the
  // retention window. The lastLoginAt guard protects any legacy account that
  // was allowed to log in before email confirmation became mandatory.
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async cleanupStaleUnconfirmedUsers() {
    try {
      this.logger.info('Starting cleanup of stale unconfirmed users');
      const cutoff = new Date(
        Date.now() - UNCONFIRMED_USER_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
      );
      const whereClause = {
        userType: UserType.REGULAR,
        isEmailConfirmed: false,
        lastLoginAt: null,
        createdAt: { lt: cutoff },
      };

      const usersToDelete = await this.prismaService.user.findMany({
        where: whereClause,
      });

      let deletedCount = 0;
      if (usersToDelete.length > 0) {
        const result = await this.prismaService.$transaction(async (tx) => {
          await tx.deletedUser.createMany({
            data: usersToDelete.map((user) => ({
              originalUserId: user.id,
              email: user.email,
              createdAt: user.createdAt,
            })),
          });

          // Re-evaluating the filter (instead of deleting by id) lets a user
          // who confirmed between the two queries survive, at worst leaving a
          // stray tombstone row.
          return tx.user.deleteMany({ where: whereClause });
        });
        deletedCount = result.count;
      }
      this.logger.info('Completed cleanup of stale unconfirmed users', {
        deletedCount,
      });
    } catch (error: unknown) {
      // Pruning must never break the request that triggered it.
      this.logger.error('Failed to clean up stale unconfirmed users', {
        error,
      });
    }
  }

  async deleteAccount(userId: number, password: string) {
    this.logger.info(`Deleting account for user`, { userId });
    try {
      const user = await this.getUser({ id: userId });
      if (!user) {
        this.logger.warn(`User not found for account deletion`, { userId });
        throw new UnauthorizedException('User not found');
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        this.logger.warn(`Incorrect password for account deletion`, { userId });
        throw new UnauthorizedException('Incorrect password');
      }

      // Log deletion and delete user in a transaction
      await this.prismaService.$transaction(async (tx) => {
        // Log the deletion
        await tx.deletedUser.create({
          data: {
            originalUserId: user.id,
            email: user.email,
            createdAt: user.createdAt,
          },
        });

        // Delete the actual user (cascades will handle related data)
        await tx.user.delete({
          where: { id: userId },
        });
      });

      return {
        success: true,
        message: 'Account deleted successfully',
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to delete account for user`, { userId, error });
      throw new InternalServerErrorException('Failed to delete account');
    }
  }
}
