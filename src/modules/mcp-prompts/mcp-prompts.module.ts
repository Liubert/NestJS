import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { McpPromptEntity } from './entities/mcp-prompt.entity.js';
import { McpPromptsService } from './mcp-prompts.service.js';
import { McpPromptsController } from './mcp-prompts.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([McpPromptEntity])],
  controllers: [McpPromptsController],
  providers: [McpPromptsService],
  exports: [McpPromptsService],
})
export class McpPromptsModule {}
