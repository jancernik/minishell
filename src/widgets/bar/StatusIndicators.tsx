// @ts-nocheck
import Gtk from "gi://Gtk?version=4.0"
import AstalWp from "gi://AstalWp"
import AstalNetwork from "gi://AstalNetwork"
import AstalBluetooth from "gi://AstalBluetooth"
import { With, createBinding, onCleanup, createMemo, createState } from "ags"

function NetworkIndicator() {
  const network = AstalNetwork.get_default()

  const primary = createBinding(network, "primary")
  const wiredIcon = createBinding(network.wired, "iconName")
  const wifiIcon = createBinding(network.wifi, "iconName")

  const wifiSsid = createBinding(network.wifi, "ssid")

  const visible = primary.as(
    (p) => p === AstalNetwork.Primary.WIRED || p === AstalNetwork.Primary.WIFI
  )

  const iconName = primary.as((p) => {
    if (p === AstalNetwork.Primary.WIRED) return wiredIcon.get()
    if (p === AstalNetwork.Primary.WIFI) return wifiIcon.get()
    return ""
  })

  const tooltipText = createMemo(() => {
    return primary() === AstalNetwork.Primary.WIFI ? (wifiSsid() || "") : ""
  })

  return (
    <Gtk.Box visible={visible} tooltipText={tooltipText}>
      <Gtk.Image iconName={iconName} pixelSize={14} />
    </Gtk.Box>
  )
}

function BluetoothIndicator() {
  const bt = AstalBluetooth.get_default()

  const isPowered = createBinding(bt, "isPowered")
  const isConnected = createBinding(bt, "isConnected")
  const devicesBinding = createBinding(bt, "devices")

  const visible = createMemo(() => isPowered() && isConnected())

  const [tick, setTick] = createState(0)
  const bump = () => setTick(tick() + 1)

  const deviceSignalIds = new Map<AstalBluetooth.Device, number[]>()

  const disconnectAllDeviceSignals = () => {
    for (const [dev, ids] of deviceSignalIds) {
      for (const id of ids) dev.disconnect(id)
    }
    deviceSignalIds.clear()
  }

  const connectDeviceSignals = (dev: AstalBluetooth.Device) => {
    if (deviceSignalIds.has(dev)) return

    const ids: number[] = []
    ids.push(dev.connect("notify::connected", bump))
    ids.push(dev.connect("notify::alias", bump))
    ids.push(dev.connect("notify::name", bump))

    deviceSignalIds.set(dev, ids)
  }

  const refreshDeviceSignalWiring = () => {
    const list = (devicesBinding() ?? []) as AstalBluetooth.Device[]

    for (const dev of deviceSignalIds.keys()) {
      if (!list.includes(dev)) {
        const ids = deviceSignalIds.get(dev)!
        for (const id of ids) dev.disconnect(id)
        deviceSignalIds.delete(dev)
      }
    }

    for (const dev of list) connectDeviceSignals(dev)

    bump()
  }

  const devicesNotifyId = bt.connect("notify::devices", refreshDeviceSignalWiring)

  refreshDeviceSignalWiring()

  onCleanup(() => {
    bt.disconnect(devicesNotifyId)
    disconnectAllDeviceSignals()
  })

  const tooltipText = createMemo(() => {
    tick()

    if (!visible()) return ""

    const list = (devicesBinding() ?? []) as AstalBluetooth.Device[]
    const connected = list.filter((d) => d.connected)

    if (connected.length === 0) return ""

    const names = connected.map((d) => d.alias || d.name || "Unknown device")
    return `Bluetooth connected:\n${names.join("\n")}`
  })

  return (
    <Gtk.Box visible={visible} tooltipText={tooltipText}>
      <Gtk.Image iconName="bluetooth-symbolic" pixelSize={14} />
    </Gtk.Box>
  )
}

function AudioIndicator({ kind }: { kind: "speaker" | "microphone" }) {
  const wp = AstalWp.get_default()
  const audio = wp.audio

  const endpoint = createBinding(
    audio,
    kind === "speaker" ? "defaultSpeaker" : "defaultMicrophone"
  )

  const visible = createMemo(() => !!endpoint())

  return (
    <Gtk.Box visible={visible}>
      <With value={endpoint}>
        {(ep) => {
          if (!ep) return <Gtk.Box />

          const iconName = createBinding(ep, "volumeIcon")
          const tooltipText = createBinding(ep, "description")

          return (
            <Gtk.Box tooltipText={tooltipText}>
              <Gtk.Image iconName={iconName} pixelSize={14} />
            </Gtk.Box>
          )
        }}
      </With>
    </Gtk.Box>
  )
}

export default function StatusIndicators({
  onToggle,
}: {
  onToggle: () => void
}) {
  return (
    <button cssClasses={["status-indicators"]} onClicked={onToggle}>
      <box spacing={6}>
        <BluetoothIndicator />
        <AudioIndicator kind="speaker" />
        <AudioIndicator kind="microphone" />
        <NetworkIndicator />
      </box>
    </button>
  )
}
