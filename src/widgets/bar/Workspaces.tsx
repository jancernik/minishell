// @ts-nocheck
import Gdk from "gi://Gdk?version=4.0"
import Gtk from "gi://Gtk?version=4.0"
import AstalHyprland from "gi://AstalHyprland"
import { With, For, createBinding, onCleanup, createMemo, createState } from "ags"

export default function Workspaces({ gdkmonitor }: { gdkmonitor: Gdk.Monitor }) {
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
