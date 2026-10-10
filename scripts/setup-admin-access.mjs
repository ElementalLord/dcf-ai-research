import { createHash, randomBytes } from "node:crypto";
import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const envPath = fileURLToPath(new URL("../.env.local", import.meta.url));
const accessKey = randomBytes(32).toString("base64url");
const accessKeyHash = createHash("sha256").update(accessKey).digest("hex");
const sessionSecret = randomBytes(32).toString("hex");
const current = await readFile(envPath, "utf8").catch((error) => {
  if (error?.code === "ENOENT") return "";
  throw error;
});
const retained = current.split(/\r?\n/).filter((line) => !/^\s*(?:CORPUS_ADMIN_TOKEN|CORPUS_ADMIN_TOKEN_HASH|ADMIN_SESSION_SECRET)\s*=/.test(line));
const content = `${retained.join("\n").trimEnd()}\nCORPUS_ADMIN_TOKEN_HASH=${accessKeyHash}\nADMIN_SESSION_SECRET=${sessionSecret}\n`;
const temporaryPath = `${envPath}.${randomBytes(8).toString("hex")}.tmp`;
await writeFile(temporaryPath, content, { mode: 0o600, flag: "wx" });
await rename(temporaryPath, envPath);
await chmod(envPath, 0o600);
process.stdout.write(`Admin access key (shown once): ${accessKey}\n`);
process.stdout.write("Only its hash and a separate session secret were saved in .env.local. Restart the dev server if it was already running.\n");
