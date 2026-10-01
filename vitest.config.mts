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
