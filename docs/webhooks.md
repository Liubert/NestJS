# Outgoing Webhooks

## Overview

The localization system supports outgoing webhooks -- HTTP callbacks that notify external systems when translation events occur.

When configured, our server sends POST requests to your endpoint with event data.

## Supported Events

| Event | Description | Status |
|-------|-------------|--------|
| `translation.created` | A new translation key was created | Active |
| `translation.updated` | Translation values were updated | Active |
| `translation.deleted` | A translation key was deleted | Active |
| `translation.auto_translated` | AI-generated translation was saved | Planned |

## Configuration

Webhooks are configured per project via the API or MCP tools.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/translations/projects/:slug/webhooks` | List webhooks |
| POST | `/translations/projects/:slug/webhooks` | Create webhook |
| GET | `/translations/projects/:slug/webhooks/supported-events` | List supported events |
| GET | `/translations/projects/:slug/webhooks/:id` | Get webhook details |
| PATCH | `/translations/projects/:slug/webhooks/:id` | Update webhook |
| DELETE | `/translations/projects/:slug/webhooks/:id` | Delete webhook |

### Create Webhook Request

```json
{
  "url": "https://example.com/webhook",
  "events": ["translation.created", "translation.updated"],
  "description": "Notify CI/CD pipeline",
  "secret": "optional-hmac-secret",
  "enabled": true
}
```

### MCP Tools

Agents can manage webhooks using these MCP tools:
- `list_webhooks` -- view all webhooks for a project
- `create_webhook` -- register a new webhook
- `update_webhook` -- modify webhook configuration
- `delete_webhook` -- remove a webhook
- `list_webhook_events` -- see supported event types

## Delivery Behavior

### Batching (3-minute window)

Events are **not delivered immediately**. Instead:

1. When the first event occurs, a 3-minute timer starts
2. Additional events during this window are buffered
3. After 3 minutes, all buffered events are delivered in a single HTTP POST
4. This protects both our system and your endpoint from burst traffic

Example: 200 translation updates in 1 minute result in 1 webhook delivery with 200 events.

### Payload Structure

```json
{
  "deliveredAt": "2026-04-01T12:00:00.000Z",
  "webhookId": "uuid",
  "projectId": "uuid",
  "eventCount": 3,
  "events": [
    {
      "event": "translation.updated",
      "projectId": "uuid",
      "projectSlug": "my-project",
      "namespace": "common",
      "key": "save_button",
      "locales": ["uk", "nb-NO"],
      "environment": "production",
      "timestamp": "2026-04-01T11:57:30.000Z"
    }
  ]
}
```

### Signature Verification

If a `secret` is configured, each delivery includes an `X-Webhook-Signature` header:

```
X-Webhook-Signature: hmac-sha256-hex-digest
```

Verify by computing `HMAC-SHA256(secret, request_body)` and comparing.

### Headers

Every webhook delivery includes:
- `Content-Type: application/json`
- `User-Agent: Localization-Webhooks/1.0`
- `X-Webhook-Id: <webhook-uuid>`
- `X-Webhook-Signature: <hmac>` (if secret configured)

## Reliability

### Timeout
Each delivery has a 10-second timeout. Slow endpoints will be treated as failures.

### Failure Handling
- Failed deliveries increment a consecutive failure counter
- After **10 consecutive failures**, the webhook is automatically disabled (`autoDisabled: true`)
- Auto-disabled webhooks stop receiving events
- Re-enable by updating the webhook with `enabled: true` -- this resets the failure counter

### No Retries (Phase 1)
Failed batch deliveries are not retried. Events from a failed delivery are lost.
Retries with exponential backoff are planned for a future phase.

## Best Practices

1. **Respond quickly** -- return 2xx within 10 seconds
2. **Process asynchronously** -- queue webhook payloads for later processing
3. **Use HMAC verification** -- set a secret to verify payload authenticity
4. **Monitor failures** -- check `consecutiveFailures` via API or MCP
5. **Handle batches** -- your endpoint may receive 1 to hundreds of events per delivery
