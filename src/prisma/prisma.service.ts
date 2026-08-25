import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
// Prisma connects lazily on the first query. Keep startup independent of the
// scale-to-zero database so Fly can mark the HTTP service healthy immediately.
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
