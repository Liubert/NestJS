import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './jwt-strategy.js';
import { RolesGuard } from './roles.guard.js';
import { PasswordResetTokenEntity } from './entities/password-reset-token.entity.js';
import { McpTokenEntity } from './entities/mcp-token.entity.js';
import { McpTokensService } from './mcp-tokens.service.js';
import { McpTokenStrategy } from './mcp-token.strategy.js';
import { McpTokensController } from './mcp-tokens.controller.js';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    ConfigModule,
    TypeOrmModule.forFeature([PasswordResetTokenEntity, McpTokenEntity]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('app.auth.JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
    }),
  ],
  controllers: [AuthController, McpTokensController],
  providers: [
    AuthService,
    JwtStrategy,
    McpTokenStrategy,
    McpTokensService,
    RolesGuard,
  ],
  exports: [JwtModule, RolesGuard],
})
export class AuthModule {}
