import { test, expect } from "@playwright/test";
test("starts empty and labels demo recordings through every view", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your fieldwork starts here" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Load demo hunt", exact: true })
    .click();
  await expect(
    page.getByText("SIMULATED DATA · NOT LIVE", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Spectrum", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Spectrum", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#waterfall")).toBeVisible();
  await page
    .getByRole("link", { name: "Sessions", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Sessions", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Camp Beacon · Demo Hunt", { exact: true }).first(),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Camp Beacon · Demo Hunt", { exact: true }).first(),
  ).toBeVisible();
});
test("exports and reimports a valid recording; rejects invalid schema", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Load demo hunt", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export JSON", exact: true })
    .first()
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.json$/);
  const path = await file.path();
  expect(path).toBeTruthy();
  await page.locator("#import-file").setInputFiles(path!);
  await expect(page.getByRole("status")).toContainText("Recording imported");
  await page
    .locator("#import-file")
    .setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"schemaVersion":99}'),
    });
  await expect(page.getByRole("status")).toContainText("Import rejected");
});
test("settings and local deletion work without an account", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Load demo hunt", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Settings", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("No background uploads", { exact: true }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Delete all local history", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Overview", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Your fieldwork starts here" }),
  ).toBeVisible();
});
test("has no horizontal overflow or browser errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Load demo hunt", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
