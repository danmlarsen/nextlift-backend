import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { WorkoutsModule } from './workouts/workouts.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { ExercisesModule } from './exercises/exercises.module';
import { LoggerModule } from 'nestjs-pino';
import { EmailModule } from './email/email.module';
import { HealthModule } from './health/health.module';
import { ScheduleModule } from '@nestjs/schedule';
import { minutes, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { BodyMeasurementsModule } from './body-measurements/body-measurements.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
        redact: ['req.headers.authorization', 'req.body.password'],
        autoLogging: {
          ignore: (req) => req.url === '/health', // Don't log health checks
        },
      },
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: minutes(1),
          limit: 60,
        },
      ],
    }),
    PrismaModule,
    WorkoutsModule,
    UsersModule,
    AuthModule,
    ExercisesModule,
    EmailModule,
    HealthModule,
    ScheduleModule.forRoot(),
    BodyMeasurementsModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
