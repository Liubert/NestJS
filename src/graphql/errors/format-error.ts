import { GraphQLError, GraphQLFormattedError } from 'graphql';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const asStringArray = (v: unknown): string[] => {
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v;
  if (typeof v === 'string') return [v];
  return [];
};

const getBadRequestMessages = (err: GraphQLError): string[] => {
  const original = err.extensions?.originalError;
  if (!isRecord(original)) return [err.message];

  return asStringArray(original['message']).length
    ? asStringArray(original['message'])
    : [err.message];
};

export const formatGraphQLError = (
  err: GraphQLError,
): GraphQLFormattedError => {
  // 1) Only special-case ValidationPipe → nice validation output
  if (err.extensions?.code === 'BAD_REQUEST') {
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

  // 2) Everything else: keep default message/code,
  // but avoid leaking details from Nest HTTP exceptions if present.
  const original = err.extensions?.originalError;

  // If this is a Nest HTTP exception, it often has statusCode/message/etc.
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

  // Otherwise return as-is (but keep it formatted)
  return {
    message: err.message || 'Internal server error',
    extensions: {
      code: err.extensions?.code ?? 'INTERNAL_SERVER_ERROR',
    },
    path: err.path,
  };
};
