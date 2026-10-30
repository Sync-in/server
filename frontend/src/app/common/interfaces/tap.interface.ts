export type TapKind = 'single' | 'double'

export interface TapPoint {
  x: number
  y: number
  timestamp: number
}

export interface TapEvent {
  x: number
  y: number
  type: TapKind
  sourceEvent?: PointerEvent
}
