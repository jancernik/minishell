// @ts-nocheck
import app from "ags/gtk4/app"
import Astal from "gi://Astal?version=4.0"
import Gdk from "gi://Gdk?version=4.0"
import Gtk from "gi://Gtk?version=4.0"
import AstalWp from "gi://AstalWp"
import AstalNetwork from "gi://AstalNetwork"
import AstalBluetooth from "gi://AstalBluetooth"
import AstalBattery from "gi://AstalBattery"
import { With, createBinding, onCleanup, createMemo, createState } from "ags"

function VolumeSlider() {
  const wp = AstalWp.get_default()
  const speaker = createBinding(wp.audio, "defaultSpeaker")

  return (
    <With value={speaker}>
      {(ep) => {
        if (!ep) return <box />

        const volume = createBinding(ep, "volume")
        const iconName = createBinding(ep, "volumeIcon")

        return (
          <box cssClasses={["qs-row"]} spacing={10}>
            <image iconName={iconName} pixelSize={18} />
            <slider
              hexpand
              value={volume}
              onChangeValue={(self) => {
                ep.volume = self.value
              }}
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

function NetworkRow() {
  const network = AstalNetwork.get_default()
  const primary = createBinding(network, "primary")
  const wifiSsid = createBinding(network.wifi, "ssid")
  const wifiIcon = createBinding(network.wifi, "iconName")
  const wiredIcon = createBinding(network.wired, "iconName")

  const iconName = primary.as((p) => {
    if (p === AstalNetwork.Primary.WIRED) return wiredIcon.get()
    if (p === AstalNetwork.Primary.WIFI) return wifiIcon.get()
    return "network-offline-symbolic"
  })

  const label = createMemo(() => {
    const p = primary()
    if (p === AstalNetwork.Primary.WIFI) return wifiSsid() || "Wi-Fi"
    if (p === AstalNetwork.Primary.WIRED) return "Wired"
    return "Offline"
  })

  return (
    <box cssClasses={["qs-row"]} spacing={10}>
      <image iconName={iconName} pixelSize={18} />
      <label label={label} hexpand xalign={0} />
    </box>
  )
}

function BluetoothRow() {
  const bt = AstalBluetooth.get_default()
  const isPowered = createBinding(bt, "isPowered")
  const isConnected = createBinding(bt, "isConnected")
  const devicesBinding = createBinding(bt, "devices")

  const label = createMemo(() => {
    if (!isPowered()) return "Bluetooth Off"
    if (!isConnected()) return "Bluetooth"

    const list = (devicesBinding() ?? []) as AstalBluetooth.Device[]
    const connected = list.filter((d) => d.connected)
    if (connected.length === 0) return "Bluetooth"

    return connected.map((d) => d.alias || d.name || "Device").join(", ")
  })

  const iconName = createMemo(() => {
    if (!isPowered()) return "bluetooth-disabled-symbolic"
    if (isConnected()) return "bluetooth-active-symbolic"
    return "bluetooth-symbolic"
  })

  return (
    <box cssClasses={["qs-row"]} spacing={10}>
      <image iconName={iconName} pixelSize={18} />
      <label label={label} hexpand xalign={0} ellipsize={3} />
    </box>
  )
}

function BatteryRow() {
  const battery = AstalBattery.get_default()
  const isPresent = createBinding(battery, "isPresent")
  const percentage = createBinding(battery, "percentage")
  const iconName = createBinding(battery, "iconName")
  const charging = createBinding(battery, "charging")

  const label = createMemo(() => {
    const pct = Math.round(percentage() * 100)
    return charging() ? `${pct}% Charging` : `${pct}%`
  })

  return (
    <box cssClasses={["qs-row"]} spacing={10} visible={isPresent}>
      <image iconName={iconName} pixelSize={18} />
      <label label={label} hexpand xalign={0} />
    </box>
  )
}

export default function QuickSettings({
  gdkmonitor,
  visible,
  onClose,
}: {
  gdkmonitor: Gdk.Monitor
  visible: () => boolean
  onClose: () => void
}) {
  let win: Astal.Window
  const { TOP, LEFT, RIGHT, BOTTOM } = Astal.WindowAnchor

  let clickedInside = false

  const outerGesture = Gtk.GestureClick.new()
  outerGesture.connect("released", () => {
    if (clickedInside) {
      clickedInside = false
      return
    }
    onClose()
  })

  const keyController = Gtk.EventControllerKey.new()
  keyController.connect("key-pressed", (_self, keyval) => {
    if (keyval === Gdk.KEY_Escape) onClose()
  })

  const innerGesture = Gtk.GestureClick.new()
  innerGesture.set_button(0)
  innerGesture.connect("released", () => {
    clickedInside = true
  })

  onCleanup(() => {
    win?.destroy()
  })

  return (
    <window
      $={(self) => {
        win = self
        self.add_controller(outerGesture)
        self.add_controller(keyController)
      }}
      visible={visible}
      class="quick-settings"
      namespace="quick-settings"
      name={`quick-settings-${gdkmonitor.connector}`}
      gdkmonitor={gdkmonitor}
      layer={Astal.Layer.TOP}
      exclusivity={Astal.Exclusivity.NORMAL}
      keymode={Astal.Keymode.EXCLUSIVE}
      anchor={TOP | LEFT | RIGHT | BOTTOM}
    >
      <box>
        <box
          $={(self) => self.add_controller(innerGesture)}
          cssClasses={["qs-container"]}
          orientation={Gtk.Orientation.VERTICAL}
          spacing={4}
          halign={Gtk.Align.END}
          valign={Gtk.Align.START}
        >
          <VolumeSlider />
          <box cssClasses={["qs-separator"]} />
          <NetworkRow />
          <BluetoothRow />
          <BatteryRow />
        </box>
      </box>
    </window>
  )
}
