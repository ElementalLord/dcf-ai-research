// Automated version of the desktop and mobile checklist in
// docs/phase1/handoff/deployment.md. It drives a real Chromium browser through
// the public pages at a desktop size and an emulated phone, and prints one
// PASS/FAIL line per check plus a JSON summary.
//
//   node scripts/qa-phase1-browser.mjs https://YOUR-PRODUCTION-ORIGIN
//   node scripts/qa-phase1-browser.mjs                      # http://localhost:3000
//
// Needs Playwright with Chromium: npm install --no-save playwright && npx playwright install chromium
//
// This is an emulation, not a device lab: it does not replace a look at a real
// phone, Safari or Firefox. Exit code is 1 if any check fails.

let chromium; let devices;
try { ({ chromium, devices } = await import("playwright")); }
catch {
  console.error("Playwright is not installed. Run: npm install --no-save playwright && npx playwright install chromium");
  process.exit(2);
}

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
// One profile from each of the five presentation categories.
const PROFILES = [["sages", "vasistha"], ["spiritual", "guru-nanak"], ["scientists", "srinivasa-ramanujan"], ["rulers", "ashoka"], ["cultural", "rabindranath-tagore"]];
const results = [];

const rec = (area, check, ok, note = "") => {
  results.push({ area, check, ok, note });
  console.log(`${ok ? "PASS" : "FAIL"} [${area}] ${check}${note ? ` — ${note}` : ""}`);
};
const overflows = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

async function run(label, contextOptions) {
  const browser = await chromium.launch();
  const page = await (await browser.newContext(contextOptions)).newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const check = async (name, fn) => {
    try { const [ok, note] = await fn(); rec(label, name, Boolean(ok), note || ""); }
    catch (error) { rec(label, name, false, String(error.message || error).split("\n")[0]); }
  };

  await check("Home loads without horizontal overflow", async () => {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    return [(await page.title()).length > 0 && !(await overflows(page))];
  });
  await page.goto(`${BASE}/explore`, { waitUntil: "networkidle" });
  await check("Explore shows 25 people and five categories plus All", async () => {
    const cards = await page.locator(".explore-card").count();
    const buttons = await page.locator(".explore-categories button").count();
    return [cards === 25 && buttons === 6, `${cards} cards, ${buttons} category buttons`];
  });
  await check("Explore has no horizontal overflow", async () => [!(await overflows(page))]);
  await check('Search "raman" returns Raman and Ramanujan', async () => {
    await page.fill(".explore-search input", "raman");
    const names = await page.locator(".explore-card h2").allTextContents();
    return [names.includes("C. V. Raman") && names.includes("Srinivasa Ramanujan"), names.join(", ")];
  });
  await check("A search with no match shows a clear empty state", async () => {
    await page.fill(".explore-search input", "zzzz");
    return [await page.locator(".explore-empty").isVisible()];
  });
  await check("Clear search and filters restores everyone", async () => {
    await page.getByRole("button", { name: "Clear search and filters" }).click();
    return [(await page.locator(".explore-card").count()) === 25];
  });
  await check("Era and Region filters combine", async () => {
    await page.selectOption('.explore-toolbar label:has-text("Era") select', "20th century");
    await page.selectOption('.explore-toolbar label:has-text("Region") select', "East India");
    const names = await page.locator(".explore-card h2").allTextContents();
    return [names.length > 0 && names.length < 25, names.join(", ")];
  });
  await check("Timeline view groups people by period", async () => {
    await page.getByRole("button", { name: "Timeline" }).click();
    return [(await page.locator(".explore-era").count()) > 0];
  });

  for (const [category, slug] of PROFILES) {
    await check(`Profile opens and is readable: ${slug} (${category})`, async () => {
      await page.goto(`${BASE}/explore/${slug}`, { waitUntil: "networkidle" });
      const heading = await page.locator("h1").first().textContent();
      const facts = await page.locator(".explore-facts").textContent();
      const sections = await page.locator(".explore-topic").count();
      return [Boolean(heading) && /Era/.test(facts || "") && sections >= 5 && !(await overflows(page)), `${sections} sections`];
    });
  }

  await page.goto(`${BASE}/explore/rabindranath-tagore`, { waitUntil: "networkidle" });
  const facts = async () => (await page.$$eval(".explore-topic .explore-claim span", (spans) => spans.map((span) => span.textContent))).sort().join("§");
  const order = async () => (await page.$$eval(".explore-topic h2", (headings) => headings.map((heading) => heading.textContent))).join("|");
  const before = { order: await order(), facts: await facts() };
  await page.getByRole("button", { name: "Educator" }).click();
  const after = { order: await order(), facts: await facts() };
  await check("Lens switching changes the focus (section order)", async () => [before.order !== after.order]);
  await check("Lens switching does not change the facts shown", async () => [before.facts === after.facts]);
  await check("Lens control shows the chosen lens and a shareable link", async () => [
    (await page.locator('.explore-lens-bar [aria-pressed="true"]').textContent()) === "Educator" && page.url().includes("lens=educator"),
  ]);
  await check("Citation opens source details with an original link", async () => {
    const claim = page.locator(".explore-topic .explore-claim").first();
    await claim.locator("summary").click();
    const link = claim.locator(".explore-evidence a").first();
    const href = (await link.getAttribute("href")) || "";
    return [(await link.isVisible()) && /^https?:\/\//.test(href), href];
  });
  await check("A related-person link opens that profile", async () => {
    const link = page.locator("#related a").first();
    const name = (await link.locator("strong").textContent()) || "";
    const href = (await link.getAttribute("href")) || "";
    await link.click();
    await page.waitForURL(`**${href}`, { timeout: 10000 });
    await page.waitForLoadState("networkidle");
    return [(await page.locator("h1").first().textContent()) === name, name];
  });
  await check("Ruler parameter view shows all 9 parameters (Ashoka)", async () => {
    await page.goto(`${BASE}/explore/ashoka`, { waitUntil: "networkidle" });
    return [(await page.locator("#framework .explore-parameters > li").count()) === 9];
  });
  await check("Rishi parameter view shows all 10 parameters (Yajnavalkya)", async () => {
    await page.goto(`${BASE}/explore/yajnavalkya`, { waitUntil: "networkidle" });
    return [(await page.locator("#framework .explore-parameters > li").count()) === 10];
  });
  await check("Keyboard focus moves through the page", async () => {
    await page.goto(`${BASE}/explore`, { waitUntil: "networkidle" });
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    return [await page.evaluate(() => Boolean(document.activeElement) && document.activeElement !== document.body)];
  });
  rec(label, "No JavaScript errors on any page visited", errors.length === 0, errors.slice(0, 2).join("; "));
  await browser.close();
}

await run("desktop 1280x900", { viewport: { width: 1280, height: 900 } });
await run("mobile iPhone 13 (emulated)", { ...devices["iPhone 13"] });

const failed = results.filter((result) => !result.ok);
console.log(JSON.stringify({ origin: BASE, checks: results.length, failed: failed.length, failures: failed }, null, 2));
process.exit(failed.length ? 1 : 0);
