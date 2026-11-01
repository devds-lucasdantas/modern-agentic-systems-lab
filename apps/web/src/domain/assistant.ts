import type { IsoTimestamp, Metadata } from './common'
import type { AssistantId, GraphId } from './ids'

export interface Assistant {
  readonly id: AssistantId
  readonly graphId: GraphId
  readonly name: string | null
  readonly metadata: Metadata
  readonly createdAt: IsoTimestamp | null
  readonly updatedAt: IsoTimestamp | null
}
