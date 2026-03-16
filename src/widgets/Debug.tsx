import Gtk from "gi://Gtk?version=4.0"
import { debug, setDebug } from "../debug"

export const debugWindow: Gtk.Window = (
  <Gtk.Window
    title="Debug"
    resizable={false}
    onCloseRequest={(self) => {
      self.hide()
      return true
    }}
  >
    <box cssClasses={["debug-container"]} orientation={Gtk.Orientation.VERTICAL} spacing={12}>
      <label cssClasses={["debug-title"]} label="Debug" xalign={0} />
      <box cssClasses={["debug-row"]} spacing={12}>
        <label label="Mock battery level" hexpand xalign={0} />
        <Gtk.SpinButton
          $={(self) => {
            self.set_range(-1, 100)
            self.set_increments(1, 10)
            self.set_value(debug().mockBatteryLevel)
            self.connect("value-changed", () => setDebug("mockBatteryLevel", self.value))
          }}
        />
      </box>
      <box cssClasses={["debug-row"]} spacing={12}>
        <label label="Mock battery charging" hexpand xalign={0} />
        <switch
          active={debug().mockBatteryCharging}
          $={(self) =>
            self.connect("notify::active", () => setDebug("mockBatteryCharging", self.active))
          }
        />
      </box>
    </box>
  </Gtk.Window>
) as Gtk.Window

export function toggleDebug(): string {
  debugWindow.visible ? debugWindow.hide() : debugWindow.present()
  return debugWindow.visible ? "shown" : "hidden"
}
