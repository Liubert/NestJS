import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentFeedbackEntity } from './entities/agent-feedback.entity.js';
import { ProjectEntity } from '../translations/entities/project.entity.js';
import { UserEntity } from '../users/user.entity.js';
import { FeedbackService } from './feedback.service.js';
import { FeedbackController } from './feedback.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentFeedbackEntity, ProjectEntity, UserEntity]),
  ],
  controllers: [FeedbackController],
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
