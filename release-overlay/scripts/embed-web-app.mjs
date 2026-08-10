import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [input = "app.html", output = "src/appHtml.ts"] = process.argv.slice(2);
const html = await readFile(input, "utf8");

if (!/^<!doctype html>/i.test(html.trimStart())) {
  throw new Error("The canonical web source must begin with an HTML doctype.");
}
if (!/<\/html>\s*$/i.test(html)) {
  throw new Error("The canonical web source is incomplete.");
}

const digest = createHash("sha256").update(html).digest("hex");
const moduleSource = [
  "// Generated from the reviewed canonical HTML source. Do not edit by hand.",
  `export const APP_HTML_SHA256 = ${JSON.stringify(digest)};`,
  `const APP_HTML = ${JSON.stringify(html)};`,
  "export default APP_HTML;",
  "",
].join("\n");

await writeFile(path.resolve(output), moduleSource, "utf8");
console.log(`Embedded canonical HTML: ${digest}`);
