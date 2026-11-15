import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const origin = process.env.MASL_25D_RUNTIME_URL
if (!origin) throw new Error('2.5D needs its disposable pinned Runtime URL')
const threadUrl = (id: string) => `${origin}/threads/${encodeURIComponent(id)}`

const makeThread = async (request: APIRequestContext): Promise<string> => {
  const response = await request.post(`${origin}/threads`, {
    data: { metadata: { lab: '2.5D', private_marker: 'HIDDEN_META_25D' } },
  })
  expect(response.ok()).toBeTruthy()
  const body = await response.json() as { thread_id: string }
  return body.thread_id
}
const seedToolRun = async (request: APIRequestContext, id: string) => {
  const response = await request.post(`${threadUrl(id)}/runs/wait`, {
    data: { assistant_id: 'masl_25a_tools', input: { messages: [] } }, timeout: 60_000,
  })
  expect(response.ok()).toBeTruthy()
}
const select = async (page: Page, id: string) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const picker = page.getByLabel('Thread', { exact: true })
  await expect(picker).toBeVisible()
  await picker.selectOption({ value: id })
  const messages = page.locator('.message-list')
  await expect(messages.locator('[data-role="tool"]').first()).toBeVisible()
  return messages
}
const cleanup = async (request: APIRequestContext, id: string) => {
  const response = await request.delete(threadUrl(id), { timeout: 6_000 })
  expect(response.ok()).toBeTruthy()
}

test('real persisted ToolMessage is redacted in generic MessageList, not only tool panel', async ({ page, request }) => {
  const id = await makeThread(request)
  let browserPosts = 0
  try {
    await seedToolRun(request, id)
    page.on('request', r => {
      if (r.method() === 'POST' && new URL(r.url()).pathname.startsWith(`/threads/${id}/`)) browserPosts += 1
    })
    const messages = await select(page, id)
    const tool = messages.locator('[data-role="tool"]')
    await expect(tool.locator('[data-content-redacted="true"]')).toHaveText(/Tool result content hidden/)
    await expect(page.getByRole('region', {name: 'Tool observations', exact: true})
      .locator('[data-tool-status="result-observed"]')).toHaveCount(1)
    await expect(page.locator('body')).not.toContainText('RESULT_25A:ALPHA_25A')
    await expect(page.locator('body')).not.toContainText('HIDDEN_META_25D')
    expect(browserPosts).toBe(0)
  } finally { await cleanup(request, id) }
})

test('opaque content, ToolMessage name and result are hidden while ordinary text survives', async ({page, request}) => {
  const id = await makeThread(request)
  try {
    await seedToolRun(request, id)
    await page.route(`${threadUrl(id)}/state`, async route => {
      if (route.request().method() !== 'GET') return route.continue()
      const actual = await route.fetch()
      expect(actual.ok()).toBeTruthy()
      const body = await actual.json() as {
        values: { messages: Array<Record<string, unknown>> }
      }
      body.values.messages.push(
        { type: 'human', id: 'public-human-25d', content: 'VISIBLE_HUMAN_TEXT_25D' },
        { type: 'ai', id: 'structured-ai-25d', content: [
          'VISIBLE_ASSISTANT_TEXT_25D', { tool_arguments: 'HIDDEN_ARGS_25D' },
        ] },
        { type: 'tool', id: 'secret-tool-25d', tool_call_id: 'orphan-25d',
          name: 'HIDDEN_TOOL_NAME_25D', content: 'HIDDEN_TOOL_CONTENT_25D' },
      )
      await route.fulfill({ response: actual, json: body })
    })
    const messages = await select(page, id)
    await expect(messages.locator('[data-role="tool"]')).toHaveCount(2)
    await expect(messages.locator('[data-role="tool"] [data-content-redacted="true"]')).toHaveCount(2)
    await expect(messages).toContainText('VISIBLE_HUMAN_TEXT_25D')
    await expect(messages).toContainText('VISIBLE_ASSISTANT_TEXT_25D')
    await expect(messages.locator('[data-content-redacted="true"]')).not.toHaveCount(0)
    const body = page.locator('body')
    await expect(body).not.toContainText('HIDDEN_ARGS_25D')
    await expect(body).not.toContainText('HIDDEN_TOOL_CONTENT_25D')
    await expect(body).not.toContainText('HIDDEN_TOOL_NAME_25D')
  } finally { await cleanup(request, id) }
})

test('streamed tool Run reconciles persisted state with output redacted', async ({page, request}) => {
  let createdThread: string | null = null
  try {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const button = page.getByRole('button', { name: 'Create Run', exact: true })
  await expect(button).toBeVisible()
  await page.getByRole('textbox', { name: 'User input' }).fill('Trigger deterministic ToolNode')
  await expect(button).toBeEnabled()
  let created = 0
  page.on('request', r => {
    if (r.method() === 'POST' && /\/threads\/[^/]+\/runs\/stream$/.test(new URL(r.url()).pathname)) created += 1
  })
  await button.click()
  await expect(page.locator('.execution-phase')).toHaveAttribute('data-phase', 'completed', {timeout: 45_000})
  await expect(page.getByRole('region', {name: 'Tool observations', exact: true})
    .locator('[data-tool-status="result-observed"]')).toHaveCount(1)
  await expect(page.locator('.message-list [data-role="tool"]'))
    .toContainText('Tool result content hidden')
  await expect(page.locator('body')).not.toContainText('RESULT_25A:ALPHA_25A')
  expect(created).toBe(1)
  createdThread = await page.getByLabel('Thread', { exact: true }).inputValue()
  } finally {
    if (createdThread) await cleanup(request, createdThread)
  }
})
