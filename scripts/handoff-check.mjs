// Ownership-transfer readiness check. Read-only: it never prints secret values.
//
//   npm run handoff:check                       # repository + .env.local checks
//   npm run handoff:check -- https://site.app   # also checks the live deployment
//
// Exit code 1 when any check fails; warnings do not fail the run.
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const siteUrl = (process.argv[2] || "").replace(/\/$/, "");
const results = [];
const pass = (name, detail = "") => results.push({ level: "PASS", name, detail });
const warn = (name, detail) => results.push({ level: "WARN", name, detail });
const fail = (name, detail) => results.push({ level: "FAIL", name, detail });
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

// --- 1. Repository hygiene ----------------------------------------------------
const tracked = git("ls-files").split("\n").filter(Boolean);
const secretFiles = tracked.filter((f) => /(^|\/)\.env(?!\.example$)|\.admin-access-key$|\.pem$|(^|\/)\.vercel\//.test(f));
if (secretFiles.length) fail("No secret files tracked", secretFiles.join(", "));
else pass("No secret files tracked");

const secretPatterns = [
  ["Google API key", /AIza[0-9A-Za-z_-]{35}/],
  ["Supabase secret key", /sb_secret_[0-9A-Za-z_-]{20,}/],
  ["JWT (possible service_role key)", /eyJhbGciOi[0-9A-Za-z_-]{10,}\.eyJ[0-9A-Za-z_-]{20,}\.[0-9A-Za-z_-]{20,}/],
  ["Private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];
const history = git("log", "--all", "-p", "--no-color");
const leaks = secretPatterns.filter(([, re]) => re.test(history)).map(([name]) => name);
if (leaks.length) fail("No secrets anywhere in git history", `${leaks.join(", ")} found — rotate them; rewriting history does not un-leak a public repo`);
else pass("No secrets anywhere in git history");

const status = git("status", "--porcelain").trim();
if (status) warn("Working tree clean", "uncommitted changes will not transfer");
else pass("Working tree clean");

const branches = git("branch", "-r").split("\n").map((b) => b.trim()).filter((b) => b && !/->|\/main$/.test(b));
if (branches.length) warn("Only main remains", `merge or delete before transfer: ${branches.join(", ")}`);
else pass("Only main remains");

const authorEmails = [...new Set(git("log", "--all", "--format=%ae").split("\n").filter(Boolean))].filter((e) => !/noreply/.test(e));
if (authorEmails.length) warn("Commit author emails", `${authorEmails.length} non-noreply address(es) in history stay visible after transfer`);
else pass("Commit author emails");

// --- 2. Environment (.env.local or process env) -------------------------------
const envText = await readFile(new URL("../.env.local", import.meta.url), "utf8").catch(() => "");
const env = { ...Object.fromEntries(envText.split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")])), ...process.env };
if (!envText) warn(".env.local present", "not found; checking process environment only");

const required = {
  NEXT_PUBLIC_SUPABASE_URL: /^https:\/\/[a-z0-9]{20}\.supabase\.co$/,
  SUPABASE_SERVICE_ROLE_KEY: /^(sb_secret_|eyJ)/,
  CORPUS_ADMIN_TOKEN_HASH: /^[a-f0-9]{64}$/i,
  ADMIN_SESSION_SECRET: /^(?:[a-f0-9]{2}){32,}$/i,
};
for (const [name, re] of Object.entries(required)) {
  if (!env[name]) fail(`${name} set`, "missing");
  else if (!re.test(env[name])) fail(`${name} format`, "value does not have the expected shape");
  else pass(`${name} set`);
}
for (const name of ["GEMINI_API_KEY", "BRAVE_SEARCH_API_KEY"]) {
  if (env[name]) pass(`${name} set`);
  else warn(`${name} set`, "optional; Ask falls back to extractive answers");
}
const leakedPublic = Object.keys(env).filter((k) => k.startsWith("NEXT_PUBLIC_") && k !== "NEXT_PUBLIC_SUPABASE_URL");
if (leakedPublic.length) fail("No extra NEXT_PUBLIC_ variables", `${leakedPublic.join(", ")} would be shipped to browsers`);
else pass("No extra NEXT_PUBLIC_ variables");
if (env.CORPUS_ADMIN_TOKEN) warn("Plain CORPUS_ADMIN_TOKEN", "only scripts need it; never set it in Vercel");

// --- 3. Migrations -------------------------------------------------------------
const migrations = tracked.filter((f) => /^supabase\/migrations\/\d{14}_.+\.sql$/.test(f)).sort();
const latest = migrations.at(-1)?.split("/").pop();
pass("Migrations listed", `${migrations.length} files; newest ${latest}. Confirm it is applied before handing over`);

// --- 4. Live deployment (optional) --------------------------------------------
if (siteUrl) {
  try {
    const home = await fetch(siteUrl, { redirect: "manual" });
    if (home.ok) pass("Live site responds", `${home.status}`);
    else fail("Live site responds", `${home.status}`);
    const h = home.headers;
    for (const key of ["x-content-type-options", "x-frame-options", "referrer-policy", "strict-transport-security"]) {
      if (h.get(key)) pass(`Header ${key}`);
      else warn(`Header ${key}`, "missing (deploy the latest main)");
    }
    if (h.get("x-powered-by")) warn("x-powered-by hidden", "still sent");
    else pass("x-powered-by hidden");

    const resources = await fetch(`${siteUrl}/api/resources`);
    if (resources.status === 401) pass("Admin API rejects anonymous calls");
    else fail("Admin API rejects anonymous calls", `got ${resources.status}`);

  } catch (error) {
    fail("Live site reachable", error instanceof Error ? error.message : String(error));
  }
} else {
  warn("Live checks", "skipped; pass the deployment URL to include them");
}

// --- Report -------------------------------------------------------------------
const icon = { PASS: "✔", WARN: "!", FAIL: "✘" };
for (const r of results) console.log(`${icon[r.level]} ${r.level.padEnd(4)} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
const failed = results.filter((r) => r.level === "FAIL").length;
console.log(`\n${failed ? `${failed} check(s) failed.` : "No blocking issues."} ${results.filter((r) => r.level === "WARN").length} warning(s).`);
process.exit(failed ? 1 : 0);
