// @ts-nocheck
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createState } from "ags"

export type Settings = {
  useCustomIcons: boolean
}

const CONFIG_FILE = `${GLib.get_user_config_dir()}/minishell/settings.toml`

const defaults: Settings = {
  useCustomIcons: true,
}

function parseToml(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const line of text.split("\n")) {
    const trimmedLine = line.trim()
    if (!trimmedLine || trimmedLine.startsWith("#")) continue
    const equal = trimmedLine.indexOf("=")
    if (equal === -1) continue
    const key = trimmedLine.slice(0, equal).trim()
    const val = trimmedLine.slice(equal + 1).trim()
    if (value === "true") result[key] = true
    else if (value === "false") result[key] = false
    else if (/^-?\d+$/.test(value)) result[key] = parseInt(value)
    else if (/^-?\d+\.\d+$/.test(value)) result[key] = parseFloat(value)
    else if (value.startsWith('"') && value.endsWith('"'))
      result[key] = value.slice(1, -1).replace(/\\"/g, '"')
  }
  return result
}

function stringifyToml(data: Record<string, unknown>): string {
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

function read(): Settings {
  try {
    const [, bytes] = GLib.file_get_contents(CONFIG_FILE)
    return { ...defaults, ...parseToml(new TextDecoder().decode(bytes)) }
  } catch {
    return { ...defaults }
  }
}

function write(s: Settings) {
  const file = Gio.File.new_for_path(CONFIG_FILE)
  const parent = file.get_parent()!
  if (!parent.query_exists(null)) parent.make_directory_with_parents(null)
  file.replace_contents(
    new TextEncoder().encode(stringifyToml(s as Record<string, unknown>)),
    null,
    false,
    Gio.FileCreateFlags.REPLACE_DESTINATION,
    null,
  )
}

export const [settings, setSettings] = createState<Settings>(read())

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  const next = { ...settings(), [key]: value }
  setSettings(next)
  write(next)
}
