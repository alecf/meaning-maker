/**
 * Writes what /benchmark reads from data/benchmark. Rerun after a benchmark or
 * PAWS run.
 *
 *   npm run benchmark:page
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { buildPageData, type PawsResults, type Results } from "./pageData";
import { readApprovedTriplets } from "./validate";

const PAWS_FILE = "data/benchmark/paws.json";
const SUMMARY_FILE = "src/app/benchmark/summary.json";
const DETAILS_FILE = "public/benchmark/details.json";

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8"));

const { summary, details } = buildPageData(
  readJson<Results>("data/benchmark/results.json"),
  readApprovedTriplets(),
  existsSync(PAWS_FILE) ? readJson<PawsResults>(PAWS_FILE) : undefined,
);
writeFileSync(SUMMARY_FILE, `${JSON.stringify(summary, null, 2)}\n`);
writeFileSync(DETAILS_FILE, JSON.stringify(details));
console.log(`Wrote ${SUMMARY_FILE} and ${DETAILS_FILE}`);
