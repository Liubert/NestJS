/**
 * Structured audit event for security-critical actions.
 *
 * Every audit log answers: who did what, to what, when, and with what result.
 * Sensitive data (passwords, tokens, JWTs) must NEVER appear in audit events.
 */
export type AuditEvent = {
  action: string; // e.g. 'auth.login_failed', 'user.admin_created'
  actorId: string | null; // userId or null for unauthenticated actions
  actorRole: string | null; // user role at the time of action
  targetType: string; // e.g. 'user', 'mcp_token'
  targetId: string; // id of the affected entity
  outcome: 'success' | 'failure' | 'denied';
  timestamp: string; // ISO 8601
  correlationId: string; // links audit event to HTTP request logs
  ip?: string;
  userAgent?: string;
  reason?: string; // optional context, e.g. 'wrong password'
};

/**
 * Minimal request metadata passed from controllers to audit logging.
 * Extracted from RequestWithMetadata in logger.middleware.
 */
export type RequestMeta = {
  correlationId: string;
  ip: string;
  userAgent?: string;
};
