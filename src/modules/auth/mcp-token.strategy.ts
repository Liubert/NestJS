import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { Request } from 'express';
import { McpTokensService } from './mcp-tokens.service.js';
import { CurrentUserType } from '../users/types/current-user.type.js';

const TOKEN_PREFIX = 'lmcp_';

@Injectable()
export class McpTokenStrategy extends PassportStrategy(Strategy, 'mcp-token') {
  constructor(private readonly mcpTokensService: McpTokensService) {
    super();
  }

  async validate(req: Request): Promise<CurrentUserType> {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }

    const raw = authHeader.slice(7);
    if (!raw.startsWith(TOKEN_PREFIX)) {
      throw new UnauthorizedException();
    }

    const token = await this.mcpTokensService.validateAndTouch(raw);
    if (!token) throw new UnauthorizedException('Invalid or revoked MCP token');

    return {
      userId: token.userId,
      role: token.user.role,
      email: token.user.email,
      scopes: [],
      isMcpToken: true,
    };
  }
}
