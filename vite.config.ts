import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  plugins: [
    cloudflare({
      viteEnvironment: { name: "ssr" },
      persistState: true,
    }),
    reactRouter(),
  ],
  ssr: {
    target: "webworker",
    noExternal: true,
    resolve: {
      conditions: ["workerd", "browser"],
    },
  },
  resolve: {
    mainFields: ["browser", "module", "main"],
    alias: {
      "@shared": path.resolve(__dirname, "./shared"),
      "@server": path.resolve(__dirname, "./server"),
      "~": path.resolve(__dirname, "./app"),
    },
  },
  optimizeDeps: {
    exclude: ["better-auth"],
  },
  build: {
    minify: true,
  },
});
