import {
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import { RegisterUserDto } from './dtos/register-user.dto';
import * as bcrypt from 'bcrypt';
import { LoginUserDto } from './dtos/login-user.dto';
import { UserResponseDto } from './dtos/user-response.dto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from 'src/common/types/jwt-payload.interface';
import * as crypto from 'crypto';
import { EmailService } from 'src/email/email.service';
import { EmailNotConfirmedException } from 'src/common/exceptions/email-not-confirmed-exception';
import { PrismaService } from 'src/prisma/prisma.service';
import { ResetPasswordDto } from './dtos/reset-password.dto';
import { ResendConfirmationDto } from './dtos/resend-confirmation.dto';
import { RequestPasswordResetDto } from './dtos/request-password-reset.dto';
import { RecaptchaResponse } from 'src/common/types/recaptcha-response';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

@Injectable()
export class AuthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    @InjectPinoLogger(AuthService.name) private readonly logger: PinoLogger,
  ) {}

  async registerUser(data: RegisterUserDto) {
    this.logger.info(`Attempting to register user with email`, {
      email: data.email,
    });
    try {
      // A suspended Fly machine cannot run the scheduled 04:00 cleanup, so
      // registration traffic doubles as the trigger (same free-tier pattern as
      // demo cleanup). Running it before the duplicate check below also frees
      // an email squatted by an abandoned unconfirmed registration; the
      // cleanup swallows its own errors, so it cannot fail the registration.
      await this.usersService.cleanupStaleUnconfirmedUsers();

      const foundUser = await this.usersService.getUser({ email: data.email });
      if (foundUser) {
        this.logger.warn(`Registration failed: Email already in use`, {
          email: data.email,
        });
        throw new ConflictException('Email is already in use');
      }

      const hashedPassword = await this.hashPassword(data.password);

      const newUser = await this.usersService.createUser({
        email: data.email,
        password: hashedPassword,
        isEmailConfirmed: false,
      });

      const token = await this.createEmailConfirmationToken(newUser.id);
      await this.emailService.sendConfirmationEmail(newUser.email, token.token);

      this.logger.info(
        `User registered successfully with email: ${data.email}`,
        {
          userId: newUser.id,
        },
      );
      return newUser;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Error during user registration`, {
        email: data.email,
        error,
      });
      throw new InternalServerErrorException('Failed to register user');
    }
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ) {
    this.logger.info(`User requested password change`, { userId });
    try {
      const user = await this.usersService.getUser({ id: userId });

      if (!user) {
        this.logger.warn(`User not found for password change`, { userId });
        throw new UnauthorizedException('User not found');
      }

      const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        user.password,
      );
      if (!isCurrentPasswordValid) {
        this.logger.warn(`User provided incorrect current password`, {
          userId,
        });
        throw new UnauthorizedException('Current password is incorrect');
      }

      const isSamePassword = await bcrypt.compare(newPassword, user.password);
      if (isSamePassword) {
        this.logger.warn(`User attempted to change to the same password`, {
          userId,
        });
        throw new ConflictException(
          'New password must be different from current password',
        );
      }

      const hashedNewPassword = await this.hashPassword(newPassword);

      await this.usersService.updateUser(userId, {
        password: hashedNewPassword,
        refreshToken: null,
      });

      return {
        success: true,
        message: 'Password changed successfully',
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Error during password change for user`, {
        userId,
        error,
      });
      throw new InternalServerErrorException('Failed to change password');
    }
  }

  async confirmEmail(tokenString: string) {
    this.logger.info(`Attempting to confirm email with token`);
    try {
      const token = await this.prismaService.emailConfirmationToken.findUnique({
        where: { token: tokenString },
        include: { user: true },
      });

      if (!token) {
        this.logger.warn(`Invalid confirmation token`);
        throw new UnauthorizedException('Invalid confirmation token');
      }

      if (token.expiresAt < new Date()) {
        this.logger.warn(`Confirmation token has expired`, {
          userId: token.userId,
        });
        throw new UnauthorizedException('Confirmation token has expired');
      }

      if (token.isUsed) {
        this.logger.warn(`Confirmation token has already been used`, {
          userId: token.userId,
        });
        throw new ConflictException('Token has already been used');
      }

      if (token.user.isEmailConfirmed) {
        this.logger.warn(`Email is already confirmed for user`, {
          userId: token.userId,
        });
        throw new ConflictException('Email is already confirmed');
      }

      // Mark token as used and confirm user email
      await this.prismaService.$transaction([
        this.prismaService.emailConfirmationToken.update({
          where: { id: token.id },
          data: {
            isUsed: true,
            usedAt: new Date(),
          },
        }),
        this.prismaService.user.update({
          where: { id: token.userId },
          data: { isEmailConfirmed: true },
        }),
      ]);

      return {
        success: true,
        message: 'Email confirmed successfully',
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Error during email confirmation`, { error });
      throw new InternalServerErrorException('Failed to confirm email');
    }
  }

  async resendConfirmationEmail(data: ResendConfirmationDto) {
    this.logger.info(`Attempting to resend confirmation email`, {
      email: data.email,
    });
    // Uniform response so this endpoint cannot be used to tell whether an email
    // is registered or already confirmed.
    const genericResponse = {
      success: true,
      message:
        'If your account requires confirmation, a new link has been sent.',
    };
    try {
      const user = await this.usersService.getUser({ email: data.email });

      if (!user) {
        this.logger.warn(`Resend confirmation requested for unknown email`);
        return genericResponse;
      }

      if (user.isEmailConfirmed) {
        this.logger.warn(`Resend confirmation for already-confirmed user`, {
          userId: user.id,
        });
        return genericResponse;
      }

      // Check if user has requested in the last 30 seconds
      const recentRequest =
        await this.prismaService.emailConfirmationToken.findFirst({
          where: {
            userId: user.id,
            createdAt: {
              gte: new Date(Date.now() - 30 * 1000), // Last 30 seconds
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

      if (recentRequest) {
        // Silently skip within the cooldown without leaking existence/timing.
        this.logger.warn(`User requested confirmation email too soon`, {
          userId: user.id,
        });
        return genericResponse;
      }

      // Invalidate existing unused tokens
      await this.prismaService.emailConfirmationToken.updateMany({
        where: {
          userId: user.id,
          isUsed: false,
        },
        data: {
          isUsed: true,
          usedAt: new Date(),
        },
      });

      const token = await this.createEmailConfirmationToken(user.id);
      await this.emailService.sendConfirmationEmail(user.email, token.token);

      return genericResponse;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to resend confirmation email`, {
        email: data.email,
        error,
      });
      throw new InternalServerErrorException(
        'Failed to resend confirmation email',
      );
    }
  }

  async validateUser(data: LoginUserDto) {
    this.logger.info(`Validating user`, { email: data.email });
    try {
      const user = await this.usersService.getUser({
        email: data.email,
      });
      if (!user) {
        this.logger.warn(`User not found during validation`, {
          email: data.email,
        });
        throw new UnauthorizedException('Invalid email and/or password');
      }

      if (user.userType === 'SYSTEM' || user.userType === 'DEMO') {
        this.logger.warn(`Attempt to login with restricted user type`, {
          email: data.email,
          userType: user.userType,
        });
        throw new UnauthorizedException('Invalid email and/or password');
      }

      const isMatch = await bcrypt.compare(data.password, user.password);
      if (!isMatch) {
        this.logger.warn(`Invalid password attempt`, { email: data.email });
        throw new UnauthorizedException('Invalid email and/or password');
      }

      if (!user.isActive) {
        this.logger.warn(`Attempt to login to disabled account`, {
          email: data.email,
        });
        throw new UnauthorizedException('Account is disabled');
      }

      if (!user.isEmailConfirmed) {
        this.logger.warn(`Attempt to login with unconfirmed email`, {
          email: data.email,
        });
        throw new EmailNotConfirmedException();
      }

      return user;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to validate user`, {
        email: data.email,
        error,
      });
      throw new InternalServerErrorException('Failed to validate user');
    }
  }

  async login(user: UserResponseDto) {
    this.logger.info(`Logging in user`, { userId: user.id, email: user.email });
    try {
      const payload: JwtPayload = {
        sub: user.id,
        email: user.email,
      };

      const access_token = this.jwtService.sign({
        ...payload,
        type: 'access',
      });
      const refresh_token = this.jwtService.sign(
        { ...payload, type: 'refresh' },
        {
          expiresIn: this.configService.get('JWT_REFRESH_EXP') || '30d',
        },
      );

      const hashedRefreshToken = await this.hashRefreshToken(refresh_token);
      await this.usersService.updateUser(user.id, {
        refreshToken: hashedRefreshToken,
        lastLoginAt: new Date(),
      });

      return {
        userId: user.id,
        email: user.email,
        access_token,
        refresh_token,
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to login user`, {
        userId: user.id,
        email: user.email,
        error,
      });
      throw new InternalServerErrorException('Failed to login user');
    }
  }

  async refreshTokens(refreshToken: string) {
    this.logger.info(`Attempting to refresh tokens`);
    let payload: JwtPayload;
    try {
      // verifyAsync (not decode) enforces the signature and expiry, so an
      // expired or tampered refresh token is rejected before any DB lookup.
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken);
    } catch {
      this.logger.warn(`Invalid or expired refresh token`);
      throw new UnauthorizedException('Invalid token');
    }

    // An access token must never be redeemed at the refresh endpoint. Legacy
    // tokens issued before the type claim have no `type` and stay accepted
    // through the migration window.
    if (payload.type === 'access') {
      this.logger.warn(`Access token presented to refresh endpoint`, {
        userId: payload.sub,
      });
      throw new UnauthorizedException('Invalid token');
    }

    try {
      const user = await this.usersService.getUser({ id: payload.sub });
      if (!user || !user.refreshToken) {
        this.logger.warn(
          `No user or refresh token found during token refresh`,
          {
            userId: payload.sub,
          },
        );
        throw new UnauthorizedException('No user or token');
      }

      const isValid = await this.isRefreshTokenMatch(
        refreshToken,
        user.refreshToken,
      );
      if (!isValid) {
        this.logger.warn(`Invalid refresh token attempt`, { userId: user.id });
        throw new UnauthorizedException('Invalid refresh token');
      }

      if (!user.isActive) {
        this.logger.warn(`Attempt to refresh tokens for disabled account`, {
          userId: user.id,
        });
        throw new UnauthorizedException('Account is disabled');
      }

      const access_token = this.jwtService.sign({
        sub: user.id,
        email: user.email,
        type: 'access',
      });

      return { access_token };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to refresh tokens`, {
        userId: payload.sub,
        error,
      });
      throw new InternalServerErrorException('Failed to refresh tokens');
    }
  }

  /**
   * Null the stored refresh token so the current session can no longer be
   * refreshed server-side (used by logout).
   */
  async logout(userId: number) {
    await this.usersService.updateUser(userId, { refreshToken: null });
  }

  /**
   * bcrypt only hashes the first 72 bytes of its input. Every JWT issued to a
   * given user shares an identical 72-byte prefix (header + `sub`/`email`),
   * so hashing the raw token would make all of a user's refresh tokens
   * interchangeable. Hash a SHA-256 digest instead to bind the hash to the
   * whole token.
   */
  private hashRefreshToken(token: string) {
    const digest = crypto.createHash('sha256').update(token).digest('hex');
    return bcrypt.hash(digest, 10);
  }

  private async isRefreshTokenMatch(token: string, storedHash: string) {
    const digest = crypto.createHash('sha256').update(token).digest('hex');
    if (await bcrypt.compare(digest, storedHash)) {
      return true;
    }
    // Legacy fallback: tokens issued before SHA-256 pre-hashing were stored as
    // bcrypt(rawToken). Safe to drop once all such tokens have expired.
    // TODO(2026-09-30): remove the legacy raw-token comparison.
    return bcrypt.compare(token, storedHash);
  }

  async requestPasswordReset(
    data: RequestPasswordResetDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    this.logger.info(`Password reset requested for email`, {
      email: data.email,
    });
    // Always return the same response so an attacker cannot tell whether an
    // email is registered (or was recently used) from this endpoint.
    const genericResponse = {
      success: true,
      message: 'A password reset link has been sent',
    };
    try {
      const user = await this.usersService.getUser({ email: data.email });

      if (!user) {
        this.logger.warn(`Password reset requested for unknown email`);
        return genericResponse;
      }

      // Check if user has requested a reset in the last 30 seconds
      const recentRequest =
        await this.prismaService.passwordResetToken.findFirst({
          where: {
            userId: user.id,
            createdAt: {
              gte: new Date(Date.now() - 30 * 1000), // Last 30 seconds
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

      if (recentRequest) {
        // Silently skip sending a second email within the cooldown, without
        // revealing the account exists or how long is left.
        this.logger.warn(`User requested password reset too soon`, {
          userId: user.id,
        });
        return genericResponse;
      }

      // Invalidate existing unused tokens
      await this.prismaService.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          isUsed: false,
        },
        data: {
          isUsed: true,
          usedAt: new Date(),
        },
      });

      const token = await this.createPasswordResetToken(
        user.id,
        ipAddress,
        userAgent,
      );

      await this.emailService.sendPasswordResetEmail(user.email, token.token);

      return genericResponse;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to request password reset`, {
        email: data.email,
        error,
      });
      throw new InternalServerErrorException(
        'Failed to request password reset',
      );
    }
  }

  async resetPassword(tokenString: string, data: ResetPasswordDto) {
    this.logger.info(`Attempting to reset password with token`);
    try {
      const token = await this.prismaService.passwordResetToken.findUnique({
        where: { token: tokenString },
        include: { user: true },
      });

      if (!token || token.expiresAt < new Date() || token.isUsed) {
        this.logger.warn(`Invalid or expired reset token`);
        throw new UnauthorizedException('Invalid or expired reset token');
      }

      const hashedPassword = await this.hashPassword(data.password);

      // Update password, mark token as used, and invalidate refresh tokens
      await this.prismaService.$transaction([
        this.prismaService.passwordResetToken.update({
          where: { id: token.id },
          data: {
            isUsed: true,
            usedAt: new Date(),
          },
        }),
        this.prismaService.user.update({
          where: { id: token.userId },
          data: {
            password: hashedPassword,
            refreshToken: null, // Invalidate all sessions
          },
        }),
      ]);

      return {
        success: true,
        message: 'Password reset successfully',
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Error during password reset`, { error });
      throw new InternalServerErrorException('Failed to reset password');
    }
  }

  async verifyCaptcha(token: string) {
    this.logger.info(`Verifying CAPTCHA`);
    const secretKey = this.configService.get<string>('RECAPTCHA_SECRET');

    if (!secretKey) {
      this.logger.error(`RECAPTCHA_SECRET not configured`);
      throw new Error('RECAPTCHA_SECRET not configured');
    }

    try {
      const response = await fetch(
        'https://www.google.com/recaptcha/api/siteverify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          // URLSearchParams encodes the values, so a token containing `&`/`=`
          // can't inject extra parameters into the siteverify request.
          body: new URLSearchParams({
            secret: secretKey,
            response: token,
          }).toString(),
        },
      );

      const result = (await response.json()) as RecaptchaResponse;

      if (!result.success) {
        this.logger.warn(`CAPTCHA verification failed`, { result });
        throw new UnauthorizedException('CAPTCHA verification failed');
      }

      // For reCAPTCHA v3, check the score (0.0 = bot, 1.0 = human)
      if (result.score !== undefined && result.score < 0.5) {
        this.logger.warn(`CAPTCHA score too low`, { score: result.score });
        throw new UnauthorizedException(
          'CAPTCHA score too low - suspicious activity detected',
        );
      }

      if (result.action && result.action !== 'demo_login') {
        this.logger.warn(`CAPTCHA action mismatch`, { action: result.action });
        throw new UnauthorizedException('CAPTCHA action mismatch');
      }

      return result;
    } catch (error: unknown) {
      this.logger.error(`Error during CAPTCHA verification`, { error });
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('CAPTCHA verification failed');
    }
  }

  private hashPassword(password: string) {
    return bcrypt.hash(password, 10);
  }

  private createEmailConfirmationToken(userId: number) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    return this.prismaService.emailConfirmationToken.create({
      data: {
        token,
        expiresAt,
        userId,
      },
    });
  }

  private createPasswordResetToken(
    userId: number,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    return this.prismaService.passwordResetToken.create({
      data: {
        token,
        expiresAt,
        userId,
        ipAddress,
        userAgent,
      },
    });
  }
}
