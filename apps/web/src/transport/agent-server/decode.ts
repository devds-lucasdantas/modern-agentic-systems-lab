import { AgentServerDecodeError } from './errors'
import type {
  AssistantDto,
  CheckpointConfigDto,
  InterruptDto,
  JsonObject,
  RunDto,
  RuntimeTaskDto,
  StateValuesDto,
  ThreadDto,
  ThreadStateDto,
} from './dto'

export const isJsonObject = (
  value: unknown,
): value is JsonObject =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value)

const object = (
  value: unknown,
  path: string,
): JsonObject => {
  if (!isJsonObject(value)) {
    throw new AgentServerDecodeError(path, 'object')
  }

  return value
}

const requiredString = (
  source: JsonObject,
  key: string,
  path: string,
): string => {
  const value = source[key]

  if (typeof value !== 'string') {
    throw new AgentServerDecodeError(
      `${path}.${key}`,
      'string',
    )
  }

  return value
}

const optionalString = (
  source: JsonObject,
  key: string,
  path: string,
): string | undefined => {
  const value = source[key]

  if (value === undefined) {
    return undefined
  }

  if (typeof value !== 'string') {
    throw new AgentServerDecodeError(
      `${path}.${key}`,
      'string or undefined',
    )
  }

  return value
}

const nullableString = (
  source: JsonObject,
  key: string,
  path: string,
): string | null | undefined => {
  const value = source[key]

  if (value === undefined || value === null) {
    return value
  }

  if (typeof value !== 'string') {
    throw new AgentServerDecodeError(
      `${path}.${key}`,
      'string, null, or undefined',
    )
  }

  return value
}

const optionalNumber = (
  source: JsonObject,
  key: string,
  path: string,
): number | null | undefined => {
  const value = source[key]

  if (value === undefined || value === null) {
    return value
  }

  if (typeof value !== 'number') {
    throw new AgentServerDecodeError(
      `${path}.${key}`,
      'number, null, or undefined',
    )
  }

  return value
}

const requiredObject = (
  source: JsonObject,
  key: string,
  path: string,
): JsonObject =>
  object(
    source[key],
    `${path}.${key}`,
  )

const optionalObject = (
  source: JsonObject,
  key: string,
  path: string,
): JsonObject | null | undefined => {
  const value = source[key]

  if (value === undefined || value === null) {
    return value
  }

  return object(
    value,
    `${path}.${key}`,
  )
}

const stringArray = (
  value: unknown,
  path: string,
): readonly string[] => {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === 'string')
  ) {
    throw new AgentServerDecodeError(
      path,
      'array of strings',
    )
  }

  return value
}

const stateValues = (
  value: unknown,
  path: string,
): StateValuesDto => {
  if (isJsonObject(value)) {
    return value
  }

  if (
    Array.isArray(value) &&
    value.every(isJsonObject)
  ) {
    return value
  }

  throw new AgentServerDecodeError(
    path,
    'object or array of objects',
  )
}

export const decodeAssistantDto = (
  value: unknown,
): AssistantDto => {
  const source = object(
    value,
    'Assistant',
  )

  return {
    assistant_id: requiredString(
      source,
      'assistant_id',
      'Assistant',
    ),
    graph_id: requiredString(
      source,
      'graph_id',
      'Assistant',
    ),
    config: requiredObject(
      source,
      'config',
      'Assistant',
    ),
    context: optionalObject(
      source,
      'context',
      'Assistant',
    ),
    created_at: requiredString(
      source,
      'created_at',
      'Assistant',
    ),
    updated_at: requiredString(
      source,
      'updated_at',
      'Assistant',
    ),
    metadata: requiredObject(
      source,
      'metadata',
      'Assistant',
    ),
    version: optionalNumber(
      source,
      'version',
      'Assistant',
    ),
    name: nullableString(
      source,
      'name',
      'Assistant',
    ),
    description: nullableString(
      source,
      'description',
      'Assistant',
    ),
  }
}

export const decodeThreadDto = (
  value: unknown,
): ThreadDto => {
  const source = object(
    value,
    'Thread',
  )

  return {
    thread_id: requiredString(
      source,
      'thread_id',
      'Thread',
    ),
    created_at: requiredString(
      source,
      'created_at',
      'Thread',
    ),
    updated_at: requiredString(
      source,
      'updated_at',
      'Thread',
    ),
    state_updated_at: nullableString(
      source,
      'state_updated_at',
      'Thread',
    ),
    metadata: requiredObject(
      source,
      'metadata',
      'Thread',
    ),
    config: optionalObject(
      source,
      'config',
      'Thread',
    ),
    status: requiredString(
      source,
      'status',
      'Thread',
    ),
    values: source.values,
    interrupts: source.interrupts,
    error: source.error,
    ttl: source.ttl,
    extracted: source.extracted,
  }
}

