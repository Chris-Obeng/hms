import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const isLocal = process.argv.includes("--local");
const args = isLocal
  ? ["supabase", "gen", "types", "typescript", "--local", "--schema", "public"]
  : [
      "supabase",
      "gen",
      "types",
      "typescript",
      "--project-id",
      process.env.SUPABASE_PROJECT_ID || "wtgldgyxtpbzjmaygeif",
      "--schema",
      "public",
    ];

const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
const res = spawnSync(cmd, args, {
  encoding: "utf8",
  shell: process.platform === "win32",
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" },
});

if (res.status !== 0 || !res.stdout.trim()) {
  console.error(res.stderr || "Failed to generate Supabase TypeScript types.");
  process.exit(res.status ?? 1);
}

const outPath = join(process.cwd(), "types", "database.types.ts");
writeFileSync(outPath, res.stdout, "utf8");
console.log(`Wrote ${outPath} (${res.stdout.split(/\r?\n/).length} lines).`);
