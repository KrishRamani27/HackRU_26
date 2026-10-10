import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Allow the dev server to serve the shared Builder/ folder at the repo root.
    fs: { allow: [".."] },
  },
});
