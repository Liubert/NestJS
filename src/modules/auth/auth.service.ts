import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';

import { UsersService } from '../users/users.service.js';
import { JwtPayload } from './types/jwt-payload.type.js';
import { PasswordResetTokenEntity } from './entities/password-reset-token.entity.js';

type LoginDto = {
  email: string;
  password: string;
};

const RESET_TOKEN_TTL_HOURS = 1;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @InjectRepository(PasswordResetTokenEntity)
    private readonly resetTokenRepo: Repository<PasswordResetTokenEntity>,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmailWithSensitiveData(
      dto.email,
    );

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      email: user.email,
      scopes: [],
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  // ─── Forgot password ────────────────────────────────────────────────────────
  // PHASE 1 (temporary): returns raw token in response — admin passes it to user manually.
  // PHASE 2: replace return with email send, return { message: 'Email sent' }.
  // The token table, hash logic, and reset endpoint are already final.
  async forgotPassword(
    email: string,
  ): Promise<{ token: string; note: string }> {
    const user = await this.usersService.findByEmail(email);

    // Always return success-looking response to avoid user enumeration
    const dummyNote =
      'TEMPORARY: In production, this token would be emailed. ' +
      'Pass it to the user via a secure channel.';

    if (!user) {
      return { token: '', note: dummyNote };
    }

    // Invalidate previous unused tokens for this user
    await this.resetTokenRepo.delete({ userId: user.id, usedAt: IsNull() });

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(
      Date.now() + RESET_TOKEN_TTL_HOURS * 60 * 60 * 1000,
    );

    await this.resetTokenRepo.save(
      this.resetTokenRepo.create({
        userId: user.id,
        tokenHash,
        expiresAt,
        usedAt: null,
      }),
    );

    return { token: rawToken, note: dummyNote };
  }

  // ─── Reset password ─────────────────────────────────────────────────────────
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const record = await this.resetTokenRepo.findOne({
      where: { tokenHash },
    });

    if (!record) {
      throw new BadRequestException('Invalid or expired reset token');
    }
    if (record.usedAt) {
      throw new BadRequestException('Reset token has already been used');
    }
    if (record.expiresAt < new Date()) {
      throw new BadRequestException('Reset token has expired');
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await this.usersService.updatePassword(record.userId, newHash);

    // Mark token as used
    await this.resetTokenRepo.update(record.id, { usedAt: new Date() });
  }

  // ─── Change password (authenticated) ────────────────────────────────────────
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.usersService.findByIdWithSensitiveData(userId);
    if (!user) throw new UnauthorizedException('User not found');

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      throw new BadRequestException('Current password is incorrect');
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await this.usersService.updatePassword(userId, newHash, false);
  }
}
