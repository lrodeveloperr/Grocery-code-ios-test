import { readFile, writeFile } from "node:fs/promises";

const path = "release-overlay/App.tsx";
let source = await readFile(path, "utf8");
const before = "  return AD_RETRY_DELAYS_MS[index];";
const after = "  return AD_RETRY_DELAYS_MS[index] ?? 300_000;";
if (source.includes(after)) {
  console.log("Retry type fix already applied.");
  process.exit(0);
}
if (!source.includes(before)) {
  throw new Error("Could not find retry delay return statement.");
}
source = source.replace(before, after);
await writeFile(path, source, "utf8");
console.log("Applied strict TypeScript fallback to retry delay lookup.");
