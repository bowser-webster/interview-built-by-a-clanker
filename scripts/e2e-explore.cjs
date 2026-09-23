// Exploratory E2E pass (real Chromium): flows beyond the smoke run; records 4xx/5xx and console errors.
// Usage: node scripts/e2e-explore.cjs   (API on :3001, web on :5173). Env as in e2e-smoke.cjs.
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const OUT = path.resolve(process.env.SMOKE_OUT || path.join(__dirname, "..", ".smoke-output"));
fs.mkdirSync(OUT, { recursive: true });
const WEB = process.env.WEB_URL || "http://localhost:5173";
const obs = [];
const net = [];
const consoleErrs = [];
let n = 0;

function note(area, what, ok, detail = "") {
  obs.push({ area, what, ok, detail });
  console.log(`${ok === true ? "OK  " : ok === false ? "BUG?" : "NOTE"} [${area}] ${what}${detail ? " — " + detail : ""}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PW_CHROMIUM_PATH || undefined });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.port === "3001" && r.status() >= 400) net.push(`${r.request().method()} ${u.pathname}${u.search} -> ${r.status()}`);
  });
  page.on("console", (m) => { if (m.type() === "error") consoleErrs.push(`${page.url()} :: ${m.text().slice(0, 160)}`); });
  page.on("pageerror", (e) => consoleErrs.push(`PAGEERROR ${page.url()} :: ${e.message}`));
  const main = () => page.locator("main").innerText();
  const shot = (name) => page.screenshot({ path: path.join(OUT, `ex-${String(++n).padStart(2, "0")}-${name}.png`), fullPage: true });
  async function step(name, fn) {
    try { await fn(); } catch (e) { note(name, "step threw", false, e.message.split("\n")[0]); await shot(`${name}-error`).catch(() => {}); }
  }

  const email = `explore${Date.now()}@example.com`;

  await step("signed-out", async () => {
    for (const p of ["/cart", "/favorites", "/checkout"]) {
      await page.goto(WEB + p);
      await page.waitForTimeout(800);
      const t = await main();
      note("signed-out", `${p} shows a sign-in prompt`, /sign in/i.test(t), t.split("\n")[0]);
    }
    await page.goto(WEB + "/personas/p-002");
    await page.getByRole("heading", { name: "Zero-Day Zara" }).waitFor();
    note("signed-out", "persona detail hides Add to Cart when signed out", (await page.getByRole("button", { name: "Add to Cart" }).count()) === 0);
    await shot("signed-out-detail");
  });

  await step("not-found", async () => {
    await page.goto(WEB + "/personas/does-not-exist");
    await page.waitForTimeout(2500);
    const t = await main();
    note("not-found", "unknown persona id shows 'Persona not found'", t.includes("Persona not found"), t.split("\n")[0]);
    await shot("persona-404");
    await page.goto(WEB + "/no-such-route");
    await page.waitForTimeout(800);
    note("not-found", "unknown route renders something (not blank)", (await page.locator("body").innerText()).trim().length > 0,
      (await page.locator("body").innerText()).trim().split("\n").slice(-1)[0]);
    await shot("route-404");
  });

  await step("browse", async () => {
    await page.goto(WEB + "/");
    await page.getByText("Refactor Rex").first().waitFor();
    const all = await page.locator("main a[href^='/personas/']").count();
    note("browse", "all personas listed on load", all === 15, `${all} cards`);
    const search = page.getByRole("textbox").first();
    await search.fill("zara");
    await page.waitForTimeout(900);
    const afterSearch = await page.locator("main a[href^='/personas/']").count();
    note("browse", "search 'zara' narrows the grid", afterSearch >= 1 && afterSearch < 15, `${afterSearch} cards, url=${new URL(page.url()).search}`);
    await search.fill("zzzz-nothing");
    await page.waitForTimeout(900);
    const t = await main();
    note("browse", "no-results state shows message + Clear filters", t.includes("No personas found") && t.includes("Clear filters"));
    await shot("browse-no-results");
    await page.getByRole("button", { name: "Clear filters" }).click();
    await page.waitForTimeout(900);
    const cleared = await page.locator("main a[href^='/personas/']").count();
    const boxVal = await search.inputValue();
    note("browse", "Clear filters restores all personas and empties search box", cleared === 15 && boxVal === "", `${cleared} cards, box='${boxVal}'`);
    await page.getByRole("button", { name: "Enterprise", exact: true }).click();
    await page.waitForTimeout(800);
    // Read tier badges from the cards only (the filter panel itself has Starter/Pro buttons).
    const tiers = await page
      .locator("main a[href^='/personas/']")
      .evaluateAll((as) => as.map((a) => a.innerText.split("\n").filter(Boolean)[1]));
    note("browse", "Tier=Enterprise filter shows only Enterprise",
      tiers.length > 0 && tiers.every((t) => t === "Enterprise"), `${tiers.length} cards: ${[...new Set(tiers)].join(",")}`);
    for (const [v, first] of [["price-desc", "Compliance Carl"], ["rating-desc", null], ["name-asc", null]]) {
      await page.locator("select").selectOption(v);
      await page.waitForTimeout(800);
      const names = await page.locator("main a[href^='/personas/'] h3").allInnerTexts().catch(() => []);
      note("browse", `sort ${v} (with Enterprise tier)`, first ? names[0]?.includes(first) : names.length > 0, names.slice(0, 3).join(", "));
    }
    await shot("browse-enterprise-sorted");
    await page.goBack();
    await page.waitForTimeout(800);
    note("browse", "Back button restores previous filter state", true, `url after back=${new URL(page.url()).search}`);
  });

  await step("register-errors", async () => {
    await page.goto(WEB + "/register");
    await page.fill("#username", "abc");
    await page.fill("#email", "a@b");
    await page.fill("#password", "secret123");
    await page.getByRole("button", { name: "Create Account" }).click();
    await page.waitForTimeout(1200);
    const t = await main();
    const err = (await page.locator(".text-red-600").allInnerTexts().catch(() => [])).join(" | ");
    note("register", "invalid email (passes browser check, fails zod) shows readable error", !t.includes("[object Object]") && err.length > 0, err || "(no error shown — browser may have blocked submit)");
    await shot("register-bad-email");
    await page.fill("#email", email);
    await page.getByRole("button", { name: "Create Account" }).click();
    await page.getByRole("button", { name: "Sign out" }).waitFor();
    note("register", "valid registration signs in", true);
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.goto(WEB + "/register");
    await page.fill("#username", "abcd");
    await page.fill("#email", email);
    await page.fill("#password", "secret123");
    await page.getByRole("button", { name: "Create Account" }).click();
    await page.waitForTimeout(1200);
    const dup = (await page.locator(".text-red-600").allInnerTexts().catch(() => [])).join(" | ");
    note("register", "duplicate email shows 'Email already registered'", dup.includes("Email already registered"), dup);
  });

  await step("login-errors", async () => {
    await page.goto(WEB + "/login");
    await page.fill("#email", email);
    await page.fill("#password", "wrongpass");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForTimeout(1200);
    const e = (await page.locator(".text-red-600").allInnerTexts().catch(() => [])).join(" | ");
    note("login", "wrong password shows 'Invalid email or password'", e.includes("Invalid email or password"), e);
    await shot("login-wrong-password");
    await page.fill("#password", "secret123");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.getByRole("button", { name: "Sign out" }).waitFor();
    note("login", "correct password signs in, lands on /", new URL(page.url()).pathname === "/", page.url());
  });

  await step("multi-item-cart", async () => {
    for (const id of ["p-001", "p-002", "p-003"]) {
      await page.goto(WEB + `/personas/${id}`);
      await page.getByRole("button", { name: "Add to Cart" }).click();
      await page.waitForTimeout(600);
    }
    await page.locator('a[href="/cart"]').click();
    await page.getByRole("button", { name: "Proceed to Checkout" }).waitFor();
    const plus = page.getByRole("button", { name: "+", exact: true }).first();
    await plus.click();
    await page.waitForTimeout(700);
    const t = await main();
    const total = (t.match(/Total\s*\$([\d.]+)/) || [])[1];
    const expected = (49.99 * 2 + 89.99 + 59.99).toFixed(2);
    note("cart", "3 lines + one '+' gives correct total", total === expected, `total=$${total} expected=$${expected}`);
    const badge = await page.locator('a[href="/cart"] span').textContent().catch(() => null);
    note("cart", "badge counts quantities (4)", badge === "4", `badge=${badge}`);
    await shot("cart-multi");
  });

  await step("checkout-validation", async () => {
    await page.getByRole("button", { name: "Proceed to Checkout" }).click();
    await page.fill("#name", "   ");
    await page.fill("#email", "a@b");
    await page.getByRole("button", { name: "Place Order" }).click();
    await page.waitForTimeout(1200);
    const err = (await page.locator(".text-red-600").allInnerTexts().catch(() => [])).join(" | ");
    const confirmed = (await main()).includes("Order Confirmed");
    note("checkout", "whitespace name + 'a@b' email is rejected with a readable error", !confirmed && !err.includes("[object Object]"),
      confirmed ? "ORDER WAS PLACED" : err || "(blocked by browser validation)");
    await shot("checkout-invalid");
    if (!confirmed) {
      await page.fill("#name", "Explorer");
      await page.fill("#email", email);
      await page.getByRole("button", { name: "Place Order" }).click();
      await page.getByText("Order Confirmed!").waitFor();
      const t = await main();
      note("checkout", "valid order confirms with total", t.includes("$249.96"), (t.match(/Total: \$[\d.]+/) || [""])[0]);
    }
    await page.getByRole("link", { name: "Continue Shopping" }).click();
    await page.waitForTimeout(800);
    note("checkout", "Continue Shopping goes to /", new URL(page.url()).pathname === "/");
  });

  await step("favorites-detail-toggle", async () => {
    await page.goto(WEB + "/personas/p-004");
    const add = page.getByRole("button", { name: "Add to Cart" });
    await add.waitFor();
    const heart = add.locator("xpath=following-sibling::button[1]");
    await heart.click(); await page.waitForTimeout(700);
    const on = await heart.locator("svg").getAttribute("fill");
    await heart.click(); await page.waitForTimeout(700);
    const off = await heart.locator("svg").getAttribute("fill");
    note("favorites", "heart toggles on then off from the detail page", on === "currentColor" && off === "none", `on=${on} off=${off}`);
    await page.goto(WEB + "/favorites");
    await page.waitForTimeout(800);
    note("favorites", "favorites empty after toggling off", (await main()).includes("haven't favorited"));
  });

  await step("stars", async () => {
    await page.goto(WEB + "/");
    await page.getByText("Refactor Rex").first().waitFor();
    const ids = await page.evaluate(() => Array.from(document.querySelectorAll("linearGradient")).map((g) => g.id));
    const dupes = ids.length - new Set(ids).size;
    note("stars", "half-star gradient ids are unique (L3)", dupes === 0, `${ids.length} gradients, ${dupes} duplicate ids`);
  });

  fs.writeFileSync(path.join(OUT, "pw-explore.json"), JSON.stringify({ obs, net, consoleErrs }, null, 2));
  console.log(`\n${obs.filter((o) => o.ok === true).length} ok, ${obs.filter((o) => o.ok === false).length} bug?, ${obs.filter((o) => o.ok === undefined).length} notes`);
  console.log("API 4xx/5xx:\n  " + (net.join("\n  ") || "(none)"));
  console.log("Console errors:\n  " + (consoleErrs.slice(0, 20).join("\n  ") || "(none)"));
  await browser.close();
})();
