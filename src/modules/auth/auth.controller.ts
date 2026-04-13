import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { IsEmail, IsString, Length, MinLength } from 'class-validator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { CurrentUser } from './current-user.decorator.js';
import { AuditLogService } from '../../common/audit/audit-log.service.js';
import type { RequestWithMetadata } from '../../common/middleware/logger.middleware.js';
import type { CurrentUserType } from '../users/types/current-user.type.js';

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(8, 128)
  password!: string;
}

class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly audit: AuditLogService,
  ) {}

  // Strict rate limit: 5 login attempts per minute per IP (brute-force protection)
  // Audit: logs both successful and failed login attempts
  @Post('login')
  @Throttle({ default: { ttl: seconds(60), limit: 5 } })
  async login(@Body() body: LoginDto, @Req() req: RequestWithMetadata) {
    try {
      const result = await this.authService.login(body);
      this.audit.log({
        action: 'auth.login_success',
        actorId: result.user.id,
        actorRole: result.user.role,
        targetType: 'user',
        targetId: result.user.id,
        outcome: 'success',
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId,
        ip: req.ip ?? 'unknown',
        userAgent: req.headers['user-agent'],
      });
      return result;
    } catch (err) {
      // Only audit expected auth failures, not DB outages or internal errors
      const isAuthError = err instanceof UnauthorizedException;
      this.audit.log({
        action: 'auth.login_failed',
        actorId: null,
        actorRole: null,
        targetType: 'user',
        targetId: 'unknown',
        outcome: 'failure',
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId,
        ip: req.ip ?? 'unknown',
        userAgent: req.headers['user-agent'],
        reason: isAuthError ? 'invalid_credentials' : 'internal_error',
      });
      throw err;
    }
  }

  // Strict rate limit: 3 per minute (prevents email enumeration / spam)
  @Post('forgot-password')
  @Throttle({ default: { ttl: seconds(60), limit: 3 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a password reset token',
    description:
      'PHASE 1 (temporary): returns the raw token in the response. ' +
      'Phase 2 will send the token by email instead.',
  })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  // Audit: password reset is security-sensitive (public endpoint, token-based)
  @Post('reset-password')
  @Throttle({ default: { ttl: seconds(60), limit: 5 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reset password using a valid reset token' })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() req: RequestWithMetadata,
  ): Promise<void> {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    this.audit.log({
      action: 'auth.password_reset_completed',
      actorId: null, // unauthenticated — user identified by token only
      actorRole: null,
      targetType: 'user',
      targetId: 'token-based', // don't expose which user — token is the proof
      outcome: 'success',
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
      ip: req.ip ?? 'unknown',
      userAgent: req.headers['user-agent'],
    });
  }

  // Audit: password change while authenticated — tracks credential rotation
  @Post('change-password')
  @Throttle({ default: { ttl: seconds(60), limit: 5 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Change password while authenticated' })
  async changePassword(
    @CurrentUser() user: CurrentUserType,
    @Body() dto: ChangePasswordDto,
    @Req() req: RequestWithMetadata,
  ): Promise<void> {
    await this.authService.changePassword(
      user.userId,
      dto.currentPassword,
      dto.newPassword,
    );
    this.audit.log({
      action: 'auth.password_changed',
      actorId: user.userId,
      actorRole: user.role,
      targetType: 'user',
      targetId: user.userId,
      outcome: 'success',
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
      ip: req.ip ?? 'unknown',
      userAgent: req.headers['user-agent'],
    });
  }
}
