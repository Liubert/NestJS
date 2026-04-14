import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/role.decorator.js';
import { UserRole } from '../users/types/user-role.enum.js';
import { AiConfigService } from './ai-config.service.js';
import { AiTranslateService } from './ai-translate.service.js';

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
  @IsString()
  contextDetectionPrompt?: string;
}

class ValidateModelDto {
  @IsString()
  @IsNotEmpty()
  model!: string;
}

@ApiTags('ai-config')
@Controller('translations/ai-config')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AiConfigController {
  constructor(
    private readonly aiConfigService: AiConfigService,
    private readonly aiTranslateService: AiTranslateService,
  ) {}

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

  @Post('validate-model')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Validate that a model ID is usable — checks JSON contract compatibility only, not quality',
  })
  async validateModel(@Body() dto: ValidateModelDto) {
    const result = await this.aiTranslateService.validateModel(dto.model);
    if (!result.valid) {
      throw new BadRequestException(
        result.error ?? 'Model returned an incompatible response format',
      );
    }
    return { valid: true };
  }
}
