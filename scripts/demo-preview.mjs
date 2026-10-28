import { chromium } from "playwright";
import { startServer } from "./serve.mjs";
import fs from "node:fs/promises";
const out = process.argv[2];
await fs.mkdir(out, { recursive: true });
const server = await startServer({ port: 0 });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: out + "/CampusTwin-首页.png", fullPage: true });
  const info = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    images: [...document.images].map((i) => ({
      src: i.src,
      ok: i.complete && i.naturalWidth > 0,
    })),
  }));
  await page.locator(".nav-item").filter({ hasText: "场地探索" }).click();
  await page.screenshot({
    path: out + "/CampusTwin-场地探索.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: out + "/CampusTwin-手机场地.png",
    fullPage: true,
  });
  console.log(
    JSON.stringify(
      {
        errors,
        info,
        mobile: await page.evaluate(() => ({
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
