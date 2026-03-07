export function codePointLength(value: string): number {
  return [...value].length;
}

export type LengthValidationOptions = {
  min: number;
  max: number;
};

export function trimAndValidateLength(input: string, options: LengthValidationOptions): {
  trimmed: string;
  length: number;
} {
  const trimmed = input.trim();
  const length = codePointLength(trimmed);

  if (length < options.min || length > options.max) {
    throw new Error(`Length validation failed: expected ${options.min}..${options.max}, got ${length}`);
  }

  return { trimmed, length };
}
