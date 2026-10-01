import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

const url = process.env.PREVIEW_URL ?? "http://127.0.0.1:4173/";
await mkdir(".artifacts", { recursive: true });
const browser = await chromium.launch();
try {
  for (const [name, options] of [
    ["desktop", { viewport: { width: 1440, height: 1000 } }],
    ["mobile", devices["iPhone 13"]],
  ]) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    await page
      .getByRole("button", { name: "Load demo hunt", exact: true })
      .click();
    await page
      .getByText("SIMULATED DATA · NOT LIVE", { exact: true })
      .first()
      .waitFor();
    await page.screenshot({
      path: `.artifacts/dashboard-${name}.png`,
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "Signal map", exact: true })
      .first()
      .click();
    await page.locator("#signal-map").waitFor();
    await page.screenshot({
      path: `.artifacts/map-${name}.png`,
      fullPage: true,
    });
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
    );
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .getByText("SIMULATED DATA · NOT LIVE", { exact: true })
      .first()
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `${name}: horizontal overflow`,
    );
    assert.deepEqual(errors, [], `${name}: browser errors`);
    await context.close();
    console.log(
      `${name}: production render, cached offline reload, and persisted session passed`,
    );
  }
} finally {
  await browser.close();
}
