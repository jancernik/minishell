// @ts-nocheck
import GLib from "gi://GLib"
import { createPoll } from "ags/time"

export default function Clock() {
  const time = createPoll("", 1000, () => {
    return GLib.DateTime.new_now_local().format("%H:%M")!
  })

  return <label label={time} cssClasses={["clock"]} />
}
