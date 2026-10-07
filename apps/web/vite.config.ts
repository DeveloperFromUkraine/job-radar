import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // changeOrigin: forwarded requests carry Host 127.0.0.1:3000 and pass the Host check (ADR-0007).
      "/api": { target: "http://127.0.0.1:3000", changeOrigin: true },
    },
  },
});
