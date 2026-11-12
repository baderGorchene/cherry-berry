import { defineConfig } from "@playwright/test";

// Own ports so e2e never collides with a dev server already running on 3000/5173.
const API = 3101;
const WEB = 5181;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  // Windows always ships Edge, so no browser download is needed there.
  // A failing test keeps its trace (test-results/…/trace.zip, open with `npx playwright show-trace`).
  use: { baseURL: `http://localhost:${WEB}`, channel: process.platform === "win32" ? "msedge" : undefined, trace: "retain-on-failure" },
  webServer: [
    {
      command: "pnpm --filter @cherry/server dev",
      url: `http://localhost:${API}/api/health`,
      timeout: 120_000,
      // Fresh in-memory database per run; dotenv never overrides these.
      env: {
        DATABASE_URL: "pglite:memory",
        AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-1234",
        PUBLIC_URL: `http://localhost:${WEB}`,
        PORT: String(API),
      },
    },
    {
      command: `pnpm --filter @cherry/web exec vite --port ${WEB}`,
      url: `http://localhost:${WEB}`,
      timeout: 120_000,
      env: { API_URL: `http://localhost:${API}` },
    },
  ],
});
