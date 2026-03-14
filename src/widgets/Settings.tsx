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
    </box>
  </Gtk.Window>
) as Gtk.Window

export function toggleSettings(): string {
  settingsWindow.visible ? settingsWindow.hide() : settingsWindow.present()
  return settingsWindow.visible ? "shown" : "hidden"
}
