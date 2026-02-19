// @ts-nocheck
import Astal from "gi://Astal?version=4.0"
import Gtk from "gi://Gtk?version=4.0"
import AstalWp from "gi://AstalWp"
import AstalHyprland from "gi://AstalHyprland"
import app from "ags/gtk4/app"
import { createBinding, onCleanup, createState, createMemo, With } from "ags"

const TIMEOUT_MS = 2000

function VolumeIndicator({
  type,
  showOsd,
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

  const connectToEndpoint = (ep: AstalWp.Endpoint | null) => {
    if (currentEndpoint) {
      if (volumeSignalId) currentEndpoint.disconnect(volumeSignalId)
      if (muteSignalId) currentEndpoint.disconnect(muteSignalId)
    }

    currentEndpoint = ep
    if (!ep) return

    lastVolume = ep.volume
    lastMute = ep.mute

    volumeSignalId = ep.connect("notify::volume", onVolumeOrMuteChange)
    muteSignalId = ep.connect("notify::mute", onVolumeOrMuteChange)
  }

  const initialEndpoint = type === "speaker" ? audio.defaultSpeaker : audio.defaultMicrophone
  connectToEndpoint(initialEndpoint)

  const defaultSignalId = audio.connect(`notify::default-${type}`, () => {
    const ep = type === "speaker" ? audio.defaultSpeaker : audio.defaultMicrophone
    connectToEndpoint(ep)
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
      {(ep) => {
        if (!ep) return <box />

        const volume = createBinding(ep, "volume")
        const volumeIcon = createBinding(ep, "volumeIcon")
        const mute = createBinding(ep, "mute")

        const classes = mute.as((m) => (m ? ["osd-indicator", "muted"] : ["osd-indicator"]))

        return (
          <box cssClasses={classes} spacing={12}>
            <image iconName={volumeIcon} pixelSize={24} />
            <levelbar
              hexpand
              widthRequest={200}
              value={volume}
              minValue={0}
              maxValue={1}
            />
            <label
              label={volume.as((v) => `${Math.round(v * 100)}%`)}
              widthChars={4}
              xalign={1}
            />
          </box>
        )
      }}
    </With>
  )
}

export default function OSD() {
  let win: Astal.Window
  const hyprland = AstalHyprland.get_default()
  const { BOTTOM } = Astal.WindowAnchor

  const [speakerVisible, setSpeakerVisible] = createState(false)
  const [micVisible, setMicVisible] = createState(false)
  let speakerTimeoutId: number | null = null
  let micTimeoutId: number | null = null

  const showSpeaker = () => {
    setSpeakerVisible(true)
    if (speakerTimeoutId) clearTimeout(speakerTimeoutId)
    speakerTimeoutId = setTimeout(() => {
      setSpeakerVisible(false)
      speakerTimeoutId = null
    }, TIMEOUT_MS)
  }

  const showMic = () => {
    setMicVisible(true)
    if (micTimeoutId) clearTimeout(micTimeoutId)
    micTimeoutId = setTimeout(() => {
      setMicVisible(false)
      micTimeoutId = null
    }, TIMEOUT_MS)
  }

  const windowVisible = createMemo(() => speakerVisible() || micVisible())

  const focusedMonitor = createBinding(hyprland, "focusedMonitor")

  const gdkMonitor = createMemo(() => {
    const mon = focusedMonitor()
    if (!mon) return app.monitors[0] || null
    return app.monitors.find((m) => m.connector === mon.name) || app.monitors[0] || null
  })

  onCleanup(() => {
    if (speakerTimeoutId) clearTimeout(speakerTimeoutId)
    if (micTimeoutId) clearTimeout(micTimeoutId)
    win?.destroy()
  })

  return (
    <window
      $={(self) => {
        win = self
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
    >
      <box
        orientation={Gtk.Orientation.VERTICAL}
        valign={Gtk.Align.END}
        halign={Gtk.Align.CENTER}
        cssClasses={["osd-container"]}
      >
        <revealer
          transitionType={Gtk.RevealerTransitionType.SLIDE_UP}
          transitionDuration={200}
          revealChild={speakerVisible}
        >
          <VolumeIndicator type="speaker" showOsd={showSpeaker} />
        </revealer>
        <revealer
          transitionType={Gtk.RevealerTransitionType.SLIDE_UP}
          transitionDuration={200}
          revealChild={micVisible}
        >
          <VolumeIndicator type="microphone" showOsd={showMic} />
        </revealer>
      </box>
    </window>
  )
}
