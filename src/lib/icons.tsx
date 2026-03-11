// @ts-nocheck
import GLib from "gi://GLib"
import { createMemo } from "ags"
import { settings } from "../settings"

const ICONS_DIR = `${GLib.get_home_dir()}/minishell/icons`

// Maps GTK theme icon names to custom SVG filenames

const ICON_MAP: Record<string, string> = {
  "audio-volume-low-symbolic": "volume",
  "audio-volume-medium-symbolic": "volume-1",
  "audio-volume-high-symbolic": "volume-2",
  "audio-volume-muted-symbolic": "volume-x",
  "brightness-low-symbolic": "sun-dim",
  "brightness-medium-symbolic": "sun-medium",
  "brightness-high-symbolic": "sun",
  "audio-input-microphone-symbolic": "mic",
  "audio-input-microphone-muted-symbolic": "mic-off"
}

export function Icon({
  name,
  pixelSize = 24
}: {
  name: string | (() => string)
  pixelSize?: number
}) {
  const getName: () => string = typeof name === "function" ? name : () => name
  const showCustom = createMemo(() => settings().useCustomIcons && getName() in ICON_MAP)
  const filePath = createMemo(() => `${ICONS_DIR}/${ICON_MAP[getName()]}.svg`)

  return (
    <box>
      <image visible={showCustom} file={filePath} pixelSize={pixelSize} />
      <image visible={createMemo(() => !showCustom())} iconName={name} pixelSize={pixelSize} />
    </box>
  )
}
