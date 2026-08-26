const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const repoRoot = path.resolve(__dirname, "../..");
const appPath = path.join(repoRoot, "release-overlay", "app.html");
const outputPath = path.join(repoRoot, "release-overlay", "artifacts", "remove-ads-iap-review-750x1334.png");

(async () => {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const appHtml = fs.readFileSync(appPath);
  const server = http.createServer((req, res) => {
    if (req.url === "/" || req.url === "/app.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(appHtml);
      return;
    }
    res.writeHead(404);
    res.end("Not found");
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: "en-US"
    });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/app.html`, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean(window.GBTApp && window.GBTPurchaseRuntime));

    await page.evaluate(() => {
      const next = window.GBTApp.getState();
      next.onboarded = true;
      window.GBTApp.setStateForTest(next);
      window.GBTApp.route("removeAds");
      window.GBTPurchaseRuntime.setState({
        status: "ready",
        adsRemoved: false,
        displayPrice: "$9.99",
        canPurchase: true,
        canRestore: true
      });
    });

    await page.getByRole("heading", { name: "Remove Ads Forever", exact: true }).first().waitFor();
    await page.getByRole("button", { name: "Remove Ads — $9.99", exact: true }).waitFor();
    await page.screenshot({ path: outputPath, fullPage: false });
    const dimensions = await page.evaluate(() => ({
      width: window.innerWidth * window.devicePixelRatio,
      height: window.innerHeight * window.devicePixelRatio
    }));
    if (dimensions.width !== 750 || dimensions.height !== 1334) {
      throw new Error(`Unexpected screenshot dimensions: ${dimensions.width}x${dimensions.height}`);
    }
    console.log(`Captured ${outputPath} at ${dimensions.width}x${dimensions.height}`);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
