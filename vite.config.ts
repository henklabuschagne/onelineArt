import { defineConfig } from "vite";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // Explicit base path for Azure / any hosting
  base: "/",

  build: {
    // Output to build/ (Vite default, explicit for clarity)
    outDir: "build",
    // Generate sourcemaps for debugging (disable in prod if desired)
    sourcemap: false,
    // Target modern browsers
    target: "es2020",
    // Chunk size warning threshold
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Split vendor chunks for better caching
        manualChunks: {
          vendor: ["react", "react-dom", "react-router"],
          ui: ["lucide-react", "sonner"],
        },
      },
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ["**/*.svg", "**/*.csv"],
});