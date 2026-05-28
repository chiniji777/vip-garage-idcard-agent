# VIP Garage ID Card Agent

Tiny background app that bridges a Thai national ID card smart-card reader
(PC/SC) to the VIP Garage web app. Browsers can't talk to USB directly, so
this agent runs on the workstation, exposes `http://localhost:8765/read-id`,
and the web form fetches from it.

> One install per workstation that has a card reader. Production targets
> Windows 11 and macOS.

## For staff (Windows / Mac install)

1. Download the latest installer from the
   [Releases page](https://github.com/chiniji777/vip-garage-idcard-agent/releases/latest)
   — `.exe` for Windows, `.dmg` for Mac.
2. Run the installer. Defaults are fine.
3. The agent runs in the **system tray** (Windows) / **menu bar** (Mac)
   as a small ID-card icon.
4. Plug in the USB smart card reader.
5. In the VIP Garage web app, go to **เคลม → เพิ่มใหม่** and click
   **เสียบบัตรประชาชน** — it should fill the form from the card.

The agent listens on `http://localhost:8765`. It only accepts requests
from the production VIP Garage domains (CORS allow-list in
[`src/config.ts`](src/config.ts)).

## What the agent exposes

| Route        | Use                                            |
|--------------|------------------------------------------------|
| `GET /health` | Liveness probe — returns `{ ok: true, version }` |
| `GET /read-id` | Reads the inserted Thai ID card via PC/SC and returns a JSON payload with `cid`, `titleTh`, `firstNameTh`, `lastNameTh`, `address` |

If no reader is attached the agent returns `503 reader_not_found`. If the
card can't be read (no card inserted, locked, etc.) it returns
`500 read_failed` with a message.

## For developers

### Stack

- Electron (main process only, no renderer) — system-tray UI
- Express (HTTP server) on `127.0.0.1:8765`
- [`thai-id-card-reader`](https://github.com/goomgumx/thai-id-card-reader) — PC/SC bridge (depends on `pcsclite` native module)
- TypeScript

### Prerequisites

- Node.js 20.x
- A C++ toolchain — `pcsclite` is a native module:
  - **Windows**: Visual Studio Build Tools (C++ workload)
  - **macOS**: Xcode Command Line Tools
  - **Linux**: `build-essential pkg-config libpcsclite-dev`
- A smart-card reader plugged into the dev machine (for end-to-end testing)

### Quick start

```bash
bun install
bun run rebuild           # rebuilds pcsclite native against Electron's Node ABI
bun run start             # launches Electron + the local HTTP server
```

Tray icon shows up. Test with:

```bash
curl http://localhost:8765/health
curl http://localhost:8765/read-id        # plug a card in first
```

### Building installers

```bash
bun run dist:mac          # → release/*.dmg (arm64 + x64)
bun run dist:win          # → release/*.exe (NSIS, x64)
```

> Cross-builds: building Windows .exe from macOS works for the JS side but
> can't sign the Windows installer. The `release.yml` workflow does this
> properly by spinning up a Windows runner.

### Cutting a release

1. Bump `version` in `package.json`.
2. `git tag v0.1.x && git push --tags`
3. The `release.yml` workflow builds on Mac + Windows and uploads .dmg
   / .exe to the GitHub Release for that tag.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  USB smart-card reader → PC/SC → thai-id-card-reader    │
│                                       ↓                  │
│  Electron main → Express → GET /read-id → JSON           │
│                                       ↑                  │
│  Browser at https://chiangrai.vip-garage.org             │
│    fetch("http://localhost:8765/read-id")                │
└─────────────────────────────────────────────────────────┘
```

Browsers allow `http://localhost` fetches from `https://` pages as a
"secure context exception" (treated as potentially trustworthy). No
TLS needed on the agent.

## Licence

UNLICENSED — internal use by VIP Garage and the Iris-family operators.
