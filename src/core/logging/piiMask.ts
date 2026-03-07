const EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const KR_PHONE_REGEX = /(?:\+82[- ]?)?0?1[0-9][- ]?\d{3,4}[- ]?\d{4}/g;

export function maskPii(input: string): string {
  const maskedEmail = input.replace(EMAIL_REGEX, "[REDACTED_EMAIL]");
  return maskedEmail.replace(KR_PHONE_REGEX, "[REDACTED_PHONE]");
}
