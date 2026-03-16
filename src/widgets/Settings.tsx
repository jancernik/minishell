import Gtk from "gi://Gtk?version=4.0"
import { settings, setSetting } from "../settings"

export const settingsWindow: Gtk.Window = (
  <Gtk.Window
    title="Settings"
    resizable={false}
    onCloseRequest={(self) => {
      self.hide()
      return true
    }}
    // defaultWidth={320}
  >
    <box cssClasses={["settings-container"]} orientation={Gtk.Orientation.VERTICAL} spacing={12}>
      <label cssClasses={["settings-title"]} label="Settings" xalign={0} />
      <box cssClasses={["settings-row"]} spacing={12}>
        <label label="Custom icons" hexpand xalign={0} />
        <switch
          active={settings().useCustomIcons}
          $={(self) =>
            self.connect("notify::active", () => setSetting("useCustomIcons", self.active))
          }
        />
      </box>
      <box cssClasses={["settings-row"]} spacing={12}>
        <label label="Bar icon size" hexpand xalign={0} />
        <Gtk.SpinButton
          $={(self) => {
            self.set_range(10, 32)
            self.set_increments(1, 2)
            self.set_value(settings().barIconSize)
            self.connect("value-changed", () => setSetting("barIconSize", self.value))
          }}
        />
      </box>
      <label cssClasses={["settings-title"]} label="Status indicators" xalign={0} />
      {(
        [
          ["Battery", "showBattery"],
          ["Bluetooth", "showBluetooth"],
          ["Speaker", "showSpeaker"],
          ["Microphone", "showMicrophone"],
          ["Network", "showNetwork"]
        ] as const
      ).map(([label, key]) => (
        <box cssClasses={["settings-row"]} spacing={12}>
          <label label={label} hexpand xalign={0} />
          <switch
            active={settings()[key]}
            $={(self) => self.connect("notify::active", () => setSetting(key, self.active))}
          />
        </box>
      ))}
    </box>
  </Gtk.Window>
) as Gtk.Window

export function toggleSettings(): string {
  settingsWindow.visible ? settingsWindow.hide() : settingsWindow.present()
  return settingsWindow.visible ? "shown" : "hidden"
}
