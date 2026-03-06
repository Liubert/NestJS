import { GraphQLError, GraphQLFormattedError } from 'graphql';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const asStringArray = (v: unknown): string[] => {
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v;
  if (typeof v === 'string') return [v];
  return [];
};

const getErrorPayload = (err: GraphQLError): Record<string, unknown> | null => {
  const original = (err as GraphQLError & { originalError?: unknown })
    .originalError;
  const source = original ?? err.extensions?.originalError;
  if (!isRecord(source)) return null;

  const getResponse = source['getResponse'];
  if (typeof getResponse === 'function') {
    const response = (getResponse as () => unknown).call(source);
    if (isRecord(response)) return response;
  }

  const response = source['response'];
  if (isRecord(response)) return response;

  return source;
};

const isBadRequest400 = (err: GraphQLError): boolean => {
  const payload = getErrorPayload(err);
  return isRecord(payload) && payload['statusCode'] === 400;
};

const getBadRequestMessages = (err: GraphQLError): string[] => {
  const payload = getErrorPayload(err);
  if (!isRecord(payload)) return [err.message];

  const msgs = asStringArray(payload['message']);
  return msgs.length ? msgs : [err.message];
};

const toValidationPayload = (messages: string[]) =>
  messages.map((msg) => {
    const match = /^([A-Za-z0-9_.[\]-]+)\s+(.+)$/.exec(msg.trim());
    return match
      ? { field: match[1], message: match[2] }
      : { field: 'input', message: msg };
  });

export const formatGraphQLError = (
  err: GraphQLError,
): GraphQLFormattedError => {
  // 1) ValidationPipe / BadRequestException => BAD_USER_INPUT
  if (isBadRequest400(err)) {
    const messages = getBadRequestMessages(err);

    return {
      message: 'Validation failed',
      extensions: {
        code: 'BAD_USER_INPUT',
        messages,
        validation: toValidationPayload(messages),
      },
      path: err.path,
    };
  }

  // 2) Other Nest HTTP exceptions: don't leak extra fields
  const original = err.extensions?.originalError;
  if (isRecord(original) && typeof original['statusCode'] === 'number') {
    const messages = asStringArray(original['message']);
    const message = messages.length ? messages.join(', ') : err.message;

    return {
      message,
      extensions: {
        code: err.extensions?.code ?? 'INTERNAL_SERVER_ERROR',
      },
      path: err.path,
    };
  }

  // 3) Default
  return {
    message: err.message || 'Internal server error',
    extensions: {
      code: err.extensions?.code ?? 'INTERNAL_SERVER_ERROR',
    },
    path: err.path,
  };
};
