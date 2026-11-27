const SENTINEL_VALUES = new Set([
  '0',
  'false',
  'null',
  'undefined',
  'none',
  'empty',
  'unset',
  'changeme',
  'your_api_key',
  'my_gemini_api_key',
  'my_elevenlabs_api_key',
]);

/**
 * Validates that an environment variable holds a real secret/API key rather than
 * an unset runtime sentinel (such as "0", "null", "undefined") or placeholder text.
 */
export function isValidEnvSecret(
  value: string | undefined,
  placeholder?: string
): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < 8) return false;
  const lower = trimmed.toLowerCase();
  if (SENTINEL_VALUES.has(lower)) return false;
  if (placeholder && trimmed === placeholder) return false;
  if (placeholder && lower === placeholder.toLowerCase()) return false;
  return true;
}

/**
 * Sanitizes non-secret environment defaults (base URLs, model names, voice IDs)
 * so sandbox runtime sentinels like "0" never override sensible defaults.
 */
export function sanitizeEnvDefault(value: string | undefined, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (SENTINEL_VALUES.has(trimmed.toLowerCase())) return fallback;
  return trimmed;
}
