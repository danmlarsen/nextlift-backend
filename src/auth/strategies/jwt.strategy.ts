import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from 'src/common/types/auth-user.interface';
import { JwtPayload } from 'src/common/types/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow('JWT_SECRET'),
    });
  }

  validate(payload: JwtPayload): AuthUser {
    // Only access tokens may authorize requests; a refresh token (or any
    // legacy token issued before the type claim) must not pass the guard.
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }
    return { id: payload.sub, email: payload.email };
  }
}
