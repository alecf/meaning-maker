/**
 * Runs a TypeScript script with the same module resolution the app and tests
 * use (Vite: `@/` alias, JSON imports, ESM-only packages).
 *
 *   node scripts/run.mjs scripts/build-explainer-data.ts
 */
import { fileURLToPath } from "node:url";
import { runnerImport } from "vite";

const [script] = process.argv.slice(2);
if (!script) {
  console.error("usage: node scripts/run.mjs <script.ts>");
  process.exit(1);
}
await runnerImport(`/${script}`, {
  configFile: false,
  resolve: {
    alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) },
  },
});
