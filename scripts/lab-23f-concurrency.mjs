#!/usr/bin/env node
// Lab 2.3F-A: empirical multiwriter, stale-source and uncertain-outcome study.
// Uses the compiled real 2.3C AgentServerClient against an isolated pinned Runtime.
// No Runs, model calls, UI changes, or automatic mutation retries.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'

const [baseUrl, compiledClient, outputPath] = process.argv.slice(2)
if (!baseUrl || !compiledClient || !outputPath) {
  throw new Error('Usage: node lab-23f-concurrency.mjs <runtime-url> <compiled-client.js> <observations.json>')
}
const { AgentServerClient } = await import(pathToFileURL(compiledClient).href)
const trace = []
const trackedFetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input)
  const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const path = new URL(url).pathname
  trace.push({ method, path })
  return fetch(input, init)
}
const newClient = (fetchImpl = trackedFetch) => new AgentServerClient({ baseUrl, fetchImpl })
const createMessage = (key) => ({ messages: [{ type: 'human', id: `lab-23f-${key}`, content: key }] })
const write = (client, threadId, key, checkpoint) => client.updateThreadState(threadId, {
  values: createMessage(key),
  asNode: '__start__',
  ...(checkpoint ? { checkpoint } : {}),
})
const getMessages = (state) => {
  const messages = state?.values?.messages
  assert.ok(Array.isArray(messages), 'expected persisted messages channel')
  return messages.map(m => ({ id: m?.id ?? null, content: m?.content ?? null }))
}
const brief = (state) => ({
  checkpointId: state?.checkpoint?.checkpointId ?? null,
  parentCheckpointId: state?.parentCheckpoint?.checkpointId ?? null,
  messages: getMessages(state).map(m => m.content),
})
const historical = async (threadId, checkpointId) => {
  const response = await trackedFetch(
    `${baseUrl}/threads/${encodeURIComponent(threadId)}/state/${encodeURIComponent(checkpointId)}`,
    { headers: { accept: 'application/json' } },
  )
  const body = await response.json()
  assert.ok(response.ok, `historical read HTTP ${response.status}: ${JSON.stringify(body)}`)
  // Important pinned-runtime quirk: a missing historical checkpoint can yield
  // an empty HTTP 200. Never assume a 200 proves a checkpoint exists.
  const actual = body?.checkpoint?.checkpoint_id ?? body?.checkpoint_id ?? null
  assert.equal(actual, checkpointId, `historical checkpoint identity mismatch: ${checkpointId}`)
  assert.ok(Array.isArray(body?.values?.messages), 'historical messages missing')
  return {
    checkpointId: actual,
    parentCheckpointId: body?.parent_checkpoint?.checkpoint_id ?? body?.parent_checkpoint_id ?? null,
    messages: body.values.messages.map(m => m?.content ?? null),
  }
}
const assertNoRuns = async (client, threadId) => {
  assert.deepEqual(await client.listRuns(threadId), [], 'experiment unexpectedly created a Run')
}
const errorDescription = (error) => ({
  name: error instanceof Error ? error.name : typeof error,
  message: error instanceof Error ? error.message : String(error),
  status: typeof error?.status === 'number' ? error.status : null,
})
const branch = async (label, experiment) => {
  const owner = newClient()
  const thread = await owner.createThread({ metadata: {
    graph_id: 'deep_agent', lab: '2.3F', scenario: label,
  } })
  let error = null
  try {
    return await experiment(owner, thread.id)
  } catch (cause) {
    error = cause
    throw cause
  } finally {
    try {
      await owner.deleteThread(thread.id)
      console.log(`PASS: disposable Thread cleaned up (${label})`)
    } catch (cleanupError) {
      console.error(`WARN: Thread cleanup failed (${label}):`, cleanupError)
      if (error === null) process.exitCode = 1
    }
  }
}
const observations = {
  experiment: '2.3F-A empirical concurrency and stale-state discovery',
  baselineCommit: 'dd6d3546c4ca28fa00eed66945cddc16cbb16d3e',
  scenarios: {},
  limitations: [
    'Concurrent client dispatch cannot establish simultaneous server transaction execution',
    'No atomic compare-and-swap guarantee follows from selected-checkpoint POST',
    'Sequential interleavings demonstrate TOCTOU but are not simultaneous-writer timings',
    'Single-process in-memory pinned Runtime; multi-instance production behavior untested',
    'No authentication or multiuser authorization tested',
  ],
}
let failure = null
try {
  // A. Two independent clients dispatch writes from exactly the same source.
  observations.scenarios.concurrentWriters = await branch('concurrent-writers', async (owner, threadId) => {
    const initial = await write(owner, threadId, 'concurrent-base')
    const c1 = initial.checkpoint.checkpointId
    assert.equal((await owner.getThreadState(threadId)).checkpoint?.checkpointId, c1)
    const clients = [newClient(), newClient()]
    let release
    const gate = new Promise(resolve => { release = resolve })
    const launch = (client, key) => (async () => {
      await gate
      const started = performance.now()
      try {
        const result = await write(client, threadId, key, initial.checkpoint)
        return { status: 'fulfilled', key, checkpointId: result.checkpoint.checkpointId,
          elapsedMs: Math.round((performance.now() - started) * 10) / 10 }
      } catch (error) {
        return { status: 'rejected', key, error: errorDescription(error),
          elapsedMs: Math.round((performance.now() - started) * 10) / 10 }
      }
    })()
    const tasks = [launch(clients[0], 'concurrent-A'), launch(clients[1], 'concurrent-B')]
    release()
    const outcomes = await Promise.all(tasks)
    const successful = outcomes.filter(x => x.status === 'fulfilled')
    assert.ok(successful.length >= 1, 'both concurrent writes rejected; inspect server logs')
    assert.equal(new Set(successful.map(x => x.checkpointId)).size, successful.length,
      'successful writes returned identical checkpoint identity')
    const history = {}
    for (const outcome of successful) {
      const snapshot = await historical(threadId, outcome.checkpointId)
      assert.equal(snapshot.parentCheckpointId, c1)
      assert.deepEqual(snapshot.messages, ['concurrent-base', outcome.key])
      history[outcome.key] = snapshot
    }
    const head = brief(await owner.getThreadState(threadId))
    assert.ok(successful.some(x => x.checkpointId === head.checkpointId),
      'HEAD did not correspond to any successful writer')
    assert.deepEqual((await historical(threadId, c1)).messages, ['concurrent-base'])
    await assertNoRuns(owner, threadId)
    console.log(`OBSERVED: simultaneous dispatch -> ${successful.length}/2 accepted; HEAD belongs to a successful write`)
    return { dispatchedTogether: true, baseCheckpointId: c1, outcomes, head,
      acceptedBranches: history, bothAccepted: successful.length === 2 }
  })

  // B. Deterministic TOCTOU: A observes C1, B commits C2, A writes from stale C1.
  observations.scenarios.staleSource = await branch('stale-source', async (owner, threadId) => {
    const clientA = newClient()
    const clientB = newClient()
    const c1Result = await write(owner, threadId, 'stale-base')
    const observedByA = await clientA.getThreadState(threadId)
    const c1 = observedByA.checkpoint?.checkpointId
    assert.equal(c1, c1Result.checkpoint.checkpointId)
    const b = await write(clientB, threadId, 'writer-B')
    const c2 = b.checkpoint.checkpointId
    assert.equal((await clientB.getThreadState(threadId)).checkpoint?.checkpointId, c2)
    const a = await write(clientA, threadId, 'writer-A-stale', observedByA.checkpoint)
    const c3 = a.checkpoint.checkpointId
    const aHistory = await historical(threadId, c3)
    const bHistory = await historical(threadId, c2)
    assert.equal(aHistory.parentCheckpointId, c1)
    assert.deepEqual(aHistory.messages, ['stale-base', 'writer-A-stale'])
    assert.deepEqual(bHistory.messages, ['stale-base', 'writer-B'])
    const head = brief(await owner.getThreadState(threadId))
    assert.equal(head.checkpointId, c3)
    await assertNoRuns(owner, threadId)
    console.log('PASS: stale selected checkpoint was accepted after another client advanced HEAD')
    return { observedByA: c1, advancedByB: c2, resultingA: c3,
      staleWriteAccepted: true, preservedBHistory: true, head }
  })

  // C. HEAD moves after successful POST but before its independent GET readback.
  observations.scenarios.readbackDivergence = await branch('readback-divergence', async (owner, threadId) => {
    const writerA = newClient()
    const writerB = newClient()
    await write(owner, threadId, 'divergence-base')
    const fromA = await write(writerA, threadId, 'divergence-A')
    const fromB = await write(writerB, threadId, 'divergence-B')
    const head = brief(await writerA.getThreadState(threadId))
    const aId = fromA.checkpoint.checkpointId
    const bId = fromB.checkpoint.checkpointId
    assert.equal(head.checkpointId, bId)
    assert.notEqual(aId, bId)
    assert.deepEqual((await historical(threadId, aId)).messages,
      ['divergence-base', 'divergence-A'])
    assert.deepEqual(head.messages,
      ['divergence-base', 'divergence-A', 'divergence-B'])
    await assertNoRuns(owner, threadId)
    console.log('PASS: POST A committed, HEAD advanced by B before A re-read; A is not HEAD')
    return { writtenCheckpointIdA: aId, laterCheckpointIdB: bId,
      readbackHeadCheckpointId: head.checkpointId,
      postCommittedButHeadDifferent: true, head }
  })

  // D. Simulate successful POST reaching server, then losing its HTTP response.
  observations.scenarios.ambiguousPost = await branch('ambiguous-post', async (owner, threadId) => {
    const checkpointBefore = (await owner.getThreadState(threadId)).checkpoint?.checkpointId ?? null
    let swallowedSuccess = false
    let interceptedPosts = 0
    const lossyFetch = async (input, init) => {
      const response = await trackedFetch(input, init)
      const url = input instanceof Request ? input.url : String(input)
      const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
      if (!swallowedSuccess && method === 'POST' && new URL(url).pathname === `/threads/${encodeURIComponent(threadId)}/state` && response.ok) {
        interceptedPosts++
        swallowedSuccess = true
        throw new TypeError('simulated network loss AFTER successful POST response')
      }
      return response
    }
    const losingClient = newClient(lossyFetch)
    let clientError = null
    try { await write(losingClient, threadId, 'ambiguous-commit') }
    catch (error) { clientError = errorDescription(error) }
    assert.equal(swallowedSuccess, true)
    assert.equal(interceptedPosts, 1)
    assert.equal(clientError?.name, 'TypeError')
    const after = brief(await owner.getThreadState(threadId))
    assert.notEqual(after.checkpointId, checkpointBefore)
    assert.deepEqual(after.messages, ['ambiguous-commit'])
    await assertNoRuns(owner, threadId)
    const statePostCount = trace.filter(x => x.method === 'POST' && x.path === `/threads/${encodeURIComponent(threadId)}/state`).length
    assert.equal(statePostCount, 1, 'ambiguous response must not trigger an automatic retry')
    console.log('PASS: client saw network error although mutation persisted; no automatic retry')
    return { clientError, statePostCount, persistedAfterLostResponse: true,
      observedHead: after, mustReloadBeforeNewMutation: true }
  })

  const runPosts = trace.filter(x => x.method === 'POST' && /\/runs(?:\/|$)/.test(x.path))
  assert.equal(runPosts.length, 0, 'a Run was posted during no-model experiment')
  observations.noRunPosts = true
  observations.requestTotals = {
    statePosts: trace.filter(x => x.method === 'POST' && /\/threads\/[^/]+\/state$/.test(x.path)).length,
    runPosts: runPosts.length,
  }
  await writeFile(outputPath, JSON.stringify(observations, null, 2) + '\n')
  console.log('===== 2.3F-A OBSERVED CONCURRENCY SEMANTICS =====')
  console.log(JSON.stringify({
    concurrentOutcomes: observations.scenarios.concurrentWriters.outcomes.map(x => ({ writer: x.key, status: x.status, ...(x.error ? {error: x.error} : {}) })),
    staleWriteAccepted: observations.scenarios.staleSource.staleWriteAccepted,
    postCommittedButHeadDifferent: observations.scenarios.readbackDivergence.postCommittedButHeadDifferent,
    persistedAfterLostResponse: observations.scenarios.ambiguousPost.persistedAfterLostResponse,
    noRunPosts: observations.noRunPosts,
  }, null, 2))
  console.log(`PASS: observations saved to ${outputPath}`)
} catch (error) {
  failure = error
  console.error('FAIL: 2.3F-A experiment:', error)
  throw error
} finally {
  if (failure !== null) {
    try {
      observations.failure = errorDescription(failure)
      await writeFile(outputPath, JSON.stringify(observations, null, 2) + '\n')
      console.error(`PARTIAL OBSERVATIONS: ${outputPath}`)
    } catch (writeError) { console.error('WARN: unable to save partial observations:', writeError) }
  }
}
