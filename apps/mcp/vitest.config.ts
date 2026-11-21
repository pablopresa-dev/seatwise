import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Test against core sources so `npm test` does not require building core first.
    alias: { "@seatwise/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)) },
  },
});
