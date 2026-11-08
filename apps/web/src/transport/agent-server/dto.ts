export type JsonObject = Record<string, unknown>

export type StateValuesDto =
  | JsonObject
  | readonly JsonObject[]

export interface AssistantDto {
  readonly assistant_id: string
  readonly graph_id: string
  readonly config: JsonObject
  readonly context?: JsonObject | null
  readonly created_at: string
  readonly updated_at: string
  readonly metadata: JsonObject
  readonly version?: number | null
  readonly name?: string | null
  readonly description?: string | null
}

export interface ThreadDto {
  readonly thread_id: string
  readonly created_at: string
  readonly updated_at: string
  readonly state_updated_at?: string | null
  readonly metadata: JsonObject
  readonly config?: JsonObject | null
  readonly status: string
  readonly values?: unknown
  readonly interrupts?: unknown
  readonly error?: unknown
  readonly ttl?: unknown
  readonly extracted?: unknown
}

export interface RunDto {
  readonly run_id: string
  readonly thread_id: string
  readonly assistant_id: string
  readonly created_at: string
  readonly updated_at: string
  readonly status: string
  readonly metadata: JsonObject
  readonly kwargs: JsonObject
  readonly multitask_strategy: string
}

export interface CheckpointConfigDto {
  readonly thread_id?: string
  readonly checkpoint_ns?: string
  readonly checkpoint_id?: string
  readonly checkpoint_map?: JsonObject
}

export interface InterruptDto {
  readonly id?: string | null
  readonly value: unknown
}

export interface RuntimeTaskDto {
  readonly id: string
  readonly name: string
  readonly error?: string | null
  readonly checkpoint?: CheckpointConfigDto | null
  readonly interrupts?: readonly InterruptDto[]
  readonly state?: unknown
}

export interface ThreadStateDto {
  readonly values: StateValuesDto
  readonly next: readonly string[]
  readonly tasks: readonly RuntimeTaskDto[]
  readonly checkpoint: CheckpointConfigDto | null
  readonly metadata: JsonObject | null
  readonly created_at: string | null
  readonly parent_checkpoint: CheckpointConfigDto | null
  readonly interrupts: readonly InterruptDto[]

  // Observed in the pinned Runtime but absent from its OpenAPI schema.
  readonly checkpoint_id?: string | null
  readonly parent_checkpoint_id?: string | null
}

export interface ThreadStateUpdateResponseDto {
  readonly checkpoint: CheckpointConfigDto
}
