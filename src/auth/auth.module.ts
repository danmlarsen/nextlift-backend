import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from 'src/users/users.module';
import { PassportModule } from '@nestjs/passport';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EmailModule } from 'src/email/email.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { DemoService } from './demo.service';
import { PersonalRecordsModule } from 'src/personal-records/personal-records.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow('JWT_SECRET'),
        signOptions: { expiresIn: configService.get('JWT_EXP') || '15m' },
      }),
    }),
    EmailModule,
    PersonalRecordsModule,
  ],
  providers: [AuthService, LocalStrategy, JwtStrategy, DemoService],
  controllers: [AuthController],
})
export class AuthModule {}
