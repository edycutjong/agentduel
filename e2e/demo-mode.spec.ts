import { test, expect } from "@playwright/test";

/**
 * Smoke test — the arena page must load with ZERO env keys and zero funds.
 * With AGENTDUEL_API_URL unset the server component renders the committed
 * snapshot, so the whole page is falsifiable without a wallet or a running API.
 */
test.describe("demo mode (no API keys, snapshot fallback)", () => {
  test("loads, has correct metadata, and renders in snapshot mode", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/");

    // Title + description come from the Next.js metadata export.
    await expect(page).toHaveTitle(/AgentDuel/i);
    const description = await page
      .locator('meta[name="description"]')
      .getAttribute("content");
    expect(description).toBeTruthy();
    expect(description!.length).toBeGreaterThan(20);

    // The brand chrome is present.
    await expect(page.getByText("AGENTDUEL", { exact: true })).toBeVisible();

    // "data: snapshot" pill proves the page rendered from the committed snapshot
    // (i.e. no live API / no keys were needed).
    await expect(page.getByText(/data:\s*snapshot/i)).toBeVisible();

    // No Next.js runtime error overlay.
    await expect(page.locator("nextjs-portal")).toHaveCount(0);
    await expect(page.getByText(/Application error|Unhandled Runtime Error/i)).toHaveCount(0);

    // No severe console errors (ignore favicon/network noise that is irrelevant here).
    const severe = consoleErrors.filter(
      (e) => !/favicon|net::ERR|Failed to load resource/i.test(e),
    );
    expect(severe, `unexpected console errors: ${severe.join("\n")}`).toEqual([]);
  });

  test("exposes the Injective tech pill row", async ({ page }) => {
    await page.goto("/");
    for (const label of [
      "Injective x402",
      "USDC CCTP",
      "MCP Server",
      "Agent Skills",
      "World Cup data",
    ]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });
});
