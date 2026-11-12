import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const isLocal = process.argv.includes("--local");
const supabaseArgs = isLocal
  ? ["gen", "types", "typescript", "--local", "--schema", "public"]
  : [
      "gen",
      "types",
      "typescript",
      "--project-id",
      process.env.SUPABASE_PROJECT_ID || "wtgldgyxtpbzjmaygeif",
      "--schema",
      "public",
    ];

const env = {
  ...process.env,
  SUPABASE_TELEMETRY_DISABLED: "1",
  DO_NOT_TRACK: "1",
};

function runSupabase(args) {
  if (process.platform === "win32") {
    const quoted = args.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(" ");
    const direct = spawnSync("cmd.exe", ["/d", "/s", "/c", `supabase ${quoted}`], {
      encoding: "utf8",
      env,
    });
    if (!direct.error && direct.status !== 9009) {
      return direct;
    }
    return spawnSync("cmd.exe", ["/d", "/s", "/c", `npx --yes supabase ${quoted}`], {
      encoding: "utf8",
      env,
    });
  }

  const direct = spawnSync("supabase", args, { encoding: "utf8", env });
  if (direct.error?.code !== "ENOENT") {
    return direct;
  }
  return spawnSync("npx", ["--yes", "supabase", ...args], { encoding: "utf8", env });
}

const res = runSupabase(supabaseArgs);

if (res.status !== 0 || !res.stdout?.trim()) {
  console.error(res.stderr || res.error?.message || "Failed to generate Supabase TypeScript types.");
  process.exit(res.status ?? 1);
}

const normalized = `${res.stdout.replace(/\r\n/g, "\n").trimEnd()}\n`;
const outPath = join(process.cwd(), "types", "database.types.ts");
writeFileSync(outPath, normalized, "utf8");
console.log(`Wrote ${outPath} (${normalized.split("\n").length - 1} lines).`);
