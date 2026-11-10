import { app, BrowserWindow } from "electron";
import * as path from "node:path";
import { registerIpcHandlers } from "./ipc";

function createWindow() {
  const window = new BrowserWindow({
    width: 1120,
    height: 740,
    minWidth: 760,
    minHeight: 540,
    backgroundColor: "#f5f5f1",
    title: "DroidDrop",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.loadFile(path.join(__dirname, "../../index.html"));
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
