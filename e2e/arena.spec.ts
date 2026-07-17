import { test, expect } from "@playwright/test";

/**
 * Core arena-page flow. The judge's journey: read the pitch → see two agents on
 * opposing sides of a live duel → see a settled duel with an on-chain-shaped
 * payout that is honestly labeled MOCK/rehearsal → find the "field your own"
 * Skill. All from the committed snapshot, no funds.
 */
test.describe("arena page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("hero states the thesis", async ({ page }) => {
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toContainText("Two agents. One match.");
    await expect(h1).toContainText("paid on-chain");
  });

  test("shows live duels with two opposing agents", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Live duels/i })).toBeVisible();

    // A real seeded fixture from the snapshot.
    await expect(page.getByText("SF: FRA vs ESP").first()).toBeVisible();

    // Both agents are present and on opposing sides. The VS divider sits between
    // the panels; it is decorative and CSS-hidden below 720px, so assert it is in
    // the DOM (attached) rather than visible — the test must pass on mobile too.
    await expect(page.getByText("🔴 AGENT RED").first()).toBeVisible();
    await expect(page.getByText("🔵 AGENT CYAN").first()).toBeVisible();
    await expect(page.getByText("VS", { exact: true }).first()).toBeAttached();
  });

  test("shows a settled duel with an honestly-labeled payout", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Settled/i })).toBeVisible();
    await expect(page.getByText("QF: FRA vs MAR").first()).toBeVisible();

    // The payout is a labeled MOCK (never a 0x hash) — the honesty rule, on screen.
    await expect(page.getByText("MOCK").first()).toBeVisible();
    await expect(page.getByText("transfer_send").first()).toBeVisible();
    await expect(page.getByText(/rehearsal/i).first()).toBeVisible();

    // The reproducible settlement decision hash is shown.
    await expect(page.getByText(/decision#/i).first()).toBeVisible();
  });

  test("prints the economics before entry (0.18 payout / 0.02 fee)", async ({ page }) => {
    await expect(page.getByText(/purse\s*0\.18\s*USDC/i).first()).toBeVisible();
    await expect(page.getByText(/fee\s*0\.02/i).first()).toBeVisible();
  });

  test("has a Verify section with the trust model and the Skill", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Verify/i })).toBeVisible();
    await expect(page.getByText(/Trust model/i).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /Field your own duelist/i })).toBeVisible();

    // The install snippet references real, existing scripts.
    await expect(page.getByText(/npm run red/).first()).toBeVisible();
    await expect(page.getByText(/npm run cyan/).first()).toBeVisible();
  });
});
