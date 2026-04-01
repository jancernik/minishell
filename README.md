# minishell

A personal desktop shell built with [AGS](https://github.com/Aylur/ags) (Aylur's GTK Shell, GTK4) for Hyprland.

Simple, minimal, and made to fit my setup and my recurring need to make _everything_ bespoke.

As it sits right now, this is more of an extension of my dotfiles than a general-purpose project. If you're looking for something polished and configurable for your own setup, this probably isn't it.

## Features

- Workspace indicator that works with [split-monitor-workspaces](https://github.com/zjeffer/split-monitor-workspaces/)
- Top bar with status indicators
- OSD for volume and brightness
- Settings and debug panel

## In progress

Used daily, just not properly cleaned up yet.

- Icons rework
- Quick settings panel
- Notification daemon

## Dependencies

```bash
yay -S --needed aylurs-gtk-shell-git libastal-meta dart-sass pnpm
```

## Status

Heavy work in progress. I use this daily but there are a lot of uncommitted features and rough edges.

I think it has potential to be a really nice shell, but for now I have other projects taking priority.