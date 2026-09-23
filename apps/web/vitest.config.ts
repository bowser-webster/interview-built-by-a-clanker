import { defineConfig } from "vitest/config";
import path from "path";

// Separate from vite.config.ts so the router plugin does not regenerate
// routeTree.gen.ts during test runs.
export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
      "@acme/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
