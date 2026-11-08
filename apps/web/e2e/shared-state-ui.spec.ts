import {
  expect,
  test,
  type Page,
} from '@playwright/test'

const origin = 'http://127.0.0.1:2024'

// Fail promptly and report the actual page when the browser did not render
// the application. Playwright may reuse an unrelated Vite server on port 5173.
test.setTimeout(90_000)

const openAndSelectThread = async (page: Page, threadId: string) => {
  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })

  const response = await page.goto('/', { waitUntil: 'domcontentloaded' })
  const picker = page.getByLabel('Thread', { exact: true })

  try {
    await expect(picker).toBeVisible({ timeout: 12_000 })
  } catch {
    const body = await page.locator('body').innerText({ timeout: 3_000 })
      .catch(() => '<body unavailable>')
    throw new Error([
      'Thread selector was not rendered. This is a page/bootstrap failure,',
      'not evidence of a checkpoint mutation failure.',
      `URL: ${page.url()}`,
      `HTTP: ${response?.status() ?? '<no response>'}`,
      `Body: ${body.slice(0, 2000)}`,
      `Browser errors: ${browserErrors.slice(0, 8).join(' | ') || '<none>'}`,
    ].join('\n'))
  }

  await expect(picker).toBeEnabled({ timeout: 10_000 })
  await picker.selectOption({ value: threadId }, { timeout: 15_000 })
}

const bestEffortDeleteThread = async (
  request: import('@playwright/test').APIRequestContext,
  threadId: string,
) => {
  // A test timeout can close the request context. Cleanup must not hide
  // the original failure or consume the remaining test timeout.
  try {
    const deleted = await request.delete(
      `${origin}/threads/${encodeURIComponent(threadId)}`,
      { timeout: 8_000 },
    )
    if (!deleted.ok()) {
      console.warn(`WARN: disposable Thread cleanup returned HTTP ${deleted.status()}`)
    }
  } catch (error) {
    console.warn(`WARN: disposable Thread cleanup failed: ${String(error)}`)
  }
}

/** Real pinned Runtime; no Run or model calls in this browser test. */
test('explicit parent-checkpoint message edit branches and independently reconciles', async ({ page, request }) => {
  let threadId: string | null = null
  let runPosts = 0

  try {
    const created = await request.post(`${origin}/threads`, {
      data: {
        metadata: {
          graph_id: 'deep_agent',
          lab: '2.3E',
          purpose: 'shared-state-ui-e2e',
        },
      },
    })
    expect(created.ok()).toBeTruthy()
    threadId = (await created.json()).thread_id as string
    const stateUrl = `${origin}/threads/${encodeURIComponent(threadId)}/state`

    const update = async (id: string, content: string) => {
      const response = await request.post(stateUrl, {
        data: {
          values: { messages: [{ type: 'human', id, content }] },
          as_node: '__start__',
        },
      })
      expect(response.ok()).toBeTruthy()
      const payload = await response.json() as { checkpoint: { checkpoint_id: string } }
      return payload.checkpoint.checkpoint_id
    }

    const c1 = await update('lab-23e-a', 'A')
    const c2 = await update('lab-23e-b', 'B')
    expect(c2).not.toBe(c1)

    page.on('request', (req) => {
      if (req.method() === 'POST' && /\/runs(?:\/stream|\/wait)?$/.test(new URL(req.url()).pathname)) {
        runPosts += 1
      }
    })

    await openAndSelectThread(page, threadId)

    const panel = page.getByRole('region', { name: 'Shared state laboratory' })
    await expect(panel.getByText(c2)).toBeVisible()
    await expect(panel.getByText(c1)).toBeVisible()

    await panel.getByLabel('Checkpoint base').selectOption('parent')
    await panel.getByLabel('New human message').fill('C from UI parent branch')
    await panel.getByRole('checkbox', { name: /I understand this POST/ }).check()
    await panel.getByRole('button', { name: 'Append message to graph state' }).click()

    await expect(panel.getByText(/Readback matches POST checkpoint/)).toBeVisible()

    const finalResponse = await request.get(stateUrl)
    expect(finalResponse.ok()).toBeTruthy()
    const finalState = await finalResponse.json() as {
      checkpoint: { checkpoint_id: string }
      parent_checkpoint: { checkpoint_id: string }
      values: { messages: Array<{ id: string; content: string }> }
    }
    expect(finalState.parent_checkpoint.checkpoint_id).toBe(c1)
    expect(finalState.checkpoint.checkpoint_id).not.toBe(c2)
    expect(finalState.values.messages.map(item => item.content)).toEqual([
      'A', 'C from UI parent branch',
    ])

    const historic = await request.get(`${stateUrl}/${encodeURIComponent(c2)}`)
    expect(historic.ok()).toBeTruthy()
    const historicState = await historic.json() as {
      values: { messages: Array<{ content: string }> }
    }
    expect(historicState.values.messages.map(item => item.content)).toEqual(['A', 'B'])
    expect(runPosts).toBe(0)
  } finally {
    if (threadId !== null) await bestEffortDeleteThread(request, threadId)
  }
})

