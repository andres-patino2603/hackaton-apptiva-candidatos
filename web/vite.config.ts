import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const backend = "http://127.0.0.1:3000"
const proxied = ["/pagos", "/cities", "/agencias", "/notifications", "/crm", "/health"]

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    proxy: Object.fromEntries(
      proxied.map((p) => [p, { target: backend, changeOrigin: true }]),
    ),
  },
})
