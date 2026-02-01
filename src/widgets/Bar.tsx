// @ts-nocheck
import app from "ags/gtk4/app"
import Astal from "gi://Astal?version=4.0"
import Gdk from "gi://Gdk?version=4.0"
import Gtk from "gi://Gtk?version=4.0"
import GLib from "gi://GLib"
import AstalHyprland from "gi://AstalHyprland"
import AstalWp from "gi://AstalWp"
import AstalBattery from "gi://AstalBattery"
import AstalPowerProfiles from "gi://AstalPowerProfiles"
import AstalNetwork from "gi://AstalNetwork"
import AstalBluetooth from "gi://AstalBluetooth"
import { With, For, createBinding, onCleanup, createMemo, createState } from "ags"
import { createPoll } from "ags/time"
import { idle } from "ags/time"

function Clock() {
  const time = createPoll("", 1000, () => {
    return GLib.DateTime.new_now_local().format("%H:%M")!
  })

  return <label label={time} cssClasses={["clock"]} />
}

function Workspaces({ gdkmonitor }: { gdkmonitor: Gdk.Monitor }) {
  const hyprland = AstalHyprland.get_default()

  const [urgentWorkspaces, setUrgentWorkspaces] = createState<Set<number>>(new Set())

  const urgentId = hyprland.connect("urgent", (_, client) => {
    if (client?.workspace?.id) {
      setUrgentWorkspaces((prev) => new Set([...prev, client.workspace.id]))
    }
  })

  const focusedId = hyprland.connect("notify::focused-workspace", () => {
    const focusedWs = hyprland.focusedWorkspace?.id
    if (focusedWs) {
      setUrgentWorkspaces((prev) => {
        const next = new Set(prev)
        next.delete(focusedWs)
        return next
      })
    }
  })

  onCleanup(() => {
    hyprland.disconnect(urgentId)
    hyprland.disconnect(focusedId)
  })

  const hyprMonitor = createBinding(hyprland, "monitors").as((monitors) =>
    monitors.find((m) => m.name === gdkmonitor.connector)
  )

  const workspaceIds = createBinding(hyprland, "workspaces").as((workspaces) =>
    workspaces
      .filter((ws) => ws.monitor?.name === gdkmonitor.connector && ws.id > 0)
      .map((ws) => ws.id)
      .sort((a, b) => a - b)
  )

  return (
    <With value={hyprMonitor}>
      {(monitor) => {
        if (!monitor) return <box />

        const activeWorkspace = createBinding(monitor, "activeWorkspace")

        return (
          <box cssClasses={["workspaces"]} valign={Gtk.Align.CENTER} vexpand={false}>
            <For each={workspaceIds}>
              {(id) => {
                const wsClasses = createMemo(() => {
                  const ws = activeWorkspace()
                  const urgent = urgentWorkspaces()
                  const classes = ["workspace"]
                  if (ws?.id === id) classes.push("active")
                  if (urgent.has(id)) classes.push("urgent")
                  return classes
                })

                return (
                  <button
                    cssClasses={wsClasses}
                    onClicked={() => hyprland.dispatch("workspace", id.toString())}
                  >
                    <box
                      cssClasses={["workspace-indicator"]}
                      valign={Gtk.Align.CENTER}
                      halign={Gtk.Align.CENTER}
                      vexpand={false}
                      hexpand={false}
                    />
                  </button>
                )
              }}
            </For>
          </box>
        )
      }}
    </With>
  )
}

export default function Bar({ gdkmonitor }: { gdkmonitor: Gdk.Monitor }) {
  let win: Astal.Window
  const { TOP, LEFT, RIGHT } = Astal.WindowAnchor

  const hyprland = AstalHyprland.get_default()
  const clients = createBinding(hyprland, "clients")
  const focusedWorkspace = createBinding(hyprland, "focusedWorkspace")

  const [floatingChanged, setFloatingChanged] = createState(0)
  const floatingId = hyprland.connect("floating", () => {
    setFloatingChanged((prev) => prev + 1)
  })

  const barClasses = createMemo(() => {
    const allClients = clients()
    focusedWorkspace()
    floatingChanged()

    const hyprMonitor = hyprland.monitors.find((m) => m.name === gdkmonitor.connector)
    const activeWsId = hyprMonitor?.activeWorkspace?.id

    const hasWindows = allClients.some((c) => c.workspace?.id === activeWsId && !c.floating)

    return hasWindows ? ["bar-content"] : ["bar-content", "no-windows"]
  })

  onCleanup(() => {
    hyprland.disconnect(floatingId)
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
