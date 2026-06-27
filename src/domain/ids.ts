/**
 * Purpose: Generates stable local IDs for scene documents and objects.
 *
 * Public API: makeId(prefix), nowIso().
 *
 * Upstream deps: Web Crypto when available, Date fallback.
 *
 * Downstream consumers: scene construction, imports, editor commands, sharing.
 *
 * Failure modes: falls back to timestamp and random number if crypto.randomUUID
 *                is unavailable; IDs remain locally unique enough for offline use.
 *
 * Performance: standard.
 */

export function makeId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

  return `${prefix}_${random}`
}

export function nowIso(): string {
  return new Date().toISOString()
}
