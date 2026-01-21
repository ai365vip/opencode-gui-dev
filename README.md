# OpenCode GUI (VS Code Extension)

[中文说明](README_CN.md)

Use OpenCode inside VS Code with a WebView chat UI. This extension connects to an OpenCode server (`opencode serve`) over HTTP/SSE, translates the event stream into the UI protocol, and renders it in the sidebar.

![OpenCode logo](resources/opencode-logo.png)

## Features

- Sidebar chat UI powered by OpenCode
- Reuse an existing local server, or auto-start `opencode serve` (local base URL only)
- Stream tool calls and results
- Send editor context quickly (`Ctrl+L` / `Cmd+L`, Explorer context menu)
- One-click revert for the latest OpenCode change
- Settings UI for common OpenCode config files (including `oh-my-opencode`)

> Note: This project is in active development and may change frequently.

## Requirements

- VS Code `>= 1.98`
- OpenCode CLI available in `PATH` (`opencode --version`)
- For development: Node.js `>= 18` and `pnpm`

OpenCode install instructions: https://opencode.ai/docs

## Install (from source)

1. Install deps: `pnpm install`
2. Build: `pnpm build`
3. Package: `pnpm package` (generates a `.vsix` in the repo root)
4. In VS Code: Extensions → “Install from VSIX…”

## Usage

- Open the **OpenCode** icon in the Activity Bar to show the sidebar.
- Pick a model, then start chatting.
- Add context from VS Code:
  - `Ctrl+L` / `Cmd+L`: send current selection (plus file reference)
  - Explorer context menu: “添加到 OpenCode”
- Optional: run “OpenCode: 一键 Revert 最近改动” to revert the latest change.

## Configuration

### VS Code settings

- `opencodeGui.opencodePath`: path to the `opencode` executable
- `opencodeGui.serverBaseUrl`: default `http://127.0.0.1:4096`  
  If you set a non-local base URL, the extension will only connect (it won’t auto-start a server).
- `opencodeGui.selectedModel`: default model (`provider/model`)
- `opencodeGui.selectedAgent`: default agent name
- `opencodeGui.configDir`: pass `OPENCODE_CONFIG_DIR` when starting the server (useful for oh-my-opencode profiles)

### OpenCode config files

OpenCode supports **JSON** and **JSONC** (JSON with comments). Typical locations:

- Project: `<workspace>/.opencode/opencode.jsonc` (or `.json`)
- Project (oh-my-opencode): `<workspace>/.opencode/oh-my-opencode.json`
- User config (macOS/Linux): `~/.config/opencode/opencode.jsonc` (or `.json`)
- User config (oh-my-opencode): `~/.config/opencode/oh-my-opencode.json`
- Credentials: `~/.local/share/opencode/auth.json`

On Windows, these locations follow the OS equivalents of the XDG folders (commonly `%APPDATA%\\opencode` for config and `%LOCALAPPDATA%\\opencode` for data), unless you override with `XDG_CONFIG_HOME` / `XDG_DATA_HOME`.

Security: `auth.json` contains API keys/tokens. Do not paste it into issues or screenshots.

## Development

- `pnpm dev`: run Vite (WebView) + watch extension build
- In VS Code press `F5` and choose:
  - `OpenCode GUI: Run Dev (Vite)` (recommended)
  - `OpenCode GUI: Run (Extension Host)` (production-like)
- `pnpm typecheck:all`, `pnpm test`

More details: `docs/OPENCODE_GUI_DEV.md`

## License

AGPL-3.0

## Credits

The chat UI is adapted from Claudix / Claude Code UI, with a protocol-compat translation layer on the extension side.
