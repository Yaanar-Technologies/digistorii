import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./",
  timeout: 120000,
  expect: {
    timeout: 15000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "https://testdigistorii.workpro.cloud",
    headless: true,
    screenshot: "off",
    video: "off",
    trace: "off",
    ignoreHTTPSErrors: true,
    launchOptions: {
      executablePath: "C:\\Users\\yanna\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  },
});
