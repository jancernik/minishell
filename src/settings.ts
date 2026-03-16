import GLib from "gi://GLib"
import { createPersistedState } from "./lib/persist"

export type Settings = {
  useCustomIcons: boolean
  barIconSize: number
  showBattery: boolean
  showBluetooth: boolean
  showSpeaker: boolean
  showMicrophone: boolean
  showNetwork: boolean
}

const defaults: Settings = {
  useCustomIcons: true,
  barIconSize: 16,
  showBattery: true,
  showBluetooth: true,
  showSpeaker: true,
  showMicrophone: true,
  showNetwork: true
}

export const [settings, setSetting] = createPersistedState(
  `${GLib.get_user_config_dir()}/minishell/settings.toml`,
  defaults
)
