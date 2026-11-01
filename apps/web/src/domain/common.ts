export type Metadata = Readonly<Record<string, unknown>>

export type StateRecord = Readonly<Record<string, unknown>>

export type StateValues =
  | StateRecord
  | readonly StateRecord[]

export type IsoTimestamp = string
