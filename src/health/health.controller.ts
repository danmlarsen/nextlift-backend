import {
  Controller,
  Get,
  ServiceUnavailableException,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PrismaService } from 'src/prisma/prisma.service';

@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private prisma: PrismaService) {}

  /**
   * Check basic health status of the API
   */
  @SkipThrottle()
  @Get()
  check() {
    return {
      status: 'ok',
    };
  }

  /**
   * Get detailed health status (auth required)
   * @throws {401} Unauthorized.
   * @throws {503} Database unavailable.
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('detailed')
  async detailed() {
    try {
      // Check database connection
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: 'connected',
        migrations: await this.prisma.$queryRaw`
          SELECT migration_name FROM _prisma_migrations
          ORDER BY finished_at DESC LIMIT 1
        `,
      };
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }
}
