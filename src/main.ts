// Electron main process — keeps the HTTP server alive while the user is
// logged in. Surfaces status through a system-tray icon (status, open
// docs, quit) so the agent doesn't show up as a permanent window.

import path from "path";
import { app, Menu, Tray, shell, dialog } from "electron";

import { HTTP_PORT } from "./config";
import { startHttpServer } from "./server";

const DOCS_URL = "https://chiangrai.vip-garage.org/settings/idcard-agent";
const STATUS_URL = `http://127.0.0.1:${HTTP_PORT}/health`;

let tray: Tray | null = null;
let httpHandle: Awaited<ReturnType<typeof startHttpServer>> | null = null;
let lastStartError: string | null = null;

function resourcePath(rel: string): string {
  // When running from `electron .` the assets live next to the source;
  // packaged builds get them under process.resourcesPath/assets.
  const packaged = process.resourcesPath
    ? path.join(process.resourcesPath, "assets", rel)
    : path.join(__dirname, "..", "assets", rel);
  return packaged;
}

function buildMenu(): Menu {
  const status = httpHandle
    ? `🟢 รันอยู่ — port ${HTTP_PORT}`
    : `🔴 หยุดอยู่${lastStartError ? ` (${lastStartError})` : ""}`;

  return Menu.buildFromTemplate([
    { label: "VIP Garage ID Card Agent", enabled: false },
    { label: status, enabled: false },
    { type: "separator" },
    {
      label: "ทดสอบ /health ในเบราว์เซอร์",
      click: () => shell.openExternal(STATUS_URL),
    },
    {
      label: "เปิดเอกสาร",
      click: () => shell.openExternal(DOCS_URL),
    },
    { type: "separator" },
    { label: "ออกจากโปรแกรม", role: "quit" },
  ]);
}

function refreshTray() {
  if (!tray) return;
  tray.setToolTip(
    httpHandle
      ? `VIP Garage ID Agent — รันที่ port ${HTTP_PORT}`
      : "VIP Garage ID Agent — ยังไม่พร้อมใช้งาน",
  );
  tray.setContextMenu(buildMenu());
}

async function startServer() {
  try {
    httpHandle = await startHttpServer();
    lastStartError = null;
  } catch (err) {
    lastStartError =
      err instanceof Error ? err.message : String(err);
    // Common case: another instance already bound the port. Let the user
    // know with a dialog instead of failing silently.
    dialog.showErrorBox(
      "VIP Garage ID Agent — เริ่มไม่สำเร็จ",
      `เปิด HTTP server ที่ port ${HTTP_PORT} ไม่ได้:\n\n${lastStartError}\n\nอาจมี agent ตัวเก่ารันอยู่ — ลองปิดก่อน`,
    );
  } finally {
    refreshTray();
  }
}

app.whenReady().then(async () => {
  // macOS shows a dock icon by default for Electron apps; the agent is a
  // background utility so we hide it. Tray-only UI.
  if (process.platform === "darwin" && app.dock) {
    app.dock.hide();
  }

  tray = new Tray(resourcePath("tray-icon.png"));
  refreshTray();

  await startServer();
});

app.on("window-all-closed", (e: Event) => {
  // Don't quit when there are no windows — we never had any.
  e.preventDefault();
});

app.on("before-quit", async () => {
  if (httpHandle) {
    try {
      await httpHandle.close();
    } catch {
      // best-effort shutdown
    }
  }
});
