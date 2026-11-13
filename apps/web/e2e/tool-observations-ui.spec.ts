import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const origin = process.env.MASL_25C_RUNTIME_URL
if (!origin) throw new Error('2.5C requires its isolated Runtime URL')

const threadUrl = (id: string) => `${origin}/threads/${encodeURIComponent(id)}`

const makeThread = async (request: APIRequestContext): Promise<string> => {
  const response = await request.post(`${origin}/threads`, {
    data: { metadata: { lab: '2.5C', private_marker: 'HIDDEN_THREAD_METADATA_25C' } },
  })
  expect(response.ok()).toBeTruthy()
  const body = await response.json() as { thread_id: string }
  expect(typeof body.thread_id).toBe('string')
  return body.thread_id
}

const seedToolRun = async (request: APIRequestContext, id: string): Promise<void> => {
  const response = await request.post(`${threadUrl(id)}/runs/wait`, {
    data: { assistant_id: 'masl_25a_tools', input: { messages: [] } },
    timeout: 60_000,
  })
  expect(response.ok()).toBeTruthy()
  const state = await request.get(`${threadUrl(id)}/state`)
  expect(state.ok()).toBeTruthy()
  const body = await state.json() as {
    next: string[]
    values: { messages: Array<Record<string, unknown>> }
  }
  expect(body.next).toEqual([])
  expect(body.values.messages.some(m => m.type === 'tool' &&
    m.tool_call_id === 'masl-call-25a-1')).toBeTruthy()
}

const select = async (page: Page, id: string) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const picker = page.getByLabel('Thread', { exact: true })
  await expect(picker).toBeVisible()
  await picker.selectOption({ value: id })
  const panel = page.getByRole('region', { name: 'Tool observations', exact: true })
  await expect(panel).toHaveCount(1)
  await expect(panel).toBeVisible()
  return panel
}

const cleanup = async (request: APIRequestContext, id: string) => {
  const deleted = await request.delete(threadUrl(id), { timeout: 6_000 })
  expect(deleted.ok()).toBeTruthy()
}

test('real ToolNode persists a single correlated call; panel is read-only and payload-free', async ({page, request}) => {
  const id = await makeThread(request)
  let mutationPosts = 0
  try {
    await seedToolRun(request, id)
    page.on('request', req => {
      if (req.method() === 'POST' && new URL(req.url()).pathname.startsWith(`/threads/${id}/`)) {
        mutationPosts += 1
      }
    })
    const panel = await select(page, id)
    await expect(panel.locator('[data-tool-situation="observed"]')).toBeVisible()
    await expect(panel.locator('[data-tool-graph-position]')).toHaveText('END')
    await expect(panel.locator('[data-tool-counts]')).toHaveText('1 / 1')
    const observed = panel.locator('[data-tool-call-id="masl-call-25a-1"]')
    await expect(observed).toHaveCount(1)
    await expect(observed).toContainText('deterministic_lookup_25a')
    await expect(observed).toHaveAttribute('data-tool-status', 'result-observed')
    await expect(observed).toContainText('Matching ToolMessage observed')
    await expect(panel).not.toContainText('ALPHA_25A')
    await expect(panel).not.toContainText('RESULT_25A:ALPHA_25A')
    await expect(panel).not.toContainText('HIDDEN_THREAD_METADATA_25C')
    await expect(panel.getByRole('button')).toHaveCount(0)
    expect(mutationPosts).toBe(0)
  } finally { await cleanup(request, id) }
})

test('changing Threads clears the old tool projection and never triggers a Run', async ({page, request}) => {
  const seeded = await makeThread(request)
  const empty = await makeThread(request)
  let mutationPosts = 0
  try {
    await seedToolRun(request, seeded)
    page.on('request', req => {
      if (req.method() === 'POST' && /\/threads\/[^/]+\/runs/.test(new URL(req.url()).pathname)) mutationPosts += 1
    })
    const panel = await select(page, seeded)
    await expect(panel.locator('[data-tool-situation="observed"]')).toBeVisible()
    const picker = page.getByLabel('Thread', { exact: true })
    await picker.selectOption({value:empty})
    await expect(panel.locator('[data-tool-situation="unavailable"]')).toBeVisible()
    await expect(panel.locator('[data-tool-call-id="masl-call-25a-1"]')).toHaveCount(0)
    await expect(panel.locator('[data-tool-graph-position]')).toHaveText('Not END')
    // An empty Thread may have an empty initial persisted checkpoint; the projector
    // must not fabricate a tool call. No POST originates from this panel.
    expect(mutationPosts).toBe(0)
  } finally { await cleanup(request, seeded); await cleanup(request, empty) }
})

test('a conflicting persisted ToolMessage is reported as incomplete without showing its content', async ({page, request}) => {
  const id = await makeThread(request)
  try {
    await seedToolRun(request, id)
    await page.route(`${threadUrl(id)}/state`, async route => {
      if (route.request().method() !== 'GET') return route.continue()
      const actual = await route.fetch()
      const body = await actual.json() as {
        values: {messages: Array<Record<string, unknown>>}
      }
      const original = body.values.messages.find(m => m.type === 'tool')
      expect(original).toBeDefined()
      body.values.messages.push({ ...original, id: 'injected-orphan-25c',
        tool_call_id: 'orphan-25c', content: 'DO_NOT_EXPOSE_ORPHAN_25C' })
      await route.fulfill({ response: actual, json: body })
    })
    const panel = await select(page, id)
    await expect(panel.locator('[data-tool-situation="incomplete"]')).toBeVisible()
    await expect(panel.locator('[data-tool-incomplete]')).toContainText('1 orphan results')
    await expect(panel).not.toContainText('DO_NOT_EXPOSE_ORPHAN_25C')
  } finally { await cleanup(request, id) }
})
