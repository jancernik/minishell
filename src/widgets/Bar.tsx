// @ts-nocheck
import app from "ags/gtk4/app"
import Astal from "gi://Astal?version=4.0"
import Gdk from "gi://Gdk?version=4.0"
import AstalHyprland from "gi://AstalHyprland"
import { createBinding, onCleanup, createMemo, createState } from "ags"
import Clock from "./bar/Clock"
import Workspaces from "./bar/Workspaces"

export default function Bar({ gdkmonitor }: { gdkmonitor: Gdk.Monitor }) {
  let win: Astal.Window
  const { TOP, LEFT, RIGHT } = Astal.WindowAnchor

  const hyprland = AstalHyprland.get_default()
  const clients = createBinding(hyprland, "clients")
  const focusedWorkspace = createBinding(hyprland, "focusedWorkspace")

  const [clientStateChanged, setClientStateChanged] = createState(0)
  const floatingId = hyprland.connect("floating", () => {
    setClientStateChanged((prev) => prev + 1)
  })
  const clientMovedId = hyprland.connect("client-moved", () => {
    setClientStateChanged((prev) => prev + 1)
  })

  const barClasses = createMemo(() => {
    const allClients = clients()
    focusedWorkspace()
    clientStateChanged()

    const hyprMonitor = hyprland.monitors.find((m) => m.name === gdkmonitor.connector)
    const activeWsId = hyprMonitor?.activeWorkspace?.id

    const hasWindows = allClients.some((c) => c.workspace?.id === activeWsId && !c.floating)

    return hasWindows ? ["bar-content"] : ["bar-content", "no-windows"]
  })

  onCleanup(() => {
    hyprland.disconnect(floatingId)
    hyprland.disconnect(clientMovedId)
    win.destroy()
  })

  return (
    <window
      $={(self) => (win = self)}
      visible
      class="bar"
      namespace="bar"
      name={`bar-${gdkmonitor.connector}`}
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.EXCLUSIVE}
      anchor={TOP | LEFT | RIGHT}
      application={app}
    >
      <box cssClasses={barClasses} hexpand>
        <centerbox hexpand>
          <box $type="start">
            <Workspaces gdkmonitor={gdkmonitor} />
          </box>
          <box $type="center">
            <Clock />
          </box>
        </centerbox>
      </box>
    </window>
  )
}
