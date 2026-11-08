#!/usr/bin/env node
// Lab 2.3D discovery: checkpoint-selected writes and persisted state lineage.
// Deliberately does not assert that checkpoint selection provides CAS.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const [baseUrl, compiledClient, outputPath] = process.argv.slice(2)
if (!baseUrl || !compiledClient || !outputPath) {
  throw new Error(
    'Usage: node lab-23d-checkpoint-aware.mjs <runtime-url> <compiled-client.js> <observations.json>',
  )
}

const { AgentServerClient } = await import(pathToFileURL(compiledClient).href)
const calls = []
const fetchImpl = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input)
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  calls.push({ method, path: new URL(url).pathname })
  return fetch(input, init)
}
const client = new AgentServerClient({ baseUrl, fetchImpl })
let threadId = null

const message = (id, content) => ({
  messages: [{ type: 'human', id, content }],
})

const wireSnapshot = (state) => {
  const values = state?.values
  const messages = !Array.isArray(values) && Array.isArray(values?.messages)
    ? values.messages.map((m) => ({ id: m?.id ?? null, content: m?.content ?? null }))
    : []
  return {
    checkpointId: state?.checkpoint?.checkpoint_id ?? state?.checkpoint_id ?? null,
    parentCheckpointId: state?.parent_checkpoint?.checkpoint_id ?? state?.parent_checkpoint_id ?? null,
    next: state?.next ?? null,
    messages,
  }
}

const domainSnapshot = (state) => ({
  checkpointId: state?.checkpoint?.checkpointId ?? null,
  parentCheckpointId: state?.parentCheckpoint?.checkpointId ?? null,
  next: state?.position?.next ?? null,
  messages: !Array.isArray(state?.values) && Array.isArray(state?.values?.messages)
    ? state.values.messages.map((m) => ({ id: m?.id ?? null, content: m?.content ?? null }))
    : [],
})

const historical = async (id, checkpointId) => {
  const path = `/threads/${encodeURIComponent(id)}/state/${encodeURIComponent(checkpointId)}`
  const response = await fetchImpl(`${baseUrl}${path}`, {
    method: 'GET',
    headers: { accept: 'application/json' },
  })
  const body = await response.json()
  if (!response.ok) {
    throw new Error(`Historical state read returned HTTP ${response.status}: ${JSON.stringify(body)}`)
  }
  const result = wireSnapshot(body)
  // The pinned Runtime may synthesize a 200 empty state for missing checkpoints.
  assert.equal(result.checkpointId, checkpointId, `Historical checkpoint ${checkpointId} not found`)
  return result
}

const ids = (state) => state.messages.map((m) => m.id)
const same = (a, b) => JSON.stringify(a.messages) === JSON.stringify(b.messages)
let primaryError = null
let summary = null

