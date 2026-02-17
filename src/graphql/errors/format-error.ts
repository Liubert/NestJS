import { GraphQLError, GraphQLFormattedError } from 'graphql';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const asStringArray = (v: unknown): string[] => {
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v;
  if (typeof v === 'string') return [v];
  return [];
};

const isBadRequest400 = (err: GraphQLError): boolean => {
  const original = err.extensions?.originalError;
  return isRecord(original) && original['statusCode'] === 400;
};

const getBadRequestMessages = (err: GraphQLError): string[] => {
  const original = err.extensions?.originalError;
  if (!isRecord(original)) return [err.message];

  const msgs = asStringArray(original['message']);
  return msgs.length ? msgs : [err.message];
};

export const formatGraphQLError = (
  err: GraphQLError,
): GraphQLFormattedError => {
  // 1) ValidationPipe / BadRequestException => BAD_USER_INPUT
  if (isBadRequest400(err)) {
    const messages = getBadRequestMessages(err);

    return {
      message: 'Validation failed',
      extensions: {
        ...(err.extensions ?? {}),
        code: 'BAD_USER_INPUT',
        messages,
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
