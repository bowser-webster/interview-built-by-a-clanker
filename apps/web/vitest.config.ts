import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Separate from vite.config.ts so the router plugin does not regenerate
// routeTree.gen.ts during test runs.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
      "@acme/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    // jsdom for component tests; lib tests stub fetch/localStorage themselves.
    environment: "jsdom",
  },
});
