import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    outDir: "dist",
    base: './',  // ← ini yang kurang
  },
  base: './',    // ← ini juga perlu di root level
  server: {
    watch: {
      ignored: ["**/node_modules/**"],
    },
  },
})