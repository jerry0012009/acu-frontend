import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.STARFISH_BASE_URL || "http://127.0.0.1:4317";
const output = process.env.STARFISH_OUTPUT || "/tmp/acu-starfish-browser";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH,
});
const user = {
  id: 42,
  role: 1,
  username: "starfish-test",
  display_name: "Preference test",
  status: 1,
  language: "en",
  setting: "{}",
};
const rays = Array.from({ length: 100 }, (_, index) => ({
  id: `pref-${index}`,
  label: `Preference ${index + 1}: evidence and verifiable outcomes`,
  category: ["Decisions", "Collaboration", "Delivery", "Design", "Risk"][index % 5],
  score: 30 + (index % 70),
  confidence: 50 + (index % 50),
  summary: "Prefers evidence-backed results with explicit uncertainty and verifiable delivery.",
  scope: "Complex engineering decisions",
  sourceIds: [`pref-${index}`],
}));
let view = {
  status: "ready",
  profile: { summary: "Evidence-driven work preferences", rays, sourceCount: 100, excluded: [] },
  generatedAt: "2026-11-06T12:00:00Z",
  error: null,
};
try {
  const context = await browser.newContext({ locale: "en-US" });
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data = "";
    if (path.endsWith("/setup")) data = { status: true, root_init: true };
    else if (path.endsWith("/auth/refresh"))
      data = {
        access_token: "fixture",
        token_type: "Bearer",
        access_expires_at: 9999999999,
        user,
        session: {
          sid: "fixture",
          current: true,
          login_method: "test",
          ip: "",
          user_agent: "",
          created_at: 1,
          last_active_at: 1,
          expires_at: 9999999999,
        },
      };
    else if (path.endsWith("/self")) data = user;
    else if (path.endsWith("/acu-preference-profile")) data = view;
    else if (path.endsWith("/acu-memory"))
      data = {
        skills: rays.map((ray) => ({
          id: ray.id,
          name: ray.label,
          description: ray.summary,
          files: [{ path: "SKILL.md", content: "Preference source evidence" }],
        })),
      };
    else if (path.endsWith("/status")) data = { system_name: "ACU", setup: true, version: "test" };
    else if (path.endsWith("/acu-advisor/settings"))
      data = { globalEnabled: true, learningEnabled: true };
    else if (path.endsWith("/acu-private-usage")) data = { windows: [] };
    else if (path.endsWith("/notifications")) data = { notifications: [], unreadCount: 0 };
    await route.fulfill({ json: { success: true, data } });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") console.log("Browser diagnostic:", message.text().slice(0, 1200));
  });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}/private-acu/overview`);
    const chart = page.locator('svg[aria-label="Preference starfish"]');
    await chart.waitFor().catch(async (error) => {
      console.log(page.url(), (await page.locator("body").innerText()).slice(0, 2000), errors);
      throw error;
    });
    assert.equal(await chart.locator('[role="button"]').count(), 100);
    assert.equal(await chart.locator('text').count(), 5);
    assert.equal(await chart.locator('text').allTextContents().then((labels) => labels.every((label) => ["Decisions", "Collaboration", "Delivery", "Design", "Risk"].includes(label))), true);
    assert.equal(await chart.locator('.preference-starfish-ray').evaluateAll((lines) => lines.every((line) => line.getAttribute('stroke') === '#ffffff')), true);
    const hoverTarget = chart.getByRole('button', { name: rays[40].label, exact: true });
    await hoverTarget.dispatchEvent('mouseover');
    await page.getByRole('heading', { name: rays[40].label, exact: true }).waitFor();
    await hoverTarget.dispatchEvent('mouseout');
    const target = chart.getByRole("button", { name: rays[75].label, exact: true });
    await target.focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await target.getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(await page.getByRole("heading", { name: rays[75].label, exact: true }).count(), 1);
    await page.getByText("Source documents (1)", { exact: true }).click();
    await page.getByText("Preference source evidence", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    const viewport = page.getByTestId("preference-chart-viewport");
    assert(await viewport.evaluate((element) => element.scrollWidth > element.clientWidth));
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({ path: `${output}/starfish-${width}.png`, fullPage: true });
  }
  for (const status of ["queued", "error", "empty"]) {
    view = { ...view, status, profile: status === "error" ? view.profile : null };
    await page.reload();
    if (status === "queued")
      await page.getByText("Updating preference starfish", { exact: true }).waitFor();
    if (status === "error")
      await page
        .getByText("Preference refresh unavailable. Last saved profile is retained.", {
          exact: true,
        })
        .waitFor();
    if (status === "empty")
      await page.getByText("No learned preferences yet", { exact: true }).waitFor();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Passed: 100 rays, selection, keyboard, sources, zoom, desktop/mobile overflow, loading/error/empty states",
  );
} finally {
  await browser.close();
}
