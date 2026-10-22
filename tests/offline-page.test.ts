import { test } from "vitest";
import { registerPwaTests } from "./pwa/regressions.mjs";

// The same suite can also run without installed packages on Node 24:
// node --test tests/pwa/regressions.mjs
registerPwaTests(test);
