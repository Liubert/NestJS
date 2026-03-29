import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { CurrentUser } from './current-user.decorator.js';
import { McpTokensService } from './mcp-tokens.service.js';
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
  constructor(private readonly mcpTokensService: McpTokensService) {}

  @Post()
  @ApiOperation({ summary: 'Generate a new MCP token (shown only once)' })
  generate(
    @Body() dto: CreateMcpTokenDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.mcpTokensService.generate(user.userId, dto.name);
  }

  @Get()
  @ApiOperation({ summary: 'List your MCP tokens' })
  list(@CurrentUser() user: CurrentUserType) {
    return this.mcpTokensService.list(user.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an MCP token' })
  delete(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.mcpTokensService.delete(id, user.userId);
  }
}
