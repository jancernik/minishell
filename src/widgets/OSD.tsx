// @ts-nocheck
import Astal from "gi://Astal?version=4.0"
import Gio from "gi://Gio"
import GLib from "gi://GLib"
import Gtk from "gi://Gtk?version=4.0"
import AstalWp from "gi://AstalWp"
import AstalHyprland from "gi://AstalHyprland"
import app from "ags/gtk4/app"
import { createBinding, onCleanup, createState, createMemo, With } from "ags"
import { Icon } from "../lib/icons"
import GLib from "gi://GLib"

const STATE_HOME = GLib.getenv("XDG_STATE_HOME") || `${GLib.get_home_dir()}/.local/state`
const BRIGHTNESS_CURRENT = `${STATE_HOME}/brightness.current`
const BRIGHTNESS_SUPPRESS_OSD = `${STATE_HOME}/brightness.silent`

const TIMEOUT_MS = 2000
const ANIMATION_DURATION = 350

function readBrightnessValues(): number[] {
  try {
    const [, contents] = GLib.file_get_contents(BRIGHTNESS_CURRENT)
    return new TextDecoder()
      .decode(contents)
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => parseInt(line.includes(":") ? line.split(":")[1] : line))
      .filter((v) => Number.isFinite(v))
  } catch {
    return []
  }
}

function VolumeIndicator({
  type,
  showOsd
}: {
  type: "speaker" | "microphone"
  showOsd: () => void
}) {
  const wp = AstalWp.get_default()!
  const audio = wp.audio

  const endpoint =
    type === "speaker"
      ? createBinding(audio, "defaultSpeaker")
      : createBinding(audio, "defaultMicrophone")

  let lastVolume: number | null = null
  let lastMute: boolean | null = null
  let firstRun = true

  let currentEndpoint: AstalWp.Endpoint | null = null
  let volumeSignalId: number | null = null
  let muteSignalId: number | null = null

  const onVolumeOrMuteChange = () => {
    if (!currentEndpoint) return

    const currentVolume = currentEndpoint.volume
    const currentMute = currentEndpoint.mute

    if (firstRun) {
      lastVolume = currentVolume
      lastMute = currentMute
      firstRun = false
      return
    }

    if (currentVolume === lastVolume && currentMute === lastMute) return

    lastVolume = currentVolume
    lastMute = currentMute
    showOsd()
  }

  const connectToEndpoint = (endpoint: AstalWp.Endpoint | null) => {
    if (currentEndpoint) {
      if (volumeSignalId) currentEndpoint.disconnect(volumeSignalId)
      if (muteSignalId) currentEndpoint.disconnect(muteSignalId)
    }

    currentEndpoint = endpoint
    if (!endpoint) return

    lastVolume = endpoint.volume
    lastMute = endpoint.mute

    volumeSignalId = endpoint.connect("notify::volume", onVolumeOrMuteChange)
    muteSignalId = endpoint.connect("notify::mute", onVolumeOrMuteChange)
  }

  const initialEndpoint = type === "speaker" ? audio.defaultSpeaker : audio.defaultMicrophone
  connectToEndpoint(initialEndpoint)

  const defaultSignalId = audio.connect(`notify::default-${type}`, () => {
    const endpoint = type === "speaker" ? audio.defaultSpeaker : audio.defaultMicrophone
    connectToEndpoint(endpoint)
  })

  onCleanup(() => {
    audio.disconnect(defaultSignalId)
    if (currentEndpoint) {
      if (volumeSignalId) currentEndpoint.disconnect(volumeSignalId)
      if (muteSignalId) currentEndpoint.disconnect(muteSignalId)
    }
  })

  return (
    <With value={endpoint}>
      {(endpoint) => {
        if (!endpoint) return <box />

        const volume = createBinding(endpoint, "volume")
        const mute = createBinding(endpoint, "mute")

        const iconName = createMemo(() => {
          if (mute()) {
            return type === "speaker"
              ? "audio-volume-muted-symbolic"
              : "audio-input-microphone-muted-symbolic"
          }
          if (type === "microphone") return "audio-input-microphone-symbolic"
          const v = volume()
          if (Math.round(v * 100) === 0) return "audio-volume-low-symbolic"
          if (v <= 0.5) return "audio-volume-medium-symbolic"
          return "audio-volume-high-symbolic"
        })

        return (
          <box cssClasses={["osd-indicator"]} spacing={14}>
            <Icon name={iconName} pixelSize={20} />
            <levelbar
              hexpand
              valign={Gtk.Align.CENTER}
              widthRequest={130}
              value={volume.as((v) => Math.min(v, 1))}
              minValue={0}
              maxValue={1}
            />
            <label label={volume.as((v) => `${Math.round(v * 100)}`)} widthChars={3} xalign={0.5} />
          </box>
        )
      }}
    </With>
  )
}

