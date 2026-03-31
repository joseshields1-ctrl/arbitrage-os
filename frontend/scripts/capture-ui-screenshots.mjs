import { chromium } from "playwright";

const baseUrl = "http://127.0.0.1:5173";
const outDir = "/opt/cursor/artifacts";

const clickNav = async (page, label) => {
  await page.locator(".left-nav button", { hasText: label }).click();
  await page.waitForTimeout(400);
};

const ensurePipelineSelection = async (page) => {
  const openButtons = page.locator(".deal-card-actions button", { hasText: "Open" });
  if ((await openButtons.count()) > 0) {
    await openButtons.first().click();
    await page.waitForTimeout(500);
  }
};

const ensureAnyDecisionReason = async (page) => {
  const reasonBox = page.locator("textarea").filter({ hasText: "" }).nth(0);
  if (await reasonBox.count()) {
    await reasonBox.fill("Screenshot approval check.");
  }
};

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1080 } });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  await clickNav(page, "Dashboard");
  await page.screenshot({
    path: `${outDir}/dashboard-decision-engine.png`,
    fullPage: true,
  });

  await clickNav(page, "Intake");
  const stepOneButton = page.locator(".intake-category-card", { hasText: "Vehicle" }).first();
  if (await stepOneButton.count()) {
    await stepOneButton.click();
    await page.waitForTimeout(250);
    await page.locator(".form-section-card .primary-button", { hasText: "Continue" }).first().click();
    await page.waitForTimeout(300);
    await page
      .locator("label", { hasText: "Label" })
      .locator("input")
      .fill("Operator Test Intake");
    await page
      .locator("label", { hasText: "Acquisition Cost" })
      .locator("input")
      .fill("5200");
    await page
      .locator(".entry-actions .primary-button", { hasText: "Continue" })
      .first()
      .click();
    await page.waitForTimeout(400);
  }
  await page.screenshot({
    path: `${outDir}/intake-adaptive-flow.png`,
    fullPage: true,
  });

  await clickNav(page, "Pipeline");
  await ensurePipelineSelection(page);
  await page.waitForSelector("text=Vehicle Market Intelligence", { timeout: 4000 }).catch(() => {});
  await page.screenshot({
    path: `${outDir}/vehicle-market-panel.png`,
    fullPage: true,
  });

  await ensureAnyDecisionReason(page);
  const approveButton = page.locator("button", { hasText: "Approve" }).first();
  if (await approveButton.count()) {
    await approveButton.click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `${outDir}/prebid-sanity-modal.png`,
      fullPage: true,
    });
    const closeModalButton = page.locator(".prebid-modal .ghost-button", { hasText: "Cancel" }).first();
    if (await closeModalButton.count()) {
      await closeModalButton.click();
      await page.waitForTimeout(300);
    }
  }

  await clickNav(page, "Dashboard");
  await page.screenshot({
    path: `${outDir}/time-discipline-alerts.png`,
    fullPage: true,
  });

  await browser.close();
};

await run();
