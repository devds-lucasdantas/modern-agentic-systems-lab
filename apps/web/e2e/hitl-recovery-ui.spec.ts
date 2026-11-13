import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const origin = process.env.MASL_HITL_RUNTIME_URL
if (!origin) throw new Error('2.4E-B requires the disposable Runtime URL')
const threadPath = (id: string) => `${origin}/threads/${encodeURIComponent(id)}`

const createPaused = async (request: APIRequestContext) => {
  const created = await request.post(`${origin}/threads`, {
    data: { metadata: { graph_id: 'masl_24a_hitl', lab: '2.4E-B' } },
  })
  expect(created.ok()).toBeTruthy()
  const id = (await created.json() as { thread_id: string }).thread_id
  const seed = await request.post(`${threadPath(id)}/runs/wait`, {
    data: { assistant_id: 'masl_24a_hitl', input: { request: 'INITIAL_24E' } },
  })
  expect(seed.ok()).toBeTruthy()
  return id
}

const openPanel = async (page: Page, id: string) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const picker = page.getByLabel('Thread', { exact: true })
  await expect(picker).toBeVisible()
  await picker.selectOption(id)
  const panel = page.getByRole('region', {
    name: 'Human-in-the-loop laboratory', exact: true,
  })
  await expect(panel).toHaveCount(1)
  await expect(panel.locator('[data-hitl-situation]')).toHaveText('graph-interrupt')
  return panel
}

const selectResponse = async (panel: ReturnType<Page['getByRole']>) => {
  await panel.getByLabel('Human response').selectOption('APPROVE_24D')
  await panel.getByRole('checkbox', { name: /I understand that submitting/ }).check()
}

const cleanup = async (request: APIRequestContext, id: string) => {
  try { await request.delete(threadPath(id), { timeout: 8_000 }) }
  catch (error) { console.warn(`WARN: 2.4E-B cleanup failed: ${String(error)}`) }
}

const awaitGraphEnd = async (request: APIRequestContext, id: string) => {
  await expect.poll(async () => {
    const response = await request.get(`${threadPath(id)}/state`)
    if (!response.ok()) return 'unavailable'
    const state = await response.json() as {
      next: unknown[]; interrupts: unknown[]; values: { result?: string }
    }
    if (state.next.length || state.interrupts.length) return 'pending'
    return state.values.result ?? 'missing'
  }, { timeout: 30_000 }).toBe('RESUMED:APPROVE_24D')
}

test('accepted POST with lost response stays interlocked and manual GET confirms END', async ({ page, request }) => {
  const id = await createPaused(request)
  let attemptedPosts = 0
  try {
    const panel = await openPanel(page, id)
    const endpoint = `${threadPath(id)}/runs`
    await page.route(endpoint, async route => {
      if (route.request().method() !== 'POST') return route.continue()
      attemptedPosts += 1
      // Send the real POST, obtain the server response, but make the browser
      // experience a transport loss. Do NOT simulate a non-committed POST.
      const received = await route.fetch()
      expect(received.ok()).toBeTruthy()
      await route.abort('failed')
    })
    await selectResponse(panel)
    await panel.getByRole('button', { name: 'Resume reviewed probe' }).click()
    await expect(panel.locator('[data-hitl-stage="ambiguous"]')).toBeVisible()
    await expect(panel.locator('[data-hitl-interlock]')).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Resume reviewed probe' })).toBeDisabled()
    expect(attemptedPosts).toBe(1)
    await awaitGraphEnd(request, id)
    // Remove interception: recovery must issue GET requests only.
    await page.unroute(endpoint)
    await panel.getByRole('button', { name: 'Inspect submitted attempt (read only)' }).click()
    await expect(panel.locator('[data-hitl-stage="confirmed"]'))
      .toContainText('independent persisted state confirms END')
    expect(attemptedPosts).toBe(1)
    const runs = await request.get(`${threadPath(id)}/runs`)
    expect(runs.ok()).toBeTruthy()
    const entries = await runs.json() as Array<{ metadata: Record<string, unknown> }>
    expect(entries).toHaveLength(2)
    expect(entries.some(run => typeof run.metadata?.masl_resume_attempt_id === 'string')).toBeTruthy()
  } finally { await cleanup(request, id) }
})

test('HTTP 409 remains a conflict; inspecting unchanged state never retries', async ({ page, request }) => {
  const id = await createPaused(request)
  let attemptedPosts = 0
  try {
    const panel = await openPanel(page, id)
    const endpoint = `${threadPath(id)}/runs`
    await page.route(endpoint, async route => {
      if (route.request().method() !== 'POST') return route.continue()
      attemptedPosts += 1
      await route.fulfill({ status: 409, contentType: 'application/json',
        body: '{"detail":"simulated concurrent Run conflict"}' })
    })
    await selectResponse(panel)
    await panel.getByRole('button', { name: 'Resume reviewed probe' }).click()
    await expect(panel.locator('[data-hitl-stage="conflict"]')).toContainText('HTTP 409')
    await expect(panel.getByRole('button', { name: 'Resume reviewed probe' })).toBeDisabled()
    await page.unroute(endpoint)
    await panel.getByRole('button', { name: 'Inspect submitted attempt (read only)' }).click()
    await expect(panel.locator('[data-hitl-stage="unreconciled"]'))
      .toContainText('not-observed')
    await expect(panel.getByRole('button', { name: 'Resume reviewed probe' })).toBeDisabled()
    expect(attemptedPosts).toBe(1)
    const runs = await request.get(`${threadPath(id)}/runs`)
    expect((await runs.json() as unknown[])).toHaveLength(1)
  } finally { await cleanup(request, id) }
})

test('readback failure after lost POST remains ambiguous until a later GET', async ({ page, request }) => {
  const id = await createPaused(request)
  let attemptedPosts = 0
  let failReads = true
  try {
    const panel = await openPanel(page, id)
    const endpoint = `${threadPath(id)}/runs`
    await page.route(endpoint, async route => {
      if (route.request().method() !== 'POST') return route.continue()
      attemptedPosts += 1
      const received = await route.fetch()
      expect(received.ok()).toBeTruthy()
      await route.abort('failed')
    })
    await selectResponse(panel)
    await panel.getByRole('button', { name: 'Resume reviewed probe' }).click()
    await expect(panel.locator('[data-hitl-stage="ambiguous"]')).toBeVisible()
    await awaitGraphEnd(request, id)
    await page.route(`${threadPath(id)}/state`, async route => {
      if (failReads && route.request().method() === 'GET') {
        return route.fulfill({ status: 503, contentType: 'application/json',
          body: '{"detail":"simulated recovery readback outage"}' })
      }
      return route.continue()
    })
    await panel.getByRole('button', { name: 'Inspect submitted attempt (read only)' }).click()
    await expect(panel.locator('[data-hitl-stage="ambiguous"]'))
      .toContainText('Read-only inspection failed')
    await expect(panel.getByRole('button', { name: 'Resume reviewed probe' })).toBeDisabled()
    failReads = false
    await panel.getByRole('button', { name: 'Inspect submitted attempt (read only)' }).click()
    await expect(panel.locator('[data-hitl-stage="confirmed"]'))
      .toContainText('independent persisted state confirms END')
    expect(attemptedPosts).toBe(1)
  } finally { await cleanup(request, id) }
})
