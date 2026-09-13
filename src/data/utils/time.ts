/** Every timestamp in the data layer is an ISO 8601 UTC string. */
export function nowIso(): string {
  return new Date().toISOString()
}

const ISO_8601_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

export function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && ISO_8601_UTC.test(value) && !Number.isNaN(Date.parse(value))
}
