import {
  checkpointId,
  threadId,
  type ThreadState,
} from '../domain'

import {
  projectThreadState,
} from './thread-state-projector'


let passed = 0

const check = (
  condition: boolean,
  description: string,
): void => {
  if (!condition) {
    throw new Error(
      `FAIL: ${description}`,
    )
  }

  passed += 1

  console.log(
    `PASS: ${description}`,
  )
}


const id =
  threadId('test-thread')


const emptyState: ThreadState = {
  threadId: id,

  values: {},

  position: {
    next: [],
  },

  checkpoint: null,
  parentCheckpoint: null,

  metadata: {},

  tasks: [],
  interrupts: [],

  createdAt: null,
}


// ------------------------------------------------------------
// 1. Empty Thread is not END.
// ------------------------------------------------------------

const empty =
  projectThreadState(
    emptyState,
  )

check(
  empty.graph.status ===
    'uninitialized' &&
  empty.graph.checkpointId ===
    null &&
  empty.messages.length === 0,
  'empty Thread is uninitialized, not END',
)


// ------------------------------------------------------------
// 2. Persisted state with an executable next node.
// ------------------------------------------------------------

const nextNodes = [
  'SkillsMiddleware.before_agent',
]

const populatedState: ThreadState = {
  ...emptyState,

  values: {
    messages: [
      {
        type: 'human',
        id: 'message-a',
        content: 'HELLO_STATE',
      },
    ],

    memory_contents: {
      secret:
        'MEMORY_INTERNAL_SENTINEL',
    },

    skills_metadata: {
      secret:
        'SKILLS_INTERNAL_SENTINEL',
    },
  },

  position: {
    next: nextNodes,
  },

  checkpoint: {
    threadId: id,
    checkpointId:
      checkpointId('checkpoint-2'),
    namespace: '',
    checkpointMap: {
      internal:
        'CHECKPOINT_MAP_SENTINEL',
    },
  },

  parentCheckpoint: {
    threadId: id,
    checkpointId:
      checkpointId('checkpoint-1'),
    namespace: '',
    checkpointMap: {},
  },

  metadata: {
    secret:
      'METADATA_INTERNAL_SENTINEL',
  },

  tasks: [
    {
      id: 'task-1',
      name: 'model',
      error: null,
    },
  ],

  interrupts: [
    {
      kind: 'graph-interrupt',
      id: null,
      value:
        'INTERRUPT_INTERNAL_SENTINEL',
      resumable: true,
    },
  ],
}


const populated =
  projectThreadState(
    populatedState,
  )

check(
  populated.authority ===
    'persisted' &&
  populated.threadId === id,
  'projection exposes persisted provenance',
)

check(
  populated.graph.status ===
    'pending' &&
  populated.graph.next.length === 1 &&
  populated.graph.next[0] ===
    'SkillsMiddleware.before_agent',
  'pending graph position is projected',
)

check(
  populated.graph.checkpointId ===
    'checkpoint-2' &&
  populated.graph.parentCheckpointId ===
    'checkpoint-1',
  'checkpoint identities are projected',
)

check(
  populated.graph.taskCount === 1 &&
  populated.graph.interruptCount === 1,
  'control data is summarized by counts',
)

check(
  populated.messages.length === 1 &&
  populated.messages[0]?.role ===
    'user' &&
  populated.messages[0]?.content[0]?.kind ===
    'text',
  'supported messages channel is normalized',
)


// ------------------------------------------------------------
// 3. Internal Runtime payloads must not cross the boundary.
// ------------------------------------------------------------

const serialized =
  JSON.stringify(
    populated,
  )

const forbidden = [
  'MEMORY_INTERNAL_SENTINEL',
  'SKILLS_INTERNAL_SENTINEL',
  'CHECKPOINT_MAP_SENTINEL',
  'METADATA_INTERNAL_SENTINEL',
  'INTERRUPT_INTERNAL_SENTINEL',
]

check(
  forbidden.every(
    (value) =>
      !serialized.includes(
        value,
      ),
  ),
  'internal Runtime payloads are not exposed',
)

check(
  !Object.hasOwn(
    populated,
    'values',
  ) &&
  !Object.hasOwn(
    populated,
    'metadata',
  ) &&
  !Object.hasOwn(
    populated.graph,
    'tasks',
  ) &&
  !Object.hasOwn(
    populated.graph,
    'interrupts',
  ),
  'projection is an explicit allowlist',
)


// ------------------------------------------------------------
// 4. Projected graph position is not aliased to source.
// ------------------------------------------------------------

check(
  populated.graph.next !==
    nextNodes,
  'projected next array is detached from Runtime input',
)

nextNodes.push(
  'unrelated-node',
)

check(
  populated.graph.next.length === 1,
  'source array mutation does not change projection',
)


// ------------------------------------------------------------
// 5. Persisted checkpoint with no next nodes is END.
// ------------------------------------------------------------

const ended =
  projectThreadState({
    ...populatedState,

    position: {
      next: [],
    },
  })

check(
  ended.graph.status ===
    'end',
  'persisted checkpoint with empty next is END',
)


// ------------------------------------------------------------
// 6. Unsupported StateValues shape remains safely bounded.
// ------------------------------------------------------------

const arrayValues =
  projectThreadState({
    ...populatedState,

    values: [
      {
        unrelated:
          'ARRAY_INTERNAL_SENTINEL',
      },
    ],
  })

check(
  arrayValues.messages.length === 0 &&
  !JSON.stringify(
    arrayValues,
  ).includes(
    'ARRAY_INTERNAL_SENTINEL',
  ),
  'unprojected values remain outside the UI boundary',
)


console.log(
  `\n${passed} pure projection assertions passed`,
)
