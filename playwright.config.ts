import { defineConfig, devices } from "@playwright/test";

// One headless end-to-end walk of the whole trail. SwiftShader stands in for a GPU.
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 180_000,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4615",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
  webServer: {
    command: "bun run build && bun run preview",
    url: "http://127.0.0.1:4615",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
