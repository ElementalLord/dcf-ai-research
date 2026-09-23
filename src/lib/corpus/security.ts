import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { CorpusError } from "./errors";

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

export function isPrivateIp(address: string): boolean {
  const normalized = address.toLowerCase();
  if (isIP(normalized) === 4) return isPrivateIpv4(normalized);
  if (isIP(normalized) === 6) {
    if (normalized === "::1" || normalized === "::") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    return mapped ? isPrivateIpv4(mapped) : false;
  }
  return true;
}

export async function assertSafePublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new CorpusError("INVALID_INPUT", "The source URL is invalid.", 400);
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new CorpusError("UNSAFE_URL", "Only HTTP and HTTPS source URLs are allowed.", 400);
  }
  if (url.username || url.password) {
    throw new CorpusError("UNSAFE_URL", "Source URLs cannot contain credentials.", 400);
  }
  if (url.port && !['80', '443'].includes(url.port)) {
    throw new CorpusError("UNSAFE_URL", "Non-standard source URL ports are not allowed.", 400);
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new CorpusError("SSRF_BLOCKED", "Local network source URLs are not allowed.", 403);
  }

  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true }).catch(() => []);
  if (addresses.length === 0) {
    throw new CorpusError("FETCH_FAILED", "The source hostname could not be resolved.", 422);
  }
  if (addresses.some(({ address }) => isPrivateIp(address))) {
    throw new CorpusError("SSRF_BLOCKED", "Private or local network source URLs are not allowed.", 403);
  }
  return url;
}
