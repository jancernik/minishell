import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createState } from "ags"

export function parseToml(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const line of text.split("\n")) {
    const trimmedLine = line.trim()
    if (!trimmedLine || trimmedLine.startsWith("#")) continue
    const equal = trimmedLine.indexOf("=")
    if (equal === -1) continue
    const key = trimmedLine.slice(0, equal).trim()
    const value = trimmedLine.slice(equal + 1).trim()
    if (value === "true") result[key] = true
    else if (value === "false") result[key] = false
    else if (/^-?\d+$/.test(value)) result[key] = parseInt(value)
    else if (/^-?\d+\.\d+$/.test(value)) result[key] = parseFloat(value)
    else if (value.startsWith('"') && value.endsWith('"'))
      result[key] = value.slice(1, -1).replace(/\\"/g, '"')
  }
  return result
}

export function stringifyToml(data: Record<string, unknown>): string {
  return (
    Object.entries(data)
      .map(([key, value]) => {
        if (typeof value === "boolean") return `${key} = ${value}`
        if (typeof value === "number") return `${key} = ${value}`
        if (typeof value === "string")
          return `${key} = "${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
        return null
      })
      .filter(Boolean)
      .join("\n") + "\n"
  )
}

export function createPersistedState<T extends Record<string, unknown>>(
  configFile: string,
  defaults: T
) {
  function read(): T {
    try {
      const [, bytes] = GLib.file_get_contents(configFile)
      return { ...defaults, ...parseToml(new TextDecoder().decode(bytes)) }
    } catch {
      return { ...defaults }
    }
  }

  function write(s: T) {
    const file = Gio.File.new_for_path(configFile)
    const parent = file.get_parent()!
    if (!parent.query_exists(null)) parent.make_directory_with_parents(null)
    file.replace_contents(
      new TextEncoder().encode(stringifyToml(s as Record<string, unknown>)),
      null,
      false,
      Gio.FileCreateFlags.REPLACE_DESTINATION,
      null
    )
  }

  const [state, setState] = createState<T>(read())

  function set<K extends keyof T>(key: K, value: T[K]) {
    const next = { ...state(), [key]: value }
    setState(next)
    write(next)
  }

  return [state, set] as const
}
