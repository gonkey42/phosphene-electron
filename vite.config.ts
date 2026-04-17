import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { configDefaults } from "vitest/config";

export default defineConfig({
  base: "./",
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    exclude: [
      ...configDefaults.exclude,
      "**/dist/**",
      "**/dist-electron/**",
      "**/.worktrees/**",
      "**/.codex-review-worktrees/**",
      "**/e2e/**",
    ],
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
  },
});
