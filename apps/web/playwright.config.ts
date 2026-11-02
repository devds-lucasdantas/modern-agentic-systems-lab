import {
  defineConfig,
  devices,
} from '@playwright/test'


export default defineConfig({
  testDir:
    './e2e',

  timeout:
    180_000,

  expect: {
    timeout:
      30_000,
  },

  fullyParallel:
    false,

  workers:
    1,

  reporter: [
    [
      'list',
    ],
    [
      'html',
      {
        open:
          'never',
      },
    ],
  ],

  use: {
    baseURL:
      'http://127.0.0.1:5173',

    trace:
      'retain-on-failure',

    screenshot:
      'only-on-failure',

    video:
      'retain-on-failure',
  },

  projects: [
    {
      name:
        'chromium',

      use: {
        ...devices[
          'Desktop Chrome'
        ],
      },
    },
  ],

  webServer: [
    {
      name:
        'agent-server',

      command:
        'pnpm run runtime:e2e',

      url:
        'http://127.0.0.1:2024/docs',

      reuseExistingServer:
        !process.env.CI,

      timeout:
        120_000,

      stdout:
        'pipe',

      stderr:
        'pipe',
    },

    {
      name:
        'vite',

      command:
        'pnpm run dev -- --host 127.0.0.1 --port 5173',

      url:
        'http://127.0.0.1:5173',

      reuseExistingServer:
        !process.env.CI,

      timeout:
        120_000,

      env: {
        ...process.env,

        VITE_AGENT_SERVER_URL:
          'http://127.0.0.1:2024',
      },

      stdout:
        'ignore',

      stderr:
        'pipe',
    },
  ],
})
