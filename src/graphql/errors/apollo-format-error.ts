import { GraphQLError, GraphQLFormattedError } from 'graphql';
import { formatGraphQLError } from './format-error';

export const apolloFormatError = (
  formattedError: GraphQLFormattedError,
  error: unknown,
): GraphQLFormattedError => {
  if (error instanceof GraphQLError) return formatGraphQLError(error);
  return formattedError;
};
