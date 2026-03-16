import { createBinding, For, This } from "ags"
import app from "ags/gtk4/app"
import style from "./styles/app.scss"
import Bar from "./widgets/Bar"
import OSD from "./widgets/OSD"
import { settingsWindow, toggleSettings } from "./widgets/Settings"
import { debugWindow, toggleDebug } from "./widgets/Debug"

app.start({
  css: style,
  requestHandler(argv: string[], res: (r: string) => void) {
    if (argv[0] === "settings") {
      res(toggleSettings())
    } else if (argv[0] === "debug") {
      res(toggleDebug())
    } else {
      res("unknown request")
    }
  },
  main() {
    app.add_window(settingsWindow)
    app.add_window(debugWindow)
    const monitors = createBinding(app, "monitors")

    return (
      <This this={app}>
        <For each={monitors}>{(monitor) => <Bar gdkmonitor={monitor} />}</For>
        <OSD />
      </This>
    )
  }
})
