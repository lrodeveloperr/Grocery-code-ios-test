import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [input = "app.html", output = "src/appHtml.ts"] = process.argv.slice(2);
const html = await readFile(input, "utf8");
const logoBase64 = (
  await readFile(path.resolve(path.dirname(input), "assets/app-logo-256.png.base64"), "utf8")
).replace(/\s/g, "");
const logoMarker = "__GBT_APP_LOGO_PNG_BASE64__";

if (!/^<!doctype html>/i.test(html.trimStart())) {
  throw new Error("The canonical web source must begin with an HTML doctype.");
}
if (!/<\/html>\s*$/i.test(html)) {
  throw new Error("The canonical web source is incomplete.");
}
if ((html.match(new RegExp(logoMarker, "g")) || []).length !== 1) {
  throw new Error("The canonical web source must contain exactly one reviewed logo marker.");
}
if (!/^[A-Za-z0-9+/]+={0,2}$/.test(logoBase64)) {
  throw new Error("The compact application logo is not valid base64.");
}

const sourceDigest = createHash("sha256").update(html).digest("hex");
const materializedHtml = html.replace(logoMarker, logoBase64);
const digest = createHash("sha256").update(materializedHtml).digest("hex");
const moduleSource = [
  "// Generated from the reviewed canonical HTML source. Do not edit by hand.",
  `export const APP_HTML_SHA256 = ${JSON.stringify(digest)};`,
  `export const APP_HTML_SOURCE_SHA256 = ${JSON.stringify(sourceDigest)};`,
  `const APP_HTML = ${JSON.stringify(materializedHtml)};`,
  "export default APP_HTML;",
  "",
].join("\n");

await writeFile(path.resolve(output), moduleSource, "utf8");
console.log(`Embedded canonical HTML: ${digest} (source ${sourceDigest})`);