test('failed GET after state POST is visibly unreconciled and requires an explicit reload', async ({ page, request }) => {
  const created = await request.post(`${origin}/threads`, {
    data: { metadata: { graph_id: 'deep_agent', lab: '2.3E', purpose: 'readback-failure-e2e' } },
  })
  expect(created.ok()).toBeTruthy()
  const threadId = (await created.json()).thread_id as string
  const statePath = `/threads/${encodeURIComponent(threadId)}/state`
  let postObserved = false
  let failedGet = false
  let runPosts = 0

  try {
    await page.route(`${origin}${statePath}`, async (route) => {
      if (route.request().method() === 'POST') postObserved = true
      if (postObserved && !failedGet && route.request().method() === 'GET') {
        failedGet = true
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"simulated readback failure"}' })
      } else {
        await route.continue()
      }
    })
    page.on('request', (req) => {
      if (req.method() === 'POST' && /\/runs(?:\/stream|\/wait)?$/.test(new URL(req.url()).pathname)) runPosts += 1
    })

    await openAndSelectThread(page, threadId)
    const panel = page.getByRole('region', { name: 'Shared state laboratory' })
    await expect(panel.getByText('uninitialized')).toBeVisible()
    await panel.getByLabel('New human message').fill('PERSISTED_BUT_GET_FAILED')
    await panel.getByRole('checkbox', { name: /I understand this POST/ }).check()
    await panel.getByRole('button', { name: 'Append message to graph state' }).click()

    await expect(panel.getByText(/Mutation\/re-read not confirmed/)).toBeVisible()
    expect(failedGet).toBe(true)
    await expect(panel.getByRole('button', { name: 'Append message to graph state' })).toBeDisabled()
    await expect(panel.getByText(/Readback matches POST checkpoint/)).toHaveCount(0)

    // Independent re-read recovers display and clears the safety interlock.
    await panel.getByRole('button', { name: 'Reload persisted state' }).click()
    await expect(panel.getByText('pending')).toBeVisible()
    await expect(panel.getByText(/Mutation\/re-read not confirmed/)).toHaveCount(0)
    const headResponse = await request.get(`${origin}${statePath}`)
    expect(headResponse.ok()).toBeTruthy()
    const head = await headResponse.json() as {
      values: { messages: Array<{ content: string }> }
    }
    expect(head.values.messages.some(item => item.content === 'PERSISTED_BUT_GET_FAILED')).toBe(true)
    expect(runPosts).toBe(0)
  } finally {
    await bestEffortDeleteThread(request, threadId)
  }
})


