import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      // Test against shared source so no test run depends on a stale dist/ build.
      "@acme/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Pre-fix, auth is opt-in; tests that need a real user must not be blocked by C1.
    env: { ENFORCE_AUTH: "true" },
  },
});
