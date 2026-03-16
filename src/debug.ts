import GLib from "gi://GLib"
import { createPersistedState } from "./lib/persist"

export type DebugSettings = {
  mockBatteryLevel: number
  mockBatteryCharging: boolean
}

const defaults: DebugSettings = {
  mockBatteryLevel: -1,
  mockBatteryCharging: false
}

export const [debug, setDebug] = createPersistedState(
  `${GLib.get_user_config_dir()}/minishell/debug.toml`,
  defaults
)
