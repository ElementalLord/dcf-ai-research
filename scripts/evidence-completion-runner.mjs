// Citation-first evidence completion for any personality (requires `next dev` or a deployed admin API).
//   node --env-file=.env.local scripts/evidence-completion-runner.mjs queue "<Canonical Name>" [limit]
//   node --env-file=.env.local scripts/evidence-completion-runner.mjs dry-run "<Canonical Name>" [maxLocations]
//   node --env-file=.env.local scripts/evidence-completion-runner.mjs run "<Canonical Name>" [maxLocations] [braveBudget] [--retry-stable-failures] [--refresh-acquired] [--reassess-links]
import http from "node:http";
import https from "node:https";
import { createClient } from "@supabase/supabase-js";

const API_BASE = process.env.CORPUS_API_BASE || "http://localhost:3000";

async function personalityId(name) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await supabase.from("personalities").select("id").eq("canonical_name", name).single();
  if (error) throw new Error(`Personality "${name}" not found: ${error.message}`);
  return data.id;
}

// Plain node:http: an evidence run downloads documents and may take many minutes before responding,
// longer than fetch's default header timeout.
function api(path, init = {}) {
  const url = new URL(path, API_BASE);
  const headers = { "content-type": "application/json" };
  if (process.env.CORPUS_ADMIN_TOKEN) headers.authorization = `Bearer ${process.env.CORPUS_ADMIN_TOKEN}`;
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(url, { method: init.method || "GET", headers, timeout: 0 }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (part) => { raw += part; });
      response.on("end", () => {
        let body = {};
        try { body = JSON.parse(raw); } catch { /* non-JSON error page */ }
        if (response.statusCode >= 400) reject(new Error(`${response.statusCode} ${body?.error?.code || "REQUEST_FAILED"}: ${body?.error?.message || raw.slice(0, 200)}`));
        else resolve(body);
      });
    });
    request.on("error", reject);
    if (init.body) request.write(init.body);
    request.end();
  });
}

async function main() {
  const [action = "queue", name, first, second] = process.argv.slice(2);
  if (!name) throw new Error("Usage: evidence-completion-runner.mjs <queue|dry-run|run> \"<Canonical Name>\" [n] [braveBudget]");
  const id = await personalityId(name);
  if (action === "queue") return console.log(JSON.stringify(await api(`/api/corpus/evidence-completion?personalityId=${id}&limit=${Number(first || 30)}`), null, 2));
  if (action === "dry-run" || action === "run") {
    const report = await api("/api/corpus/evidence-completion", { method: "POST", body: JSON.stringify({
      personalityId: id, maxLocations: Number(first || 30), braveBudget: action === "run" ? Number(second || 0) : 0, dryRun: action === "dry-run",
      retryStableFailures: process.argv.includes("--retry-stable-failures"), refreshAcquired: process.argv.includes("--refresh-acquired"),
      reassessLinks: process.argv.includes("--reassess-links") }) });
    return console.log(JSON.stringify(report, null, 2));
  }
  throw new Error(`Unknown action ${action}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
