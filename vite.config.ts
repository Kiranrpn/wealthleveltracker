/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" keeps asset paths relative so the build works on GitHub Pages sub-paths.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    // Recharts alone is ~525 kB minified (~150 kB gzip); keep it in its own cached chunk.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: { charts: ["recharts"] },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      thresholds: {
        "src/lib/calc.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/lib/eta.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
      },
    },
  },
});
