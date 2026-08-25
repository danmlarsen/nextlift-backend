import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import {
  createSwaggerConfig,
  documentOptions,
  moduleOptions,
} from './swagger-config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  // Trust exactly one proxy hop (Fly's edge). This makes request.ip the real
  // client IP from X-Forwarded-For while ignoring any client-supplied XFF
  // prefix, so throttling and demo per-IP limits key on the actual caller.
  app.set('trust proxy', 1);
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.useLogger(app.get(Logger));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      // Reject unknown properties with 400 instead of silently stripping them.
      // Verified safe: every frontend payload sends only declared DTO fields.
      forbidNonWhitelisted: true,
    }),
  );
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin:
      process.env.NODE_ENV === 'production'
        ? process.env.CORS_ORIGIN?.split(',')
        : true,
    credentials: true,
    // Avoid repeating the preflight request for every API call.
    maxAge: 600,
  });

  const swaggerConfig = createSwaggerConfig();
  const documentFactory = () =>
    SwaggerModule.createDocument(app, swaggerConfig, documentOptions);
  SwaggerModule.setup('api', app, documentFactory, moduleOptions);

  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap().catch((error) => {
  console.error('Fatal error during bootstrap', error);
  process.exit(1);
});
