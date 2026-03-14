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
  "microphone-symbolic": "mic",
  "audio-input-microphone-symbolic": "mic",
  "audio-input-microphone-high-symbolic": "mic",
  "audio-input-microphone-medium-symbolic": "mic",
  "audio-input-microphone-low-symbolic": "mic",
  "microphone-sensitivity-high-symbolic": "mic",
  "microphone-sensitivity-medium-symbolic": "mic",
  "microphone-sensitivity-low-symbolic": "mic",
  "audio-input-microphone-muted-symbolic": "mic-off",
  "microphone-sensitivity-muted-symbolic": "mic-off",
  "microphone-sensitivity-none-symbolic": "mic-off",
  "microphone-disabled-symbolic": "mic-off",
  "microphone-hardware-disabled-symbolic": "mic-off",
  "network-wireless-connected-00-symbolic": "wifi-zero",
  "network-wireless-connected-0-symbolic": "wifi-zero",
  "network-wireless-signal-none-symbolic": "wifi-zero",
  "network-wireless-connected-20-symbolic": "wifi-low",
  "network-wireless-connected-25-symbolic": "wifi-low",
  "network-wireless-signal-weak-symbolic": "wifi-low",
  "network-wireless-connected-40-symbolic": "wifi-high",
  "network-wireless-connected-50-symbolic": "wifi-high",
  "network-wireless-connected-60-symbolic": "wifi-high",
  "network-wireless-signal-ok-symbolic": "wifi-high",
  "network-wireless-connected-75-symbolic": "wifi",
  "network-wireless-connected-80-symbolic": "wifi",
  "network-wireless-connected-100-symbolic": "wifi",
  "network-wireless-signal-good-symbolic": "wifi",
  "network-wireless-signal-excellent-symbolic": "wifi",
  "network-wireless-symbolic": "wifi",
  "bluetooth-active-symbolic": "bluetooth",
  "bluetooth-symbolic": "bluetooth",
  "network-bluetooth-symbolic": "bluetooth",
  "network-wireless-bluetooth-symbolic": "bluetooth",
  "bluetooth-disabled-symbolic": "bluetooth-off",
  "bluetooth-disconnected-symbolic": "bluetooth-off",
  "bluetooth-hardware-disabled-symbolic": "bluetooth-off",
  "network-bluetooth-inactive-symbolic": "bluetooth-off",
  "battery-full-symbolic": "battery-full",
  "battery-good-symbolic": "battery",
  "battery-medium-symbolic": "battery-medium",
  "battery-low-symbolic": "battery-low",
  "battery-caution-symbolic": "battery-warning"
}

export function Icon({
  name,
  pixelSize = 24
}: {
  name: string | (() => string)
  pixelSize?: number | (() => number)
}) {
  const getName: () => string = typeof name === "function" ? name : () => name
  const pxSize = typeof pixelSize === "function" ? createMemo(pixelSize) : pixelSize
  const showCustom = createMemo(() => settings().useCustomIcons && getName() in ICON_MAP)
  const filePath = createMemo(() => `${ICONS_DIR}/${ICON_MAP[getName()]}.svg`)

  return (
    <box>
      <image visible={showCustom} file={filePath} pixelSize={pxSize} />
      <image
        visible={createMemo(() => !showCustom())}
        iconName={createMemo(getName)}
        pixelSize={pxSize}
      />
    </box>
  )
}
