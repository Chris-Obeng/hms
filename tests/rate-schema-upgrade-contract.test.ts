import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const UPGRADE_PROBE = new URL(
  "../supabase/tests/rate_schema_upgrade.sql",
  import.meta.url
);
const RECONCILIATION_MIGRATION = new URL(
  "../supabase/migrations/20260830163000_reconcile_rate_table_drift.sql",
  import.meta.url
);

function loadSql(url: URL): string {
  return readFileSync(url, "utf8");
}

describe("rate schema upgrade contract", () => {
  it("accepts both source shapes and asserts one converged UUID schema", () => {
    const migration = loadSql(RECONCILIATION_MIGRATION);
    const probe = loadSql(UPGRADE_PROBE);

    expect(migration).toMatch(/IF v_type = 'bigint' THEN/);
    expect(migration).toMatch(/ELSIF v_type IS DISTINCT FROM 'uuid' THEN/);
    expect(migration).toContain("ALTER COLUMN id TYPE uuid USING gen_random_uuid()");
    expect(probe).toMatch(
      /v_seasonal_type IS DISTINCT FROM 'uuid'[^]*v_daily_type IS DISTINCT FROM 'uuid'/
    );
    expect(probe).toMatch(
      /v_seasonal_seq IS NOT NULL OR v_daily_seq IS NOT NULL/
    );
  });
});
