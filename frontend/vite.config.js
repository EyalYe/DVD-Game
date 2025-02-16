import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",  // Ensure Vite correctly serves index.html
  root: ".",  // Ensure Vite correctly serves index.html
  server: {
    port: 5173,
    strictPort: true,
    host: "0.0.0.0",
    https: false,
  },
  publicDir: "public",
});
