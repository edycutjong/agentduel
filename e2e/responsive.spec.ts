import { test, expect } from "@playwright/test";

/**
 * Responsive layout — the arena page must not overflow horizontally on mobile,
 * tablet, or desktop, and its core chrome must stay visible at every width.
 */
const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

for (const vp of VIEWPORTS) {
  test.describe(`layout @ ${vp.name} (${vp.width}px)`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("no horizontal overflow and header fits the viewport", async ({ page }) => {
      await page.goto("/");

      // Body must not scroll horizontally (allow 1px sub-pixel tolerance).
      const scrollWidth = await page.evaluate(
        () => document.scrollingElement?.scrollWidth ?? document.body.scrollWidth,
      );
      expect(scrollWidth).toBeLessThanOrEqual(vp.width + 1);

      // Core chrome stays visible.
      await expect(page.getByText("AGENTDUEL", { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      // Both duel agents remain reachable at this width.
      await expect(page.getByText("🔴 AGENT RED").first()).toBeVisible();
      await expect(page.getByText("🔵 AGENT CYAN").first()).toBeVisible();
    });

    test("interactive targets are tappable", async ({ page }) => {
      await page.goto("/");
      // In snapshot mode explorer links are absent by design; only assert on the
      // ones that ARE rendered, so the test is meaningful without being brittle.
      const links = page.locator("a:visible");
      const count = await links.count();
      for (let i = 0; i < count; i++) {
        const box = await links.nth(i).boundingBox();
        if (box) expect(box.height).toBeGreaterThanOrEqual(20);
      }
    });
  });
}
