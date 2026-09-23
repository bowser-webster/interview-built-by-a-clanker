// E2E smoke of the review fixes (real Chromium). Requires API on :3001 and web on :5173.
// Usage: node scripts/e2e-smoke.cjs A   then restart the API (new per-boot secret)   then node scripts/e2e-smoke.cjs B
// Env: WEB_URL, SMOKE_OUT (default .smoke-output/), PW_CHROMIUM_PATH (optional existing Chromium).
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const OUT = path.resolve(process.env.SMOKE_OUT || path.join(__dirname, "..", ".smoke-output"));
fs.mkdirSync(OUT, { recursive: true });
const WEB = process.env.WEB_URL || "http://localhost:5173";
const STATE = path.join(OUT, "pw-state.json");
const phase = process.argv[2] ?? "A";
const results = [];
const net = [];

function check(id, step, ok, detail = "") {
  results.push({ id, step, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} [${id}] ${step}${detail ? " — " + detail : ""}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PW_CHROMIUM_PATH || undefined });
  const context = await browser.newContext(
    phase === "B" && fs.existsSync(STATE) ? { storageState: STATE } : {},
  );
  const page = await context.newPage();
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.port === "3001") net.push(`${r.request().method()} ${u.pathname}${u.search} -> ${r.status()}`);
  });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  const badge = () => page.locator('a[href="/cart"] span').textContent({ timeout: 1500 }).catch(() => null);
  const shot = (n) => page.screenshot({ path: path.join(OUT, `pw-${phase}-${n}.png`) });

  try {
    if (phase === "A") {
      // H7 — card prices
      await page.goto(WEB + "/");
      await page.getByText("Refactor Rex").first().waitFor();
      const body = await page.locator("main").innerText();
      check("H7", "card shows $49.99/mo, not $4999.00", body.includes("$49.99") && !body.includes("4999.00"));

      // H6 — filter + sort refetch
      const secResp = page.waitForResponse((r) => r.url().includes("specialty=Security"));
      await page.getByRole("button", { name: "Security", exact: true }).click();
      await secResp;
      await page.getByText("Zero-Day Zara").waitFor();
      const secText = await page.locator("main").innerText();
      check("H6", "Security filter refetches and shows only Security personas",
        secText.includes("Zero-Day Zara") && secText.includes("Compliance Carl") && !secText.includes("Refactor Rex"));
      await page.getByRole("button", { name: "Security", exact: true }).click();
      const sortResp = page.waitForResponse((r) => r.url().includes("sort=price-asc"));
      await page.locator("select").selectOption("price-asc");
      await sortResp;
      await page.waitForTimeout(300);
      const firstCard = await page.locator("main a[href^='/personas/']").first().innerText();
      check("H6", "sort price-asc puts cheapest (Onboard Olivia $34.99) first", firstCard.includes("Onboard Olivia"), firstCard.split("\n")[0]);
      await shot("1-browse");

      // Register (M1 via register; E2 path) — unique email per run
      const email = `alice${Date.now()}@example.com`;
      await page.goto(WEB + "/register");
      await page.fill("#username", "alice");
      await page.fill("#email", email);
      await page.fill("#password", "secret123");
      await page.getByRole("button", { name: "Create Account" }).click();
      await page.getByRole("button", { name: "Sign out" }).waitFor();
      check("M1", "register signs in and nav shows username", (await page.locator("nav").innerText()).includes("alice"));

      // H5 + H8 — favorite from detail, then favorites page, then back to detail
      await page.goto(WEB + "/personas/p-001");
      const addBtn = page.getByRole("button", { name: "Add to Cart" });
      await addBtn.waitFor();
      const heart = addBtn.locator("xpath=following-sibling::button[1]");
      const favPost = page.waitForResponse((r) => r.url().endsWith("/favorites") && r.request().method() === "POST");
      await heart.click();
      const fp = await favPost;
      await page.waitForTimeout(500);
      const filled = await heart.locator("svg").getAttribute("fill");
      check("H5", "empty heart sends POST /favorites and fills", fp.status() === 200 && filled === "currentColor", `POST ${fp.status()}, fill=${filled}`);
      await page.getByRole("link", { name: "Favorites" }).click();
      await page.getByText("Refactor Rex").first().waitFor({ timeout: 5000 }).catch(() => {});
      check("H8", "favorites page lists the favorite after visiting detail", (await page.locator("main").innerText()).includes("Refactor Rex"));
      await page.locator("main a[href='/personas/p-001']").first().click();
      await page.getByRole("heading", { name: "Refactor Rex" }).waitFor({ timeout: 5000 }).catch(() => {});
      check("H8", "detail page renders after /favorites (no includes() crash)",
        (await page.getByRole("heading", { name: "Refactor Rex" }).count()) > 0 && !pageErrors.some((e) => e.includes("includes")), pageErrors.join(" | "));

      // E1 — unfavorite via DELETE from the favorites page
      await page.getByRole("link", { name: "Favorites" }).click();
      await page.getByTitle("Remove from favorites").first().waitFor();
      const favDel = page.waitForResponse((r) => r.url().includes("/favorites/p-001") && r.request().method() === "DELETE");
      await page.getByTitle("Remove from favorites").first().click();
      const fd = await favDel;
      await page.getByText("You haven't favorited any personas yet").waitFor({ timeout: 5000 }).catch(() => {});
      check("E1/H1", "browser DELETE /favorites/p-001 succeeds and list empties",
        fd.status() === 200 && (await page.locator("main").innerText()).includes("haven't favorited"), `DELETE ${fd.status()}`);

      // M6 — badge updates on add
      await page.goto(WEB + "/personas/p-001");
      await page.getByRole("button", { name: "Add to Cart" }).click();
      await page.waitForTimeout(700);
      const b1 = await badge();
      await page.getByRole("button", { name: "Add to Cart" }).click();
      await page.waitForTimeout(700);
      const b2 = await badge();
      check("M6", "badge updates after each Add to Cart without reload", b1 === "1" && b2 === "2", `badge ${b1} -> ${b2}`);

      // M9 + E1 on cart — "−" then disabled at 1, Remove via DELETE
      await page.locator('a[href="/cart"]').click();
      await page.getByRole("button", { name: "Remove" }).waitFor();
      const minus = page.getByRole("button", { name: "-", exact: true });
      await minus.click();
      await page.waitForTimeout(700);
      check("M9", "'-' at qty 1 is disabled", await minus.isDisabled(), `badge now ${await badge()}`);
      await shot("2-cart-qty1");
      const cartDel = page.waitForResponse((r) => r.url().includes("/cart/") && r.request().method() === "DELETE");
      await page.getByRole("button", { name: "Remove" }).click();
      const cd = await cartDel;
      await page.getByText("Your cart is empty").waitFor({ timeout: 5000 }).catch(() => {});
      check("E1/H1", "browser DELETE /cart/:id succeeds, cart empties, badge gone",
        cd.status() === 200 && (await page.locator("main").innerText()).includes("Your cart is empty") && (await badge()) === null, `DELETE ${cd.status()}`);

      // H3 + M6 — checkout clears cart and badge
      await page.goto(WEB + "/personas/p-003");
      await page.getByRole("button", { name: "Add to Cart" }).click();
      await page.waitForTimeout(700);
      await page.locator('a[href="/cart"]').click();
      await page.getByRole("button", { name: "Proceed to Checkout" }).click();
      await page.fill("#name", "Alice A");
      await page.fill("#email", email);
      await page.getByRole("button", { name: "Place Order" }).click();
      await page.getByText("Order Confirmed!").waitFor();
      await page.waitForTimeout(700);
      const orderBadge = await badge();
      await shot("3-order");
      await page.goto(WEB + "/cart");
      await page.getByText("Your cart is empty").waitFor({ timeout: 5000 }).catch(() => {});
      check("H3/M6", "after checkout: badge gone and cart empty",
        orderBadge === null && (await page.locator("main").innerText()).includes("Your cart is empty"), `badge after order=${orderBadge}`);

      // H9 — sign out, reload, still signed out
      await page.getByRole("button", { name: "Sign out" }).click();
      await page.reload();
      await page.getByRole("link", { name: "Sign in" }).waitFor();
      const tok = await page.evaluate(() => localStorage.getItem("auth_token"));
      check("H9", "sign out + reload stays signed out, token removed",
        tok === null && !(await page.locator("nav").innerText()).includes("alice"), `token=${tok}`);

      // M1 — login returns username
      await page.goto(WEB + "/login");
      await page.fill("#email", email);
      await page.fill("#password", "secret123");
      await page.getByRole("button", { name: "Sign In" }).click();
      await page.getByRole("button", { name: "Sign out" }).waitFor();
      check("M1", "login shows username immediately (no reload)", (await page.locator("nav").innerText()).includes("alice"));

      await context.storageState({ path: STATE });
    } else {
      // E3 — API restarted with a new per-boot secret; the stored token is now invalid
      await page.goto(WEB + "/cart");
      await page.getByText("Sign in to view your cart").waitFor({ timeout: 8000 }).catch(() => {});
      const tok = await page.evaluate(() => localStorage.getItem("auth_token"));
      const main = await page.locator("main").innerText();
      await shot("4-after-restart");
      check("E3", "after API restart the UI drops the session (no fake 'empty cart')",
        tok === null && main.includes("Sign in to view your cart") && !(await page.locator("nav").innerText()).includes("alice"),
        `token=${tok ? "present" : "null"}`);
    }
  } catch (e) {
    check("RUN", "script error", false, e.message.split("\n")[0]);
    await shot("error").catch(() => {});
  }

  if (pageErrors.length) console.log("pageerrors:", pageErrors);
  fs.writeFileSync(path.join(OUT, `pw-smoke-${phase}.json`), JSON.stringify({ results, net, pageErrors }, null, 2));
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
  console.log("API calls:\n  " + net.join("\n  "));
  await browser.close();
})();
