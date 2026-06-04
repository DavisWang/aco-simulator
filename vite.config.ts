import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from https://daviswang.github.io/aco-simulator/ in production,
// but from root during local dev.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/aco-simulator/" : "/",
  plugins: [react()],
}));
