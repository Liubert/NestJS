import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { FilesService } from './files.service';
import { PresignUploadDto } from './dto/presign.dto';
import { CompleteUploadDto } from './dto/complete.dto';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('files')
@UseGuards(AuthGuard('jwt'))
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('presign')
  async presign(
    @CurrentUser() user: { userId: string },
    @Body() dto: PresignUploadDto,
  ) {
    console.log('0-user');
    console.log(user);
    return this.filesService.presign(user, dto);
  }

  @Post('complete')
  async complete(
    @CurrentUser() user: { userId: string },
    @Body() dto: CompleteUploadDto,
  ) {
    return this.filesService.complete(user.userId, {
      fileId: dto.fileId,
      entityId: dto.entityId,
    });
  }
}
