import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for the judge-facing arena page (web/).
 *
 * The web app is a Next.js server component that renders from the committed
 * `web/lib/arena-snapshot.json` whenever `AGENTDUEL_API_URL` is unset — so every
 * spec here runs in demo/snapshot mode with ZERO env keys and zero funds.
 *
 * The app's canonical port is 3403 (see web/package.json `start`/`dev` and the
 * README quickstart), so we drive it there rather than forcing a different port.
 */
const PORT = 3403;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "html" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // Build then start web/ on :3403. reuseExistingServer locally so `npm run web:dev`
    // (or a prior run) is picked up; CI always builds + starts fresh.
    command: "npm --prefix web run build && npm --prefix web run start",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
