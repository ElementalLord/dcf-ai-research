import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    },
    coverage: { provider: "v8", reporter: ["text", "json-summary"] },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/server-only.ts", import.meta.url)),
    },
  },
});
