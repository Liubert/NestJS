import type { TransformFnParams } from 'class-transformer';


/**
 * Reusable transform for class-transformer decorators.
 * Trims strings and arrays of strings; returns other values unchanged.
 */
export const trimTransform = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;
