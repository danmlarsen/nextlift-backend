import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpsertUserProfileDto } from './dtos/upsert-user-profile.dto';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

@Injectable()
export class UserProfileService {
  constructor(
    private readonly prismaService: PrismaService,
    @InjectPinoLogger(UserProfileService.name)
    private readonly logger: PinoLogger,
  ) {}

  findProfile(userId: number) {
    this.logger.info(`Fetching user profile`, { userId });
    return this.prismaService.userProfile.findUnique({
      where: { userId },
    });
  }

  upsertProfile(userId: number, data: UpsertUserProfileDto) {
    this.logger.info(`Upserting user profile`, { userId });
    return this.prismaService.userProfile.upsert({
      where: { userId },
      create: { ...data, userId },
      update: data,
    });
  }
}
