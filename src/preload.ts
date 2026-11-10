import { contextBridge, ipcRenderer } from "electron";
import type {
  ConfirmationRequest,
  DroidDropAPI,
  EntryInfo,
} from "./shared/types";
const api: DroidDropAPI = {
  onConfirmation: (callback: (request: ConfirmationRequest) => void) =>
    ipcRenderer.on(
      "confirmation-request",
      (_event, request: ConfirmationRequest) => callback(request),
    ),
  respondConfirmation: (id: string, confirmed: boolean) =>
    ipcRenderer.send("confirmation-response", id, confirmed),
  devices: () => ipcRenderer.invoke("devices"),
  files: (serial: string, dir: string) =>
    ipcRenderer.invoke("files", serial, dir),
  createDirectory: (serial: string, dir: string, name: string) =>
    ipcRenderer.invoke("create-directory", serial, dir, name),
  renameEntry: (
    serial: string,
    dir: string,
    oldName: string,
    newName: string,
  ) => ipcRenderer.invoke("rename-entry", serial, dir, oldName, newName),
  removeEntry: (serial: string, dir: string, entry: EntryInfo) =>
    ipcRenderer.invoke("remove-entry", serial, dir, entry),
  push: (serial: string, dir: string) =>
    ipcRenderer.invoke("push", serial, dir),
  pull: (serial: string, entry: EntryInfo) =>
    ipcRenderer.invoke("pull", serial, entry),
  showInFolder: (file: string) => ipcRenderer.invoke("show-in-folder", file),
};

contextBridge.exposeInMainWorld("droiddrop", api);
