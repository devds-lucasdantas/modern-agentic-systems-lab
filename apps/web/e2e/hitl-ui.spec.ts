import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const origin = process.env.MASL_HITL_RUNTIME_URL
if (!origin) throw new Error('2.4D requires the disposable Runtime URL')

const threadPath = (id: string) => `${origin}/threads/${encodeURIComponent(id)}`

const disposableThread = async (request: APIRequestContext, graphId: string) => {
  const result = await request.post(`${origin}/threads`, {
    data: { metadata: { graph_id: graphId, lab: '2.4D' } },
  })
  expect(result.ok()).toBeTruthy()
  const body = await result.json() as { thread_id: string }
  return body.thread_id
}

const seedPause = async (request: APIRequestContext, id: string, breakpoint = false) => {
  const body: Record<string, unknown> = {
    assistant_id: breakpoint ? 'masl_24a_breakpoint' : 'masl_24a_hitl',
    input: { request: breakpoint ? 'BREAKPOINT_24D' : 'INITIAL_24D' },
  }
  if (breakpoint) body.interrupt_before = ['checkpoint_only']
  const result = await request.post(`${threadPath(id)}/runs/wait`, { data: body })
  expect(result.ok()).toBeTruthy()
}

const selectThread = async (page: Page, id: string) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const picker = page.getByLabel('Thread', { exact: true })
  await expect(picker).toBeVisible()
  await picker.selectOption({ value: id })
  const panel = page.getByRole('region', {
    name: 'Human-in-the-loop laboratory',
    exact: true,
  })
  await expect(panel, 'HITL region must render exactly once').toHaveCount(1)
  await expect(panel).toBeVisible()
  // Wait for the selected Thread's persisted projection, not a repeated heading.
  await expect(panel.locator('[data-hitl-situation]')).not.toHaveText('not loaded')
  return panel
}

const cleanup = async (request: APIRequestContext, id: string) => {
  try { await request.delete(threadPath(id), { timeout: 6_000 }) }
  catch (error) { console.warn(`WARN: cleanup failed: ${String(error)}`) }
}

test('explicit deterministic approval creates one resume Run and independently confirms END', async ({ page, request }) => {
  const id = await disposableThread(request, 'masl_24a_hitl')
  let resumePosts = 0
  try {
    await seedPause(request, id)
    page.on('request', req => {
      if (req.method() === 'POST' &&
          new URL(req.url()).pathname === `/threads/${encodeURIComponent(id)}/runs`) resumePosts += 1
    })
    const panel = await selectThread(page, id)
    await expect(panel.getByText('Approve the deterministic probe?')).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Resume reviewed probe' })).toBeDisabled()
    await panel.getByLabel('Human response').selectOption('APPROVE_24D')
    await panel.getByRole('checkbox', { name: /I understand that submitting/ }).check()
    await panel.getByRole('button', { name: 'Resume reviewed probe' }).click()
    await expect(panel.getByText(/independent persisted state confirms END/)).toBeVisible({ timeout: 30_000 })
    const stateResponse = await request.get(`${threadPath(id)}/state`)
    expect(stateResponse.ok()).toBeTruthy()
    const state = await stateResponse.json() as {
      next: string[], interrupts: unknown[], values: Record<string, unknown>
    }
    expect(state.next).toEqual([])
    expect(state.interrupts).toEqual([])
    expect(state.values.result).toBe('RESUMED:APPROVE_24D')
    expect(resumePosts).toBe(1)
    await expect(panel.getByRole('button', { name: 'Resume reviewed probe' })).toHaveCount(0)
  } finally { await cleanup(request, id) }
})

test('execution breakpoint is never promoted to a human approval', async ({ page, request }) => {
  const id = await disposableThread(request, 'masl_24a_breakpoint')
  let resumePosts = 0
  try {
    await seedPause(request, id, true)
    page.on('request', req => {
      if (req.method() === 'POST' && new URL(req.url()).pathname.endsWith('/runs')) resumePosts += 1
    })
    const panel = await selectThread(page, id)
    await expect(panel.locator('[data-hitl-blocked]')).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Resume reviewed probe' })).toHaveCount(0)
    expect(resumePosts).toBe(0)
  } finally { await cleanup(request, id) }
})

test('a changed HEAD in preflight blocks resume without POST', async ({ page, request }) => {
  const id = await disposableThread(request, 'masl_24a_hitl')
  let resumePosts = 0
  try {
    await seedPause(request, id)
    page.on('request', req => {
      if (req.method() === 'POST' && new URL(req.url()).pathname === `/threads/${encodeURIComponent(id)}/runs`) resumePosts += 1
    })
    const panel = await selectThread(page, id)
    await expect(panel.getByText('Approve the deterministic probe?')).toBeVisible()
    await page.route(`${threadPath(id)}/state`, async route => {
      if (route.request().method() !== 'GET') return route.continue()
      const real = await route.fetch()
      const body = await real.json() as { checkpoint: { checkpoint_id: string } }
      body.checkpoint.checkpoint_id = 'SIMULATED_ADVANCED_HEAD'
      await route.fulfill({ response: real, json: body })
    })
    await panel.getByLabel('Human response').selectOption('REJECT_24D')
    await panel.getByRole('checkbox', { name: /I understand that submitting/ }).check()
    await panel.getByRole('button', { name: 'Resume reviewed probe' }).click()
    await expect(panel.locator('[data-hitl-stage="stale"][role="status"]'))
      .toContainText('No resume POST was sent.')
    await expect(panel.getByRole('button', { name: 'Resume reviewed probe' })).toBeDisabled()
    expect(resumePosts).toBe(0)
  } finally { await cleanup(request, id) }
})
