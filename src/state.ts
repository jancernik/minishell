import { createState } from "ags"

const [_qsOpen, _setQsOpen] = createState(false)
let _openCount = 0

export const qsOpen = _qsOpen

export function registerQsOpen() {
  _openCount++
  _setQsOpen(true)
}

export function registerQsClose() {
  _openCount = Math.max(0, _openCount - 1)
  _setQsOpen(_openCount > 0)
}
