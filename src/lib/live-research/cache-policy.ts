export function isFreshCacheRecord(
  record: { fetch_status: string; expires_at: string; source_id: string | null },
  now = new Date(),
): boolean {
  return record.fetch_status === "ready" && Boolean(record.source_id) && new Date(record.expires_at) > now;
}
