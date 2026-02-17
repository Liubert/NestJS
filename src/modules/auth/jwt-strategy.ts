import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  sub: string;
  role: 'user' | 'admin';
}

export interface AuthUser {
  userId: string;
  role: 'user' | 'admin';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET ?? 'dev-secret',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    return {
      userId: payload.sub,
      role: payload.role,
    };
  }
}
