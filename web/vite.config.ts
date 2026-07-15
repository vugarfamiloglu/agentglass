import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dashboard is a Vite SPA. In development it proxies /api (REST + WS) to the
// AgentGlass server on :4319; in production the server serves the built assets.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 4318,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:4319",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
