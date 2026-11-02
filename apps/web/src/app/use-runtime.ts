import {
  useContext,
} from 'react'

import {
  RuntimeContext,
  type RuntimeServices,
} from './runtime-context'

export function useRuntime():
RuntimeServices {
  const value =
    useContext(RuntimeContext)

  if (value === null) {
    throw new Error(
      'useRuntime must be used inside RuntimeProvider',
    )
  }

  return value
}
