// @ts-nocheck
import Gtk from "gi://Gtk?version=4.0"
import GLib from "gi://GLib"
import { createPoll, createInterval } from "ags/time"
import { createMemo } from "ags"
import { execAsync } from "ags/process"

export default function Clock() {
  const time = createPoll("", 1000, () => {
    return GLib.DateTime.new_now_local().format("%H:%M")!
  })

  const notificationCount = createPoll("0", 3000, () => {
    return execAsync(["swaync-client", "-c"])
      .then((out) => out.trim())
      .catch(() => "0")
  })

  const hasNotifications = createMemo(() => {
    const count = parseInt(notificationCount())
    return count > 0
  })

  return (
    <button
      cssClasses={["clock-button"]}
      onClicked={() => execAsync(["swaync-client", "-t"])}
    >
      <box spacing={6} valign={Gtk.Align.CENTER}>
        <label label={time} cssClasses={["clock"]} />
        <box
          cssClasses={["notification-dot"]}
          visible={hasNotifications}
          valign={Gtk.Align.CENTER}
        />
      </box>
    </button>
  )
}
