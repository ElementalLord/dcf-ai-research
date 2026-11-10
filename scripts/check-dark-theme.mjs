#!/usr/bin/env node
// Checks that no page, dropdown, dialog or side panel shows a white or near-white
// background. The whole site uses a dark navy theme, so any light surface is a bug
// (for example, a pop-up that missed the dark colour settings).
//
// Usage:
//   npm run quality:theme                         # checks http://localhost:3000
//   npm run quality:theme -- https://example.app  # checks another origin
// Admin pages are checked too when DCF_ADMIN_COOKIE holds a valid "dcf_admin"
// session cookie value (copy it from the browser after signing in to Resources).
//
// Needs Playwright with Chromium: npm install --no-save playwright && npx playwright install chromium

const origin = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const adminCookie = process.env.DCF_ADMIN_COOKIE || "";

const publicPages = ["/", "/explore", "/explore/swami-vivekananda", "/ai", "/resources"];
const adminPages = ["/resources/knowledge", "/resources/feedback", "/resources/readiness", "/research", "/review",
  "/corpus", "/corpus/sources", "/corpus/evidence", "/corpus/epistemics", "/corpus/external", "/corpus/onboard", "/corpus/reconcile"];
const popupTriggers = [
  '[data-slot="select-trigger"]:visible', '[data-slot="dialog-trigger"]:visible', "button[aria-haspopup]:visible",
  'button:visible:has-text("How to use")', 'button:visible:has-text("Add source")', 'button:visible:has-text("Add claim")', "summary:visible",
].join(", ");

let chromium;
try { ({ chromium } = await import("playwright")); }
catch {
  console.error("Playwright is not installed. Run: npm install --no-save playwright && npx playwright install chromium");
  process.exit(2);
}

// Runs in the page: lists visible elements whose background is near-white.
function findLightSurfaces() {
  const luminance = (color) => {
    const parts = color.match(/[\d.]+/g);
    if (!parts) return 0;
    const [r, g, b, alpha = 1] = parts.map(Number);
    return alpha < 0.5 ? 0 : (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  const found = [];
  if (luminance(getComputedStyle(document.documentElement).backgroundColor) > 0.8) found.push("html background");
  if (luminance(getComputedStyle(document.body).backgroundColor) > 0.8) found.push("body background");
  for (const element of document.querySelectorAll("body *")) {
    const box = element.getBoundingClientRect();
    if (box.width * box.height < 600 || box.bottom < 0 || box.top > innerHeight) continue;
    const style = getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") continue;
    if (luminance(style.backgroundColor) > 0.8) {
      found.push(`${element.getAttribute("data-slot") || element.tagName.toLowerCase()}.${String(element.className).slice(0, 50)} (${Math.round(box.width)}×${Math.round(box.height)})`);
    }
  }
  return found.slice(0, 5);
}

const browser = await chromium.launch();
const failures = [];
let checkedPopups = 0;
const pages = adminCookie ? [...publicPages, ...adminPages] : publicPages;
if (!adminCookie) console.log("DCF_ADMIN_COOKIE not set: checking public pages only.");

for (const colorScheme of ["light", "dark"]) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, colorScheme });
  if (adminCookie) await context.addCookies([{ name: "dcf_admin", value: adminCookie, url: origin }]);
  const page = await context.newPage();
  for (const path of pages) {
    const url = origin + path;
    await page.goto(url, { waitUntil: "networkidle", timeout: 90_000 });
    const onPage = await page.evaluate(findLightSurfaces);
    if (onPage.length) failures.push(`[${colorScheme}] ${path}: ${onPage.join("; ")}`);
    const triggers = page.locator(popupTriggers);
    const count = Math.min(await triggers.count(), 15);
    for (let index = 0; index < count; index++) {
      const trigger = triggers.nth(index);
      const label = ((await trigger.innerText().catch(() => "")) || "").trim().slice(0, 40);
      try { await trigger.scrollIntoViewIfNeeded({ timeout: 2000 }); await trigger.click({ timeout: 2000 }); }
      catch { continue; }
      await page.waitForTimeout(400);
      checkedPopups++;
      const inPopup = await page.evaluate(findLightSurfaces);
      if (inPopup.length) failures.push(`[${colorScheme}] ${path}, after opening "${label}": ${inPopup.join("; ")}`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      if (page.url() !== url) await page.goto(url, { waitUntil: "networkidle" });
    }
  }
  await context.close();
}
await browser.close();

console.log(`Checked ${pages.length} pages and ${checkedPopups} pop-ups in light and dark OS mode.`);
if (failures.length) {
  console.error(`\n${failures.length} light surface(s) found:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("No light surfaces found.");