export const decodeRunDto = (
  value: unknown,
): RunDto => {
  const source = object(
    value,
    'Run',
  )

  return {
    run_id: requiredString(
      source,
      'run_id',
      'Run',
    ),
    thread_id: requiredString(
      source,
      'thread_id',
      'Run',
    ),
    assistant_id: requiredString(
      source,
      'assistant_id',
      'Run',
    ),
    created_at: requiredString(
      source,
      'created_at',
      'Run',
    ),
    updated_at: requiredString(
      source,
      'updated_at',
      'Run',
    ),
    status: requiredString(
      source,
      'status',
      'Run',
    ),
    metadata: requiredObject(
      source,
      'metadata',
      'Run',
    ),
    kwargs: requiredObject(
      source,
      'kwargs',
      'Run',
    ),
    multitask_strategy: requiredString(
      source,
      'multitask_strategy',
      'Run',
    ),
  }
}

const decodeCheckpointConfigDto = (
  value: unknown,
  path: string,
): CheckpointConfigDto | null => {
  if (value === null || value === undefined) {
    return null
  }

  const source = object(
    value,
    path,
  )

  return {
    thread_id: optionalString(
      source,
      'thread_id',
      path,
    ),
    checkpoint_ns: optionalString(
      source,
      'checkpoint_ns',
      path,
    ),
    checkpoint_id: optionalString(
      source,
      'checkpoint_id',
      path,
    ),
    checkpoint_map: optionalObject(
      source,
      'checkpoint_map',
      path,
    ) ?? undefined,
  }
}

const decodeInterruptDto = (
  value: unknown,
  path: string,
): InterruptDto => {
  const source = object(
    value,
    path,
  )

  if (!Object.hasOwn(source, 'value')) {
    throw new AgentServerDecodeError(
      `${path}.value`,
      'present field',
    )
  }

  return {
    id: nullableString(
      source,
      'id',
      path,
    ),
    value: source.value,
  }
}

const decodeRuntimeTaskDto = (
  value: unknown,
  path: string,
): RuntimeTaskDto => {
  const source = object(
    value,
    path,
  )

  const interruptsValue = source.interrupts

  let interrupts: readonly InterruptDto[] | undefined

  if (interruptsValue !== undefined) {
    if (!Array.isArray(interruptsValue)) {
      throw new AgentServerDecodeError(
        `${path}.interrupts`,
        'array',
      )
    }

    interrupts = interruptsValue.map(
      (item, index) =>
        decodeInterruptDto(
          item,
          `${path}.interrupts[${index}]`,
        ),
    )
  }

  return {
    id: requiredString(
      source,
      'id',
      path,
    ),
    name: requiredString(
      source,
      'name',
      path,
    ),
    error: nullableString(
      source,
      'error',
      path,
    ),
    checkpoint: decodeCheckpointConfigDto(
      source.checkpoint,
      `${path}.checkpoint`,
    ),
    interrupts,
    state: source.state,
  }
}

export const decodeThreadStateDto = (
  value: unknown,
): ThreadStateDto => {
  const source = object(
    value,
    'ThreadState',
  )

  const tasksValue = source.tasks
  const interruptsValue = source.interrupts

  const tasks =
    tasksValue === undefined
      ? []
      : Array.isArray(tasksValue)
        ? tasksValue.map(
            (item, index) =>
              decodeRuntimeTaskDto(
                item,
                `ThreadState.tasks[${index}]`,
              ),
          )
        : (() => {
            throw new AgentServerDecodeError(
              'ThreadState.tasks',
              'array',
            )
          })()

  const interrupts =
    interruptsValue === undefined
      ? []
      : Array.isArray(interruptsValue)
        ? interruptsValue.map(
            (item, index) =>
              decodeInterruptDto(
                item,
                `ThreadState.interrupts[${index}]`,
              ),
          )
        : (() => {
            throw new AgentServerDecodeError(
              'ThreadState.interrupts',
              'array',
            )
          })()

  const metadataValue = source.metadata

  const metadata =
    metadataValue === null
      ? null
      : object(
          metadataValue,
          'ThreadState.metadata',
        )

  const createdAt = source.created_at

  if (
    createdAt !== null &&
    typeof createdAt !== 'string'
  ) {
    throw new AgentServerDecodeError(
      'ThreadState.created_at',
      'string or null',
    )
  }

  return {
    values: stateValues(
      source.values,
      'ThreadState.values',
    ),
    next: stringArray(
      source.next,
      'ThreadState.next',
    ),
    tasks,
    checkpoint: decodeCheckpointConfigDto(
      source.checkpoint,
      'ThreadState.checkpoint',
    ),
    metadata,
    created_at: createdAt,
    parent_checkpoint: decodeCheckpointConfigDto(
      source.parent_checkpoint,
      'ThreadState.parent_checkpoint',
    ),
    interrupts,
    checkpoint_id: nullableString(
      source,
      'checkpoint_id',
      'ThreadState',
    ),
    parent_checkpoint_id: nullableString(
      source,
      'parent_checkpoint_id',
      'ThreadState',
    ),
  }
}

export const decodeArray = <T>(
  value: unknown,
  decodeItem: (item: unknown) => T,
  path: string,
): readonly T[] => {
  if (!Array.isArray(value)) {
    throw new AgentServerDecodeError(
      path,
      'array',
    )
  }

  return value.map(decodeItem)
}
