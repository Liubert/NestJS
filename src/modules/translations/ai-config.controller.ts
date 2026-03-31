import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AiConfigService } from './ai-config.service.js';

class UpdateAiConfigDto {
  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  translatePrompt?: string;

  @IsOptional()
  @IsString()
  qualityTranslatePrompt?: string;

  @IsOptional()
  @IsString()
  qualityLanguagePrompt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  greenMinScore?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  yellowMinScore?: number;
}

@ApiTags('ai-config')
@Controller('translations/ai-config')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AiConfigController {
  constructor(private readonly aiConfigService: AiConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Get current AI prompt configuration' })
  getConfig() {
    return this.aiConfigService.getConfig();
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update AI prompt configuration' })
  updateConfig(@Body() dto: UpdateAiConfigDto) {
    return this.aiConfigService.updateConfig(dto);
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset AI prompt configuration to built-in defaults',
  })
  resetToDefaults() {
    return this.aiConfigService.resetToDefaults();
  }
}
