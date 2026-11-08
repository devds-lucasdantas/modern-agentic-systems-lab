import {
  RUN_STATUSES,
  THREAD_STATUSES,
  assistantId,
  checkpointId,
  graphId,
  interruptId,
  runId,
  threadId,
  type Assistant,
  type CheckpointRef,
  type GraphInterrupt,
  type Run,
  type RunStatus,
  type Thread,
  type ThreadState,
  type ThreadStatus,
  type ThreadId,
} from '../../domain'
import type {
  AssistantDto,
  CheckpointConfigDto,
  InterruptDto,
  JsonObject,
  RunDto,
  ThreadDto,
  ThreadStateDto,
  ThreadStateUpdateResponseDto,
} from './dto'
import { AgentServerDecodeError } from './errors'

const threadStatus = (
  value: string,
): ThreadStatus => {
  if (
    !(THREAD_STATUSES as readonly string[])
      .includes(value)
  ) {
    throw new AgentServerDecodeError(
      'Thread.status',
      `one of ${THREAD_STATUSES.join(', ')}`,
    )
  }

  return value as ThreadStatus
}

const runStatus = (
  value: string,
): RunStatus => {
  if (
    !(RUN_STATUSES as readonly string[])
      .includes(value)
  ) {
    throw new AgentServerDecodeError(
      'Run.status',
      `one of ${RUN_STATUSES.join(', ')}`,
    )
  }

  return value as RunStatus
}

const stringRecord = (
  value: JsonObject | undefined,
): Readonly<Record<string, string>> => {
  if (!value) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === 'string',
      ),
  )
}

const mapCheckpoint = (
  dto: CheckpointConfigDto | null,
  fallbackThreadId: ThreadId,
): CheckpointRef | null => {
  if (!dto?.checkpoint_id) {
    return null
  }

  return {
    threadId: dto.thread_id
      ? threadId(dto.thread_id)
      : fallbackThreadId,
    checkpointId: checkpointId(
      dto.checkpoint_id,
    ),
    namespace: dto.checkpoint_ns ?? '',
    checkpointMap: stringRecord(
      dto.checkpoint_map,
    ),
  }
}

const mapGraphInterrupt = (
  dto: InterruptDto,
): GraphInterrupt => ({
  kind: 'graph-interrupt',
  id:
    dto.id === undefined || dto.id === null
      ? null
      : interruptId(dto.id),
  value: dto.value,
  resumable: true,
})

export const mapAssistant = (
  dto: AssistantDto,
): Assistant => ({
  id: assistantId(dto.assistant_id),
  graphId: graphId(dto.graph_id),
  name: dto.name ?? null,
  metadata: dto.metadata,
  createdAt: dto.created_at,
  updatedAt: dto.updated_at,
})

export const mapThread = (
  dto: ThreadDto,
): Thread => ({
  id: threadId(dto.thread_id),
  status: threadStatus(dto.status),
  metadata: dto.metadata,
  createdAt: dto.created_at,
  updatedAt: dto.updated_at,
})

export const mapRun = (
  dto: RunDto,
): Run => ({
  id: runId(dto.run_id),
  assistantId: assistantId(
    dto.assistant_id,
  ),
  threadId: threadId(
    dto.thread_id,
  ),
  status: runStatus(dto.status),
  metadata: dto.metadata,

  // The pinned Run schema/payload does not expose
  // a run-level error field.
  error: null,

  createdAt: dto.created_at,
  updatedAt: dto.updated_at,
})

export const mapThreadState = (
  dto: ThreadStateDto,
  id: ThreadId,
): ThreadState => ({
  threadId: id,
  values: dto.values,
  position: {
    next: dto.next,
  },
  checkpoint: mapCheckpoint(
    dto.checkpoint,
    id,
  ),
  parentCheckpoint: mapCheckpoint(
    dto.parent_checkpoint,
    id,
  ),
  metadata: dto.metadata ?? {},
  tasks: dto.tasks.map((task) => ({
    id: task.id,
    name: task.name,
    error: task.error ?? null,
  })),
  interrupts: dto.interrupts.map(
    mapGraphInterrupt,
  ),
  createdAt: dto.created_at,
})

export const mapThreadStateUpdateResponse = (
  dto: ThreadStateUpdateResponseDto,
  id: ThreadId,
): { readonly checkpoint: CheckpointRef } => {
  if (
    dto.checkpoint.thread_id !== undefined &&
    dto.checkpoint.thread_id !== id
  ) {
    throw new AgentServerDecodeError(
      'ThreadStateUpdateResponse.checkpoint.thread_id',
      `matching target Thread ${id}`,
    )
  }

  const checkpoint = mapCheckpoint(dto.checkpoint, id)

  if (checkpoint === null) {
    throw new AgentServerDecodeError(
      'ThreadStateUpdateResponse.checkpoint.checkpoint_id',
      'non-empty string',
    )
  }

  return { checkpoint }
}
