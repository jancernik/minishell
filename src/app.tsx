// @ts-nocheck
import { createBinding, For, This } from "ags"
import app from "ags/gtk4/app"
import style from "./styles/app.scss"
import Bar from "./widgets/Bar"
import OSD from "./widgets/OSD"

app.start({
  css: style,
  main() {
    const monitors = createBinding(app, "monitors")

    return (
      <This this={app}>
        <For each={monitors}>
          {(monitor) => <Bar gdkmonitor={monitor} />}
        </For>
        <OSD />
      </This>
    )
  }
})
