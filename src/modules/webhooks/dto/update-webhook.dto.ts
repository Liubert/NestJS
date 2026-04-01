import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';
import { WEBHOOK_EVENTS, WebhookEvent } from '../entities/webhook.entity.js';

export class UpdateWebhookDto {
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'Must be a valid URL' })
  url?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsIn(WEBHOOK_EVENTS as unknown as string[], { each: true })
  events?: WebhookEvent[];

  @IsOptional()
  @IsString()
  secret?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
