#!/usr/bin/env node
// Integration proof for the real typed client, not raw HTTP reconstruction.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

const [baseUrl, compiledClient] = process.argv.slice(2)
if (!baseUrl || !compiledClient) {
  throw new Error('Usage: node lab-23c-state-update.mjs <runtime-url> <compiled-client.js>')
}

const { AgentServerClient } = await import(pathToFileURL(compiledClient).href)
const client = new AgentServerClient({ baseUrl, fetchImpl: fetch })
let threadId = null

try {
  const thread = await client.createThread({
    metadata: {
      graph_id: 'deep_agent',
      lab: '2.3C',
      purpose: 'typed-state-update-client-integration',
    },
  })
  threadId = thread.id
  console.log('PASS: disposable graph-bound Thread created')

  const result = await client.updateThreadState(threadId, {
    values: {
      messages: [{
        type: 'human',
        id: 'lab-23c-message',
        content: 'LAB_23C_PERSISTED',
      }],
    },
    asNode: '__start__',
  })

  assert.equal(result.checkpoint.threadId, threadId)
  assert.ok(result.checkpoint.checkpointId)
  console.log('PASS: typed update returned a checkpoint')

  // Authoritative read is deliberately a separate call.
  const state = await client.getThreadState(threadId)
  assert.equal(state.checkpoint?.checkpointId, result.checkpoint.checkpointId)
  assert.ok(state.position.next.includes('SkillsMiddleware.before_agent'))
  assert.ok(!Array.isArray(state.values))
  const messages = state.values.messages
  assert.ok(Array.isArray(messages))
  assert.ok(messages.some((item) =>
    item?.id === 'lab-23c-message' && item?.content === 'LAB_23C_PERSISTED'))
  console.log('PASS: separate GET confirmed persisted checkpoint, message and graph position')
  console.log('PASS: no Run or model invocation in this experiment')
} finally {
  if (threadId !== null) {
    await client.deleteThread(threadId)
    console.log('PASS: disposable Thread deleted')
  }
}
