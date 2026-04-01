import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac } from 'crypto';
import {
  WebhookEntity,
  WebhookEvent,
  WEBHOOK_EVENTS,
} from './entities/webhook.entity.js';
import { CreateWebhookDto } from './dto/create-webhook.dto.js';
import { UpdateWebhookDto } from './dto/update-webhook.dto.js';

export interface WebhookEventPayload {
  event: WebhookEvent;
  projectId: string;
  projectSlug: string;
  namespace: string;
  key: string;
  locales?: string[];
  environment: 'production' | 'sandbox';
  timestamp: string;
}

interface BufferedBatch {
  webhookId: string;
  webhook: WebhookEntity;
  events: WebhookEventPayload[];
  timer: ReturnType<typeof setTimeout>;
}

const BATCH_WINDOW_MS = 3 * 60 * 1000; // 3 minutes
const DELIVERY_TIMEOUT_MS = 10_000; // 10 second timeout per delivery
const AUTO_DISABLE_THRESHOLD = 10; // disable after 10 consecutive failures

@Injectable()
export class WebhooksService implements OnModuleDestroy {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly batches = new Map<string, BufferedBatch>();

  constructor(
    @InjectRepository(WebhookEntity)
    private readonly webhookRepo: Repository<WebhookEntity>,
  ) {}

  onModuleDestroy(): void {
    // Flush all pending batches on shutdown
    for (const batch of this.batches.values()) {
      clearTimeout(batch.timer);
      void this.deliverBatch(batch);
    }
    this.batches.clear();
  }

  // --- CRUD ----------------------------------------------------------------

  async create(
    projectId: string,
    dto: CreateWebhookDto,
  ): Promise<WebhookEntity> {
    return this.webhookRepo.save(
      this.webhookRepo.create({
        projectId,
        url: dto.url,
        description: dto.description ?? null,
        events: dto.events,
        secret: dto.secret ?? null,
        enabled: dto.enabled ?? true,
      }),
    );
  }

  async findAllForProject(projectId: string): Promise<WebhookEntity[]> {
    return this.webhookRepo.find({
      where: { projectId },
      order: { createdAt: 'ASC' },
    });
  }

  async findOne(id: string, projectId: string): Promise<WebhookEntity> {
    const webhook = await this.webhookRepo.findOne({
      where: { id, projectId },
    });
    if (!webhook) throw new NotFoundException('Webhook not found');
    return webhook;
  }

  async update(
    id: string,
    projectId: string,
    dto: UpdateWebhookDto,
  ): Promise<WebhookEntity> {
    const webhook = await this.findOne(id, projectId);
    Object.assign(webhook, dto);
    // Re-enable if user explicitly sets enabled=true
    if (dto.enabled === true) {
      webhook.autoDisabled = false;
      webhook.consecutiveFailures = 0;
    }
    return this.webhookRepo.save(webhook);
  }

  async remove(id: string, projectId: string): Promise<void> {
    const webhook = await this.findOne(id, projectId);
    await this.webhookRepo.remove(webhook);
    // Clear any buffered events for this webhook
    const batch = this.batches.get(id);
    if (batch) {
      clearTimeout(batch.timer);
      this.batches.delete(id);
    }
  }

  getSupportedEvents(): readonly string[] {
    return WEBHOOK_EVENTS;
  }

  // --- Event dispatch -------------------------------------------------------

  /**
   * Enqueue a webhook event. Does NOT block the caller.
   * Events are batched per webhook with a 3-minute delivery window.
   */
  async emit(event: WebhookEventPayload): Promise<void> {
    const webhooks = await this.webhookRepo.find({
      where: { projectId: event.projectId, enabled: true, autoDisabled: false },
    });

    for (const webhook of webhooks) {
      if (!webhook.events.includes(event.event)) continue;
      this.bufferEvent(webhook, event);
    }
  }

  private bufferEvent(
    webhook: WebhookEntity,
    event: WebhookEventPayload,
  ): void {
    const existing = this.batches.get(webhook.id);
    if (existing) {
      existing.events.push(event);
      return;
    }

    const batch: BufferedBatch = {
      webhookId: webhook.id,
      webhook,
      events: [event],
      timer: setTimeout(() => {
        this.batches.delete(webhook.id);
        void this.deliverBatch(batch);
      }, BATCH_WINDOW_MS),
    };

    this.batches.set(webhook.id, batch);
  }

  private async deliverBatch(batch: BufferedBatch): Promise<void> {
    const { webhook, events } = batch;
    if (!events.length) return;

    const payload = {
      deliveredAt: new Date().toISOString(),
      webhookId: webhook.id,
      projectId: webhook.projectId,
      eventCount: events.length,
      events,
    };

    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Localization-Webhooks/1.0',
      'X-Webhook-Id': webhook.id,
    };

    if (webhook.secret) {
      headers['X-Webhook-Signature'] = createHmac('sha256', webhook.secret)
        .update(body)
        .digest('hex');
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        await this.webhookRepo.update(webhook.id, {
          consecutiveFailures: 0,
          lastSuccessAt: new Date(),
        });
        this.logger.log(
          `Webhook ${webhook.id} delivered ${events.length} events -> ${response.status}`,
        );
      } else {
        await this.recordFailure(webhook, `HTTP ${response.status}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.recordFailure(webhook, msg);
    }
  }

  private async recordFailure(
    webhook: WebhookEntity,
    reason: string,
  ): Promise<void> {
    const failures = webhook.consecutiveFailures + 1;
    const update: Partial<WebhookEntity> = {
      consecutiveFailures: failures,
      lastFailureAt: new Date(),
    };

    if (failures >= AUTO_DISABLE_THRESHOLD) {
      update.autoDisabled = true;
      this.logger.warn(
        `Webhook ${webhook.id} auto-disabled after ${failures} consecutive failures`,
      );
    }

    await this.webhookRepo.update(webhook.id, update);
    this.logger.warn(
      `Webhook ${webhook.id} delivery failed (attempt ${failures}): ${reason}`,
    );
  }
}