test('blocks stale UI mutation when another writer advances HEAD before preflight', async ({ page, request }) => {
  const created = await request.post(`${origin}/threads`, {
    data: { metadata: { graph_id: 'deep_agent', lab: '2.3F', purpose: 'preflight-stale-e2e' } },
  })
  expect(created.ok()).toBeTruthy()
  const threadId = (await created.json()).thread_id as string
  const stateUrl = `${origin}/threads/${encodeURIComponent(threadId)}/state`
  let browserPosts = 0

  try {
    const seed = await request.post(stateUrl, {
      data: { values: { messages: [{ type: 'human', id: 'lab-23f-a', content: 'A' }] }, as_node: '__start__' },
    })
    expect(seed.ok()).toBeTruthy()
    const c1 = (await seed.json()).checkpoint.checkpoint_id as string
    page.on('request', req => {
      if (req.method() === 'POST' && new URL(req.url()).pathname === `/threads/${encodeURIComponent(threadId)}/state`) browserPosts += 1
    })
    await openAndSelectThread(page, threadId)
    const panel = page.getByRole('region', { name: 'Shared state laboratory' })
    await expect(panel.getByText(c1)).toBeVisible()

    // Another client updates the persisted HEAD without notifying this page.
    const external = await request.post(stateUrl, {
      data: { values: { messages: [{ type: 'human', id: 'lab-23f-b', content: 'B external' }] }, as_node: '__start__' },
    })
    expect(external.ok()).toBeTruthy()
    const c2 = (await external.json()).checkpoint.checkpoint_id as string
    expect(c2).not.toBe(c1)

    await panel.getByLabel('New human message').fill('UNSENT_FROM_STALE_VIEW')
    await panel.getByRole('checkbox', { name: /I understand this POST/ }).check()
    await panel.getByRole('button', { name: 'Append message to graph state' }).click()

    await expect(panel.locator('[data-mutation-stage="stale"]')).toBeVisible()
    await expect(panel.getByRole('alert')).toContainText('No POST was sent')
    await expect(panel.getByRole('button', { name: 'Append message to graph state' })).toBeDisabled()
    expect(browserPosts).toBe(0)
    const persisted = await request.get(stateUrl)
    expect(persisted.ok()).toBeTruthy()
    const body = await persisted.json() as {
      checkpoint: { checkpoint_id: string }
      values: { messages: Array<{ content: string }> }
    }
    expect(body.checkpoint.checkpoint_id).toBe(c2)
    expect(body.values.messages.map(m => m.content)).toEqual(['A', 'B external'])

    await panel.getByRole('button', { name: 'Reload persisted state' }).click()
    await expect(panel.getByText(c2)).toBeVisible()
    await expect(panel.locator('[data-mutation-stage]')).toHaveAttribute(
      'data-mutation-stage',
      'idle',
    )
    await expect(panel.getByRole('checkbox', { name: /I understand this POST/ })).not.toBeChecked()
    expect(browserPosts).toBe(0)
  } finally {
    await bestEffortDeleteThread(request, threadId)
  }
})

test('HEAD divergence after POST requires reload and never pretends to confirm written state', async ({ page, request }) => {
  const created = await request.post(`${origin}/threads`, {
    data: { metadata: { graph_id: 'deep_agent', lab: '2.3F', purpose: 'head-drift-e2e' } },
  })
  expect(created.ok()).toBeTruthy()
  const threadId = (await created.json()).thread_id as string
  const stateUrl = `${origin}/threads/${encodeURIComponent(threadId)}/state`
  let browserPostSeen = false
  let externalAdvance = false
  let browserStatePosts = 0

  try {
    const seed = await request.post(stateUrl, {
      data: { values: { messages: [{ type: 'human', id: 'lab-23f-base', content: 'BASE' }] }, as_node: '__start__' },
    })
    expect(seed.ok()).toBeTruthy()

    await page.route(stateUrl, async route => {
      const method = route.request().method()
      if (method === 'POST') {
        browserPostSeen = true
        browserStatePosts += 1
      }
      if (method === 'GET' && browserPostSeen && !externalAdvance) {
        externalAdvance = true
        const external = await request.post(stateUrl, {
          data: { values: { messages: [{ type: 'human', id: 'lab-23f-external', content: 'EXTERNAL_AFTER_POST' }] }, as_node: '__start__' },
        })
        expect(external.ok()).toBeTruthy()
      }
      await route.continue()
    })

    await openAndSelectThread(page, threadId)
    const panel = page.getByRole('region', { name: 'Shared state laboratory' })
    await panel.getByLabel('New human message').fill('UI_WRITE_BEFORE_EXTERNAL')
    await panel.getByRole('checkbox', { name: /I understand this POST/ }).check()
    await panel.getByRole('button', { name: 'Append message to graph state' }).click()

    await expect(panel.locator('[data-mutation-stage="diverged"]')).toBeVisible()
    await expect(panel.getByText(/Observed HEAD differs from POST checkpoint/)).toBeVisible()
    await expect(panel.getByRole('alert')).toContainText('Reload before another edit')
    await expect(panel.getByRole('button', { name: 'Append message to graph state' })).toBeDisabled()
    expect(browserStatePosts).toBe(1)
    expect(externalAdvance).toBe(true)

    const persisted = await request.get(stateUrl)
    expect(persisted.ok()).toBeTruthy()
    const body = await persisted.json() as { values: { messages: Array<{ content: string }> } }
    expect(body.values.messages.map(m => m.content)).toEqual(['BASE', 'UI_WRITE_BEFORE_EXTERNAL', 'EXTERNAL_AFTER_POST'])

    await panel.getByRole('button', { name: 'Reload persisted state' }).click()
    await expect(panel.locator('[data-mutation-stage]')).toHaveAttribute(
      'data-mutation-stage',
      'idle',
    )
    expect(browserStatePosts).toBe(1)
  } finally {
    await bestEffortDeleteThread(request, threadId)
  }
})
