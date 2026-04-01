import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  apiGet,
  apiPost,
  apiPatch,
  apiDelete,
  ApiError,
} from "../api-client.js";

interface WebhookConfig {
  id: string;
  projectId: string;
  url: string;
  description: string | null;
  enabled: boolean;
  events: string[];
  consecutiveFailures: number;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
  autoDisabled: boolean;
  createdAt: string;
}

export function registerWebhookTools(server: McpServer): void {
  server.tool(
    "list_webhooks",
    "List all webhook configurations for a project. Shows URL, enabled status, subscribed events, and delivery health.",
    {
      projectSlug: z.string().describe("Project slug"),
    },
    async ({ projectSlug }) => {
      try {
        const webhooks = await apiGet<WebhookConfig[]>(
          `/translations/projects/${projectSlug}/webhooks`,
        );

        if (webhooks.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No webhooks configured for project "${projectSlug}".\n\nUse create_webhook to add one.`,
              },
            ],
          };
        }

        const lines = [
          `Webhooks for "${projectSlug}" (${webhooks.length}):\n`,
        ];
        for (const wh of webhooks) {
          const status = wh.autoDisabled
            ? "AUTO-DISABLED"
            : wh.enabled
              ? "ENABLED"
              : "DISABLED";
          lines.push(`  [${status}] ${wh.url}`);
          lines.push(`    ID: ${wh.id}`);
          lines.push(`    Events: ${wh.events.join(", ")}`);
          if (wh.description) lines.push(`    Description: ${wh.description}`);
          if (wh.consecutiveFailures > 0) {
            lines.push(
              `    Failures: ${wh.consecutiveFailures} consecutive`,
            );
          }
          if (wh.lastSuccessAt)
            lines.push(`    Last success: ${wh.lastSuccessAt}`);
          lines.push("");
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  server.tool(
    "create_webhook",
    [
      "Register a new outgoing webhook for a project.",
      "The webhook will receive HTTP POST requests when subscribed events occur.",
      "Events are batched -- delivery happens within a ~3 minute window after the first event.",
      "Supported events: translation.created, translation.updated, translation.deleted, translation.auto_translated",
    ].join(" "),
    {
      projectSlug: z.string().describe("Project slug"),
      url: z
        .string()
        .url()
        .describe(
          "Callback URL -- must accept POST requests with JSON body",
        ),
      events: z
        .array(
          z.enum([
            "translation.created",
            "translation.updated",
            "translation.deleted",
            "translation.auto_translated",
          ]),
        )
        .min(1)
        .describe("Events to subscribe to"),
      description: z
        .string()
        .optional()
        .describe("Optional description for this webhook"),
      secret: z
        .string()
        .optional()
        .describe(
          "Optional secret for HMAC-SHA256 signature verification (sent in X-Webhook-Signature header)",
        ),
    },
    async ({ projectSlug, url, events, description, secret }) => {
      try {
        const webhook = await apiPost<WebhookConfig>(
          `/translations/projects/${projectSlug}/webhooks`,
          { url, events, description, secret },
        );

        return {
          content: [
            {
              type: "text" as const,
              text: [
                `Webhook created.`,
                ``,
                `  ID: ${webhook.id}`,
                `  URL: ${webhook.url}`,
                `  Events: ${webhook.events.join(", ")}`,
                `  Status: enabled`,
                ``,
                `Delivery behavior:`,
                `  Events are batched within a 3-minute window.`,
                `  Payload is JSON with an array of events.`,
                secret
                  ? `  Signature: HMAC-SHA256 in X-Webhook-Signature header.`
                  : `  No signature configured.`,
              ].join("\n"),
            },
          ],
        };
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  server.tool(
    "update_webhook",
    "Update an existing webhook configuration. You can change the URL, events, enabled status, description, or secret.",
    {
      projectSlug: z.string().describe("Project slug"),
      webhookId: z.string().describe("Webhook ID"),
      url: z.string().url().optional().describe("New callback URL"),
      events: z
        .array(
          z.enum([
            "translation.created",
            "translation.updated",
            "translation.deleted",
            "translation.auto_translated",
          ]),
        )
        .min(1)
        .optional()
        .describe("New event subscriptions"),
      enabled: z
        .boolean()
        .optional()
        .describe("Enable or disable the webhook"),
      description: z.string().optional().describe("New description"),
      secret: z.string().optional().describe("New HMAC secret"),
    },
    async ({ projectSlug, webhookId, ...updates }) => {
      try {
        const webhook = await apiPatch<WebhookConfig>(
          `/translations/projects/${projectSlug}/webhooks/${webhookId}`,
          updates,
        );

        const status = webhook.autoDisabled
          ? "auto-disabled (re-enable with enabled: true)"
          : webhook.enabled
            ? "enabled"
            : "disabled";

        return {
          content: [
            {
              type: "text" as const,
              text: [
                `Webhook updated.`,
                `  ID: ${webhook.id}`,
                `  URL: ${webhook.url}`,
                `  Events: ${webhook.events.join(", ")}`,
                `  Status: ${status}`,
              ].join("\n"),
            },
          ],
        };
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  server.tool(
    "delete_webhook",
    "Delete a webhook configuration. This permanently removes the webhook and stops all future deliveries.",
    {
      projectSlug: z.string().describe("Project slug"),
      webhookId: z.string().describe("Webhook ID to delete"),
    },
    async ({ projectSlug, webhookId }) => {
      try {
        await apiDelete(
          `/translations/projects/${projectSlug}/webhooks/${webhookId}`,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `Webhook ${webhookId} deleted.`,
            },
          ],
        };
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  server.tool(
    "list_webhook_events",
    "Get the list of supported webhook event types.",
    {},
    async () => {
      return {
        content: [
          {
            type: "text" as const,
            text: [
              `Supported webhook events:`,
              `  - translation.created`,
              `  - translation.updated`,
              `  - translation.deleted`,
              `  - translation.auto_translated (planned)`,
            ].join("\n"),
          },
        ],
      };
    },
  );
}

function errorContent(
  error: unknown,
): { content: { type: "text"; text: string }[] } {
  if (error instanceof ApiError) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error ${error.status}: ${error.message}`,
        },
      ],
    };
  }
  return {
    content: [
      { type: "text" as const, text: `Unexpected error: ${String(error)}` },
    ],
  };
}
