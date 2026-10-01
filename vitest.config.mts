import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Next's own Vitest guide installs @vitejs/plugin-react for the JSX runtime;
  // the `@/*` alias below stands in for vite-tsconfig-paths.
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    // Node by default (lib/domain tests). DOM tests opt in per file with the
    // documented `@vitest-environment jsdom` docblock.
    environment: "node",
    // DOM suites pay their cold render on the first test of the file (~1.5 s on
    // an idle machine, several times that while lint/typecheck run beside them),
    // so the 5 s default produced timeouts that had nothing to do with the code.
    testTimeout: 15_000,
    include: ["tests/**/*.test.{ts,tsx}"],
    // RTL cleanup — it cannot self-register while globals are off.
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.ts", "hooks/**/*.ts"],
    },
  },
});
