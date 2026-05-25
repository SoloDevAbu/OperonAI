import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  resolve: {
    alias: {
      "@operonai/db": path.resolve(__dirname, "../../packages/db/src/index.ts"),
      "@operonai/lib": path.resolve(__dirname, "../../packages/lib/src/index.ts"),
      "@operonai/types": path.resolve(__dirname, "../../packages/types/src/index.ts"),
      "@operonai/queue": path.resolve(__dirname, "../../packages/queue/src/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
