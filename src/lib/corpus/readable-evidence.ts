/** Keep source code and page scaffolding out of passages shown as research evidence. */
export function readableEvidence(value: string | null | undefined): string | null {
  const text = (value || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const codeSignals = [
    /<\/?(?:html|head|body|script|style|div|span|pre|code)\b/i,
    /(?:function\s+\w+\s*\(|const\s+\w+\s*=|var\s+\w+\s*=|import\s+.+\s+from\s+['"]|export\s+(?:default|function|const)\b)/i,
    /(?:\{\s*"[\w-]+"\s*:|\}\s*;|=>\s*\{|document\.(?:querySelector|write)|window\.__)/i,
    /(?:```|&lt;\/?(?:div|script)|\b(?:webpack|__NEXT_DATA__|sourceMappingURL)\b)/i,
  ].filter(pattern => pattern.test(text)).length;
  if (codeSignals > 0 || (text.match(/[{}<>;=]/g) || []).length > Math.max(8, text.length / 35)) return null;
  return text.replace(/<img\b[^>]*>/gi, "").replace(/\s+/g, " ").trim() || null;
}
