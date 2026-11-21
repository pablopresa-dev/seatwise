import { defineConfig } from "astro/config";

// TODO: replace with the production domain once it is decided.
export default defineConfig({
  site: "https://seatwise.app",
  output: "static",
  build: { inlineStylesheets: "auto" },
});
