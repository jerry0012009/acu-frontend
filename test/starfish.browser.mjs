import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";

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
const domains = ["证据核验与交付闭环", "Collaboration and production control", "模型路由与计费策略", "Design and user experience", "架构与生产运行"];
let rays = Array.from({ length: 100 }, (_, index) => ({
  id: `pref-${index}`,
  label: `Preference ${index + 1}: evidence and verifiable outcomes`,
  category: domains[index % 5],
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
if (process.env.STARFISH_PROFILE_FILE) {
  view = JSON.parse(readFileSync(process.env.STARFISH_PROFILE_FILE, 'utf8'));
  rays = view.profile.rays;
}
const expectedDomains = [...new Set(rays.map((ray) => ray.category))];
const hoverRay = rays[Math.floor(rays.length * 0.4)];
const pinnedRay = rays[Math.floor(rays.length * 0.75)];

async function verifyArrowPlacement(chart, frames = 1) {
  const maximumOffset = await chart.evaluate(async (svg, frames) => {
    let maximum = 0;
    for (let frame = 0; frame < frames; frame++) {
      await new Promise(requestAnimationFrame);
      for (const group of svg.querySelectorAll('[role="button"]')) {
        const shaft = group.querySelector('.preference-starfish-ray');
        const arrow = group.querySelector('path.preference-starfish-hit');
        const length = arrow.getTotalLength();
        const matrix = arrow.getScreenCTM();
        const tip = arrow.getPointAtLength(length / 2).matrixTransform(matrix);
        const left = arrow.getPointAtLength(0).matrixTransform(matrix);
        const right = arrow.getPointAtLength(length).matrixTransform(matrix);
        const start = new DOMPoint(shaft.x1.baseVal.value, shaft.y1.baseVal.value).matrixTransform(shaft.getScreenCTM());
        const end = new DOMPoint(shaft.x2.baseVal.value, shaft.y2.baseVal.value).matrixTransform(shaft.getScreenCTM());
        maximum = Math.max(maximum, Math.hypot(tip.x - end.x, tip.y - end.y));
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        // Both wings must sit behind the tip, symmetrically across the ray.
        if ((left.x - tip.x) * dx + (left.y - tip.y) * dy >= 0 ||
            (right.x - tip.x) * dx + (right.y - tip.y) * dy >= 0 ||
            Math.abs((left.x + right.x - 2 * tip.x) * dy - (left.y + right.y - 2 * tip.y) * dx) > 0.1) {
          return Infinity;
        }
      }
    }
    return maximum;
  }, frames);
  assert(maximumOffset < 0.1, `arrow tips must remain at ray endpoints and point outward; maximum offset ${maximumOffset}px`);
}

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
  for (const [width, theme] of [[1440, 'dark'], [390, 'dark'], [1440, 'light'], [390, 'light']]) {
    await page.addInitScript((theme) => localStorage.setItem('theme', theme), theme);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}/private-acu/overview`);
    const chart = page.locator('svg[aria-label="Preference starfish"]');
    await chart.waitFor().catch(async (error) => {
      console.log(page.url(), (await page.locator("body").innerText()).slice(0, 2000), errors);
      throw error;
    });
    assert.equal(await chart.locator('[role="button"]').count(), rays.length);
    assert.equal(await chart.locator('[role="button"] path.preference-starfish-hit').count(), rays.length, 'every ray ends in an arrow');
    assert.equal(await chart.locator('[role="button"] circle').count(), 0, 'arrows replace endpoint dots');
    await verifyArrowPlacement(chart);
    assert.equal(await chart.locator('text').count(), expectedDomains.length);
    assert.equal(await chart.locator('text').allTextContents().then((labels) => labels.every((label) => expectedDomains.includes(label))), true);
    await page.evaluate((theme) => {
      document.documentElement.classList.toggle('dark', theme === 'dark');
      document.documentElement.classList.toggle('light', theme === 'light');
    }, theme);
    const ink = await chart.locator('.preference-starfish-ray').first().evaluate((line) => getComputedStyle(line).stroke);
    assert.equal(ink === 'rgb(255, 255, 255)', theme === 'dark', 'rays must contrast with the active theme');
    const viewport = page.getByTestId("preference-chart-viewport");
    assert.equal(await viewport.evaluate((element) => getComputedStyle(element).backgroundColor), 'rgba(0, 0, 0, 0)', 'chart must blend into page background');
    assert(await chart.locator('text').evaluateAll((labels) => labels.every((label) => {
      const bounds = label.getBoundingClientRect();
      const frame = label.ownerSVGElement.getBoundingClientRect();
      return bounds.left >= frame.left && bounds.right <= frame.right && bounds.top >= frame.top && bounds.bottom <= frame.bottom;
    })), 'all domain labels must fit inside the chart');
    const hoverTarget = chart.getByRole('button', { name: hoverRay.label, exact: true });
    await hoverTarget.dispatchEvent('mouseover');
    await verifyArrowPlacement(chart, 24);
    await page.getByRole('heading', { name: hoverRay.label, exact: true }).waitFor();
    await chart.screenshot({ path: `${output}/arrows-hover-${width}-${theme}.png` });
    await hoverTarget.dispatchEvent('mouseout');
    await verifyArrowPlacement(chart, 24);
    const target = chart.getByRole("button", { name: pinnedRay.label, exact: true });
    await target.focus();
    await page.keyboard.press("Enter");
    await verifyArrowPlacement(chart, 24);
    assert.equal(
      await target.getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(await page.getByRole("heading", { name: pinnedRay.label, exact: true }).count(), 1);
    await page.getByText(`Source documents (${pinnedRay.sourceIds.length})`, { exact: true }).click();
    if (!process.env.STARFISH_PROFILE_FILE)
      await page.getByText("Preference source evidence", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    assert(await viewport.evaluate((element) => element.scrollWidth > element.clientWidth));
    await verifyArrowPlacement(chart);
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    const defaultSize = await chart.evaluate((element) => element.viewBox.baseVal.width);
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    assert(await chart.evaluate((element) => element.viewBox.baseVal.width) > defaultSize, 'zoom out must work below the initial size');
    assert(await viewport.evaluate((element) => element.scrollWidth <= element.clientWidth), 'zoomed-out chart must fit viewport');
    await verifyArrowPlacement(chart);
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({ path: `${output}/starfish-${width}-${theme}.png`, fullPage: true });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reducedMotionChart = page.locator('svg[aria-label="Preference starfish"]');
  await reducedMotionChart.getByRole('button', { name: hoverRay.label, exact: true }).dispatchEvent('mouseover');
  await verifyArrowPlacement(reducedMotionChart, 4);
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
    `Passed: ${rays.length} arrow tips aligned in all directions, static/hover/leave/pinned animation frames, zoom, reduced motion, desktop/mobile themes, selection, sources, loading/error/empty states`,
  );
} finally {
  await browser.close();
}
