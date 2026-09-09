import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  test: {
    projects: [
      {
        // The engine and the analytics math must run without a DOM. That is the
        // point of the import boundary, and this project is what enforces it.
        resolve: { alias },
        test: {
          name: "engine",
          environment: "node",
          include: ["src/{engine,analytics,storage,lib,data}/**/*.test.ts"],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "dom",
          environment: "happy-dom",
          include: ["src/{input,render,react,ui}/**/*.test.{ts,tsx}"],
        },
      },
    ],
  },
});
