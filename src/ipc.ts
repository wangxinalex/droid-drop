import {
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  type IpcMainInvokeEvent,
  type IpcMainEvent,
} from "electron";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  adb,
  parseDevices,
  listFiles,
  shellQuote,
  remoteJoin,
  createDirectory,
  removeEntry,
  renameEntry,
} from "./adb";
import type { ConfirmationRequest, EntryInfo } from "./shared/types";

function windowFor(event: IpcMainInvokeEvent): BrowserWindow {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) throw new Error("应用窗口不可用");
  return window;
}

function confirmAction(
  window: BrowserWindow,
  request: Omit<ConfirmationRequest, "id">,
): Promise<boolean> {
  return new Promise((resolve) => {
    const id = randomUUID();
    const contents = window.webContents;
    const finish = (confirmed: boolean) => {
      ipcMain.removeListener("confirmation-response", onResponse);
      window.removeListener("closed", onClosed);
      contents.removeListener("render-process-gone", onClosed);
      resolve(confirmed);
    };
    const onResponse = (
      event: IpcMainEvent,
      responseId: string,
      confirmed: boolean,
    ) => {
      if (event.sender === contents && responseId === id)
        finish(confirmed === true);
    };
    const onClosed = () => finish(false);
    ipcMain.on("confirmation-response", onResponse);
    window.once("closed", onClosed);
    contents.once("render-process-gone", onClosed);
    contents.send("confirmation-request", { id, ...request });
  });
}

// 界面通过 preload 暴露的 API 请求这些操作。
export function registerIpcHandlers(): void {
  ipcMain.handle("devices", async () =>
    parseDevices(await adb(["devices", "-l"])),
  );
  ipcMain.handle("files", async (_event, serial: string, dir: string) =>
    listFiles(serial, dir),
  );
  ipcMain.handle(
    "create-directory",
    async (_event, serial: string, dir: string, name: string) =>
      createDirectory(serial, dir, name),
  );
  ipcMain.handle(
    "rename-entry",
    async (
      _event,
      serial: string,
      dir: string,
      oldName: string,
      newName: string,
    ) => renameEntry(serial, dir, oldName, newName),
  );
  ipcMain.handle(
    "remove-entry",
    async (event, serial: string, dir: string, entry: EntryInfo) => {
      const window = windowFor(event);
      const confirmed = await confirmAction(window, {
        action: "delete",
        message: `删除“${entry.name}”？`,
        detail: entry.isDirectory
          ? "文件夹及其中的所有内容将被永久删除，无法恢复。"
          : "此文件将被永久删除，无法恢复。",
      });
      if (!confirmed) return { canceled: true };
      await removeEntry(serial, dir, entry.name);
      return { canceled: false };
    },
  );
  ipcMain.handle("push", async (event, serial: string, dir: string) => {
    if (!dir.startsWith("/")) throw new Error("设备路径必须是绝对路径");
    const window = windowFor(event);
    const selected = await dialog.showOpenDialog(window, {
      title: "选择发送到设备的文件",
      properties: ["openFile", "multiSelections"],
    });
    if (selected.canceled) return { canceled: true };
    let completed = 0;
    for (const file of selected.filePaths) {
      const destination = remoteJoin(dir, path.basename(file));
      const exists =
        (
          await adb([
            "-s",
            serial,
            "shell",
            `if [ -e ${shellQuote(destination)} ]; then echo yes; fi`,
          ])
        ).trim() === "yes";
      if (exists) {
        const confirmed = await confirmAction(window, {
          action: "replace",
          message: `设备上已存在“${path.basename(file)}”`,
          detail: "替换会覆盖设备上的现有文件。",
        });
        if (!confirmed) continue;
      }
      await adb(["-s", serial, "push", file, destination]);
      completed++;
    }
    return { completed };
  });
  ipcMain.handle("pull", async (event, serial: string, entry: EntryInfo) => {
    if (
      !entry.path?.startsWith("/") ||
      !entry.name ||
      entry.name === "." ||
      entry.name === ".." ||
      entry.name.includes("/")
    )
      throw new Error("无效的设备文件路径");
    const window = windowFor(event);
    let destination;
    if (entry.isDirectory) {
      const selected = await dialog.showOpenDialog(window, {
        title: "选择保存文件夹的位置",
        properties: ["openDirectory", "createDirectory"],
      });
      if (selected.canceled) return { canceled: true };
      destination = path.join(selected.filePaths[0], entry.name);
      // adb pull 目录可能合并已有内容，先拒绝同名目标以免覆盖。
      try {
        await fs.access(destination);
        throw new Error(`目标位置已存在“${entry.name}”，请选择其他位置。`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    } else {
      const selected = await dialog.showSaveDialog(window, {
        title: "保存到 Mac",
        defaultPath: entry.name,
        properties: ["showOverwriteConfirmation", "createDirectory"],
      });
      if (selected.canceled || !selected.filePath) return { canceled: true };
      destination = selected.filePath;
    }
    await adb(["-s", serial, "pull", entry.path, destination]);
    return { destination };
  });
  ipcMain.handle("show-in-folder", (_event, file: string) =>
    shell.showItemInFolder(file),
  );
}
