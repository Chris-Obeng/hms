import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const TESTS_DIR = join(process.cwd(), "supabase", "tests");
// Fixture emitters write stdout data rather than running assertions:
const NON_TEST_FILES = new Set(["pricing_parity_fixture.sql"]);

const files = readdirSync(TESTS_DIR)
  .filter((f) => f.endsWith(".sql") && !NON_TEST_FILES.has(f))
  .sort();

const dbUrl = process.env.DATABASE_URL;
const container = process.env.SUPABASE_DB_CONTAINER || "supabase_db_RoomLine";

console.log(`Running ${files.length} SQL regression suites...\n`);

for (const file of files) {
  const fullPath = join(TESTS_DIR, file);
  const sql = readFileSync(fullPath, "utf8");
  process.stdout.write(`  -> ${file} ... `);

  const result = dbUrl
    ? spawnSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-f", "-"], {
        input: sql,
        encoding: "utf8",
      })
    : spawnSync(
        "docker",
        [
          "exec",
          "-i",
          "-e",
          "PGPASSWORD=postgres",
          container,
          "psql",
          "-U",
          "postgres",
          "-d",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
          "-f",
          "-",
        ],
        { input: sql, encoding: "utf8" }
      );

  if (result.status !== 0) {
    console.error("FAILED\n");
    if (result.stdout) console.error(result.stdout);
    if (result.stderr) console.error(result.stderr);
    if (result.error) console.error(result.error);
    process.exit(result.status ?? 1);
  }
  console.log("PASS");
}

console.log(`\nAll ${files.length} SQL regression suites passed.`);
