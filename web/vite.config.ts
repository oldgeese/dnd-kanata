import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        // firebase と react を別チャンクに分け、1 チャンク 500kB 超の警告を避ける
        manualChunks(id) {
          if (id.includes("node_modules/@firebase/") || id.includes("node_modules/firebase/") || id.includes("node_modules/idb/")) return "firebase";
          if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run)\//.test(id)) return "react";
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    globalSetup: ["./scripts/gen-schema-fixture.ts"],
  },
});
