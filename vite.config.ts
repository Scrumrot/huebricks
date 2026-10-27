import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the built `dist/` folder works from any static host or subfolder.
  base: "./",
  server: { open: true },
  build: { target: "es2020" },
  test: { include: ["src/**/*.test.ts"] },
});