try {
  const thread = await client.createThread({
    metadata: {
      graph_id: 'deep_agent',
      lab: '2.3D',
      purpose: 'checkpoint-selected-branching-discovery',
    },
  })
  threadId = thread.id
  console.log('PASS: disposable graph-bound Thread created')
  assert.deepEqual(await client.listRuns(threadId), [])

  const first = await client.updateThreadState(threadId, {
    values: message('lab-23d-a', 'A'), asNode: '__start__',
  })
  const stateA = await client.getThreadState(threadId)
  assert.equal(first.checkpoint.checkpointId, stateA.checkpoint?.checkpointId)
  const c1 = first.checkpoint.checkpointId
  assert.ok(c1)
  assert.deepEqual(ids(domainSnapshot(stateA)), ['lab-23d-a'])
  console.log('PASS: C1 initial persisted update')

  const second = await client.updateThreadState(threadId, {
    values: message('lab-23d-b', 'B'), asNode: '__start__',
  })
  const stateB = await client.getThreadState(threadId)
  assert.equal(second.checkpoint.checkpointId, stateB.checkpoint?.checkpointId)
  const c2 = second.checkpoint.checkpointId
  assert.notEqual(c2, c1)
  assert.deepEqual(ids(domainSnapshot(stateB)), ['lab-23d-a', 'lab-23d-b'])
  const beforeA = await historical(threadId, c1)
  const beforeB = await historical(threadId, c2)
  console.log('PASS: C1 and C2 are readable historical snapshots')

  // Explicitly select old C1 after HEAD has advanced to C2.
  const fromC1 = await client.updateThreadState(threadId, {
    checkpoint: first.checkpoint,
    values: message('lab-23d-c', 'C-from-C1'),
    asNode: '__start__',
  })
  const c3 = fromC1.checkpoint.checkpointId
  const afterFirstBranchHead = domainSnapshot(await client.getThreadState(threadId))
  const branchC = await historical(threadId, c3)
  const afterFirstBranchA = await historical(threadId, c1)
  const afterFirstBranchB = await historical(threadId, c2)
  assert.ok(same(beforeA, afterFirstBranchA), 'C1 historical snapshot changed')
  assert.ok(same(beforeB, afterFirstBranchB), 'C2 historical snapshot changed')
  console.log('PASS: prior historical checkpoints preserved after C1-selected write')

  // C2 is now an older selector relative to the latest update.
  // This is a sequential stale-selector probe, NOT a concurrency test.
  const fromC2 = await client.updateThreadState(threadId, {
    checkpoint: second.checkpoint,
    values: message('lab-23d-d', 'D-from-C2'),
    asNode: '__start__',
  })
  const c4 = fromC2.checkpoint.checkpointId
  const afterSecondBranchHead = domainSnapshot(await client.getThreadState(threadId))
  const branchD = await historical(threadId, c4)
  const endA = await historical(threadId, c1)
  const endB = await historical(threadId, c2)
  const endC = await historical(threadId, c3)
  assert.ok(same(beforeA, endA), 'C1 history changed after second branch')
  assert.ok(same(beforeB, endB), 'C2 history changed after second branch')
  assert.ok(same(branchC, endC), 'C3 history changed after second branch')
  assert.equal(new Set([c1, c2, c3, c4]).size, 4)
  assert.deepEqual(await client.listRuns(threadId), [])
  assert.equal(
    calls.filter((call) => call.method === 'POST' && /\/runs(?:\/|$)/.test(call.path)).length,
    0,
  )
  console.log('PASS: four distinct checkpoints, prior snapshots immutable, zero Runs')

  summary = {
    experiment: '2.3D checkpoint-selected mutation',
    checkpointIds: { c1, c2, fromC1: c3, fromC2: c4 },
    snapshots: {
      c1: endA, c2: endB, c1SelectedChild: branchC, c2SelectedChild: branchD,
      headAfterFirstBranch: afterFirstBranchHead,
      headAfterSecondBranch: afterSecondBranchHead,
    },
    observations: {
      c1SelectedWriteAcceptedAfterC2: true,
      c2SelectedWriteAcceptedAfterC1Branch: true,
      c1SelectedWriteParentIsC1: branchC.parentCheckpointId === c1,
      c2SelectedWriteParentIsC2: branchD.parentCheckpointId === c2,
      c1SelectedWriteContainsAAndCNotB:
        ids(branchC).includes('lab-23d-a') &&
        ids(branchC).includes('lab-23d-c') &&
        !ids(branchC).includes('lab-23d-b'),
      c2SelectedWriteContainsABAndDNotC:
        ids(branchD).includes('lab-23d-a') &&
        ids(branchD).includes('lab-23d-b') &&
        ids(branchD).includes('lab-23d-d') &&
        !ids(branchD).includes('lab-23d-c'),
      headAfterFirstBranchMatchesResult: afterFirstBranchHead.checkpointId === c3,
      headAfterSecondBranchMatchesResult: afterSecondBranchHead.checkpointId === c4,
      c1C2AndFirstBranchHistoryPreserved: true,
      noRunsCreated: true,
    },
    limitations: [
      'Sequential probe only: no simultaneous writers or CAS proof',
      'Mutation response checkpoint is not a complete ThreadState',
      'Branch behavior is classified from snapshots, not assumed',
    ],
  }
  await writeFile(outputPath, JSON.stringify(summary, null, 2) + '\n')
  console.log('===== OBSERVED CHECKPOINT SEMANTICS =====')
  console.log(JSON.stringify(summary.observations, null, 2))
  console.log(`PASS: observations saved to ${outputPath}`)
} catch (error) {
  primaryError = error
  console.error('FAIL: 2.3D checkpoint experiment:', error)
  throw error
} finally {
  if (threadId !== null) {
    try {
      await client.deleteThread(threadId)
      console.log('PASS: disposable Thread deleted')
    } catch (error) {
      console.error('WARN: failed to delete disposable Thread:', error)
      if (primaryError === null) process.exitCode = 1
    }
  }
}
