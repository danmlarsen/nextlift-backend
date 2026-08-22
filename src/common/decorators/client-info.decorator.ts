import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface ClientInfo {
  ip: string;
  userAgent: string;
}

export const ClientInfo = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): ClientInfo => {
    const request = ctx.switchToHttp().getRequest<Request>();

    // request.ip is derived by Express from X-Forwarded-For using the
    // configured `trust proxy` setting (see main.ts), so it reflects the real
    // client IP behind Fly's proxy and cannot be spoofed by an extra header.
    const ip = request.ip || request.socket.remoteAddress || 'Unknown';

    const userAgent = request.get('User-Agent') || 'Unknown';

    return { ip, userAgent };
  },
);
