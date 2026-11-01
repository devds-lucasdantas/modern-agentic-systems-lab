import type { InterruptId } from './ids'

export interface ExecutionBreakpoint {
  readonly kind: 'execution-breakpoint'
  readonly next: readonly string[]
}

export interface GraphInterrupt {
  readonly kind: 'graph-interrupt'
  readonly id: InterruptId | null
  readonly value: unknown
  readonly resumable: true
}

export type LifecycleCancellationAction =
  | 'interrupt'
  | 'rollback'

export interface LifecycleCancellation {
  readonly kind: 'lifecycle-cancellation'
  readonly action: LifecycleCancellationAction
}
