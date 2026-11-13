import { defineConfig, devices } from '@playwright/test'

const runtimeUrl = process.env.MASL_HITL_RUNTIME_URL
const vitePort = Number(process.env.MASL_HITL_VITE_PORT)
if (!runtimeUrl || !Number.isInteger(vitePort) || vitePort < 1024) {
  throw new Error('Set MASL_HITL_RUNTIME_URL and MASL_HITL_VITE_PORT via the 2.4E-B runner')
}

export default defineConfig({
  testDir: './e2e',
  testMatch: 'hitl-recovery-ui.spec.ts',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${vitePort}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec vite --host 127.0.0.1 --port ${vitePort} --strictPort`,
    url: `http://127.0.0.1:${vitePort}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { ...process.env, VITE_AGENT_SERVER_URL: runtimeUrl },
  },
})
