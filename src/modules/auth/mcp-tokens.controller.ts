import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { CurrentUser } from './current-user.decorator.js';
import { McpTokensService } from './mcp-tokens.service.js';
import { AuditLogService } from '../../common/audit/audit-log.service.js';
import type { RequestWithMetadata } from '../../common/middleware/logger.middleware.js';
import type { CurrentUserType } from '../users/types/current-user.type.js';

class CreateMcpTokenDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  name!: string;
}

@ApiTags('mcp-tokens')
@Controller('mcp-tokens')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class McpTokensController {
  constructor(
    private readonly mcpTokensService: McpTokensService,
    private readonly audit: AuditLogService,
  ) {}

  // Audit: token creation is security-relevant (token shown only once, then hashed)
  @Post()
  @Throttle({ default: { ttl: seconds(60), limit: 10 } })
  @ApiOperation({ summary: 'Generate a new MCP token (shown only once)' })
  async generate(
    @Body() dto: CreateMcpTokenDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: RequestWithMetadata,
  ) {
    const result = await this.mcpTokensService.generate(user.userId, dto.name);
    this.audit.log({
      action: 'mcp_token.created',
      actorId: user.userId,
      actorRole: user.role,
      targetType: 'mcp_token',
      targetId: result.id,
      outcome: 'success',
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
      ip: req.ip ?? 'unknown',
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  @Get()
  @ApiOperation({ summary: 'List your MCP tokens' })
  list(@CurrentUser() user: CurrentUserType) {
    return this.mcpTokensService.list(user.userId);
  }

  // Audit: token revocation — important for incident investigation
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an MCP token' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
    @Req() req: RequestWithMetadata,
  ) {
    await this.mcpTokensService.delete(id, user.userId);
    this.audit.log({
      action: 'mcp_token.revoked',
      actorId: user.userId,
      actorRole: user.role,
      targetType: 'mcp_token',
      targetId: id,
      outcome: 'success',
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
      ip: req.ip ?? 'unknown',
      userAgent: req.headers['user-agent'],
    });
  }
}
