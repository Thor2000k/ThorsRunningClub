import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8011",
    locale: "en-GB",
    timezoneId: "Europe/Copenhagen",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: {
    command: "python3 server/app.py",
    url: "http://127.0.0.1:8011/api/workouts",
    env: {
      PORT: "8011",
      DATABASE_PATH: `/tmp/thors-e2e-${process.pid}.sqlite3`,
      SEED_DEMO: "false",
      WORKOUT_IMPORT_TOKEN: "local-e2e-import-token",
    },
    reuseExistingServer: false,
  },
});
