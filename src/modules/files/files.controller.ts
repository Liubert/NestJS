import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { FilesService } from './files.service';

import type { CurrentUserType } from '../users/types/current-user.type';
import { PresignUploadDto } from './dto/presign.dto';
import { CompleteUploadDto } from './dto/complete.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/role.decorator';
import { UserRole } from '../users/types/user-role.enum';
import { RolesGuard } from '../auth/roles.guard';

@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.ADMIN)
  @Post('presign')
  async presign(
    @CurrentUser() user: CurrentUserType,
    @Body() body: PresignUploadDto,
  ) {
    return this.filesService.presignUpload(user, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.ADMIN)
  @Post('complete')
  async complete(
    @CurrentUser() user: CurrentUserType,
    @Body() body: CompleteUploadDto,
  ) {
    return this.filesService.completeUpload(user, body);
  }
}