function BrightnessIndicator({ showOsd }: { showOsd: () => void }) {
  const initial = readBrightnessValues()
  const [percentage, setPercentage] = createState(
    initial.length ? Math.round(initial.reduce((a, b) => a + b, 0) / initial.length) : 50
  )

  const level = createMemo(() => percentage() / 100)
  const label = createMemo(() => `${percentage()}`)

  let lastPercentage = percentage()

  const fileMonitor = Gio.File.new_for_path(BRIGHTNESS_CURRENT).monitor_file(
    Gio.FileMonitorFlags.NONE,
    null
  )

  fileMonitor.connect("changed", () => {
    if (GLib.file_test(BRIGHTNESS_SUPPRESS_OSD, GLib.FileTest.EXISTS)) return
    const values = readBrightnessValues()
    if (values.length === 0) return
    const average = Math.round(values.reduce((a, b) => a + b, 0) / values.length)
    if (average === lastPercentage) return
    lastPercentage = average
    setPercentage(average)
    showOsd()
  })

  onCleanup(() => fileMonitor.cancel())

  const brightnessIcon = createMemo(() => {
    const p = percentage()
    if (p <= 33) return "brightness-low-symbolic"
    if (p <= 66) return "brightness-medium-symbolic"
    return "brightness-high-symbolic"
  })

  return (
    <box cssClasses={["osd-indicator"]} spacing={14}>
      <Icon name={brightnessIcon} pixelSize={20} />
      <levelbar
        hexpand
        valign={Gtk.Align.CENTER}
        widthRequest={130}
        value={level}
        minValue={0}
        maxValue={1}
      />
      <label label={label} widthChars={3} xalign={0.5} />
    </box>
  )
}

export default function OSD() {
  let win: Astal.Window
  const hyprland = AstalHyprland.get_default()
  const { BOTTOM } = Astal.WindowAnchor

  type OsdType = "speaker" | "microphone" | "brightness"

  const [active, setActive] = createState<OsdType | null>(null)
  let timeoutId: number | null = null
  let switchTimeoutId: number | null = null

  const show = (type: OsdType) => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }

    const current = active()
    const switching = switchTimeoutId !== null

    if (!switching && (current === null || current === type)) {
      setActive(type)
      timeoutId = setTimeout(() => {
        setActive(null)
        timeoutId = null
      }, TIMEOUT_MS)
      return
    }

    if (switchTimeoutId) {
      clearTimeout(switchTimeoutId)
      switchTimeoutId = null
    }

    if (current !== null) setActive(null)

    switchTimeoutId = setTimeout(() => {
      switchTimeoutId = null
      setActive(type)
      timeoutId = setTimeout(() => {
        setActive(null)
        timeoutId = null
      }, TIMEOUT_MS)
    }, ANIMATION_DURATION)
  }

  const speakerVisible = createMemo(() => active() === "speaker")
  const micVisible = createMemo(() => active() === "microphone")
  const brightnessVisible = createMemo(() => active() === "brightness")

  const windowVisible = createMemo(() => active() !== null)

  const focusedMonitor = createBinding(hyprland, "focusedMonitor")

  const gdkMonitor = createMemo(() => {
    const mon = focusedMonitor()
    if (!mon) return app.monitors[0] || null
    return app.monitors.find((m) => m.connector === mon.name) || app.monitors[0] || null
  })

  onCleanup(() => {
    if (timeoutId) clearTimeout(timeoutId)
    if (switchTimeoutId) clearTimeout(switchTimeoutId)
    win?.destroy()
  })

  return (
    <window
      $={(self) => {
        self.set_gdkmonitor(gdkMonitor())
      }}
      visible={windowVisible}
      class="osd"
      namespace="osd"
      name="osd"
      gdkmonitor={gdkMonitor}
      layer={Astal.Layer.OVERLAY}
      exclusivity={Astal.Exclusivity.IGNORE}
      keymode={Astal.Keymode.NONE}
      anchor={BOTTOM}
      marginBottom={60}
    >
      <box
        orientation={Gtk.Orientation.VERTICAL}
        halign={Gtk.Align.CENTER}
        spacing={4}
        cssClasses={["osd-container"]}
      >
        <box visible={brightnessVisible}>
          <BrightnessIndicator showOsd={() => show("brightness")} />
        </box>
        <box visible={speakerVisible}>
          <VolumeIndicator type="speaker" showOsd={() => show("speaker")} />
        </box>
        <box visible={micVisible}>
          <VolumeIndicator type="microphone" showOsd={() => show("microphone")} />
        </box>
      </box>
    </window>
  )
}
