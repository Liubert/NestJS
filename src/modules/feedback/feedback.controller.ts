import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/role.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserType } from '../users/types/current-user.type.js';
import { UserRole } from '../users/types/user-role.enum.js';
import { FeedbackService } from './feedback.service.js';
import { CreateFeedbackDto } from './dto/create-feedback.dto.js';
import { QueryFeedbackDto } from './dto/query-feedback.dto.js';
import { ReviewFeedbackDto } from './dto/review-feedback.dto.js';

@ApiTags('feedback')
@Controller('feedback')
@ApiBearerAuth()
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Submit feedback' })
  async create(
    @Body() dto: CreateFeedbackDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.feedbackService.create(dto, user);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List feedback (admin)' })
  async findAll(@Query() query: QueryFeedbackDto) {
    return this.feedbackService.findAll(query);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Review feedback (admin)' })
  async markReviewed(@Param('id') id: string, @Body() dto: ReviewFeedbackDto) {
    return this.feedbackService.markReviewed(id, dto);
  }
}
