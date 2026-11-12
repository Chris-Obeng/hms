#!/usr/bin/env node
/**
 * Atomic PUSH_WORKER_SECRET rotation helper (`BLK-05`).
 *
 * Generates a fresh 32-byte CSPRNG secret in memory, updates `.env.local`,
 * pushes `PUSH_WORKER_SECRET` to Supabase Edge Function secrets for
 * `wtgldgyxtpbzjmaygeif`, and writes a temporary gitignored SQL snippet to
 * `.tmp/rotate-push-worker-secret.sql` so the operator can execute the Vault
 * update + Vercel env update without exposing the secret in AI/chat transcripts.
 *
 * Usage:
 *   node scripts/rotate-push-worker-secret.mjs
 */

import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PROJECT_REF = process.env.SUPABASE_PROJECT_ID || "wtgldgyxtpbzjmaygeif";
const newSecret = randomBytes(32).toString("hex");
const redacted = `${newSecret.slice(0, 4)}…`;

const tmpDir = join(process.cwd(), ".tmp");
mkdirSync(tmpDir, { recursive: true });

// 1. Push to Supabase Edge Function secrets via temporary env file (avoids CLI argv exposure)
const tmpEnvPath = join(tmpDir, "push-secret.env");
writeFileSync(tmpEnvPath, `PUSH_WORKER_SECRET=${newSecret}\n`, { mode: 0o600 });

const cmd = process.platform === "win32" ? "cmd.exe" : "npx";
const args =
  process.platform === "win32"
    ? ["/d", "/s", "/c", `npx --yes supabase secrets set --env-file "${tmpEnvPath}" --project-ref ${PROJECT_REF}`]
    : ["--yes", "supabase", "secrets", "set", "--env-file", tmpEnvPath, "--project-ref", PROJECT_REF];

const res = spawnSync(cmd, args, { stdio: "inherit" });
rmSync(tmpEnvPath, { force: true });

if (res.status !== 0) {
  console.error("[rotate-push-worker-secret] Edge Function secret update failed; .env.local was NOT modified.");
  process.exit(res.status ?? 1);
}

// 2. Update .env.local in-place without printing the secret
const envLocalPath = join(process.cwd(), ".env.local");
if (existsSync(envLocalPath)) {
  const current = readFileSync(envLocalPath, "utf8");
  const updated = /^PUSH_WORKER_SECRET=.*$/m.test(current)
    ? current.replace(/^PUSH_WORKER_SECRET=.*$/m, `PUSH_WORKER_SECRET="${newSecret}"`)
    : `${current.trimEnd()}\nPUSH_WORKER_SECRET="${newSecret}"\n`;
  writeFileSync(envLocalPath, updated, "utf8");
}

// 3. Write gitignored SQL snippet for Supabase SQL Editor Vault rotation
const sqlPath = join(tmpDir, "rotate-push-worker-secret.sql");
writeFileSync(
  sqlPath,
  [
    "-- Run once in Supabase SQL Editor, then delete `.tmp/rotate-push-worker-secret.sql`:",
    "SELECT vault.update_secret(",
    "  (SELECT id FROM vault.secrets WHERE name = 'push_worker_secret' LIMIT 1),",
    `  '${newSecret}',`,
    "  'push_worker_secret'",
    ");",
    "",
  ].join("\n"),
  { mode: 0o600 }
);

console.log(`[rotate-push-worker-secret] Updated Edge Function + .env.local (${redacted}).`);
console.log(`[rotate-push-worker-secret] Next: run .tmp/rotate-push-worker-secret.sql in Supabase SQL Editor and update PUSH_WORKER_SECRET in Vercel Production, then delete .tmp/rotate-push-worker-secret.sql.`);
