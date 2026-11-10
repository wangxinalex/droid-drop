import { sortEntries, type SortKey, type SortDirection } from "./sort.js";
import type { FileEntry } from "./shared/types.js";

function formatTime(seconds: number | null) {
  if (seconds == null) return "不可用";
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return "不可用";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
interface FileActions {
  openDirectory(entry: FileEntry): void;
  download(entry: FileEntry): void;
  rename(entry: FileEntry): void;
  remove(entry: FileEntry): void;
}

export function renderFileList(
  container: HTMLElement,
  entries: FileEntry[],
  sortKey: SortKey,
  sortDirection: SortDirection,
  actions: FileActions,
): void {
  container.replaceChildren();
  for (const entry of sortEntries(entries, sortKey, sortDirection)) {
    container.append(createFileRow(entry, actions));
  }
}

function createFileRow(entry: FileEntry, actions: FileActions): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "file-row";
  const name = document.createElement("button");
  name.className = "file-name";
  const icon = document.createElement("span");
  icon.className = entry.isDirectory ? "file-icon folder" : "file-icon";
  icon.textContent = entry.isDirectory ? "▰" : "▤";
  const label = document.createElement("span");
  label.textContent = entry.name;
  name.append(icon, label);
  name.addEventListener("click", () => {
    if (entry.isDirectory) actions.openDirectory(entry);
    else actions.download(entry);
  });
  const modified = document.createElement("span");
  modified.className = "file-time";
  modified.textContent = formatTime(entry.modifiedAt);
  modified.title =
    entry.modifiedAt == null ? "设备未提供修改时间" : modified.textContent;
  const downloadButton = document.createElement("button");
  downloadButton.className = "download";
  downloadButton.title = "保存到 Mac";
  downloadButton.setAttribute("aria-label", `保存 ${entry.name} 到 Mac`);
  downloadButton.textContent = "↓";
  downloadButton.addEventListener("click", () => actions.download(entry));
  const renameButton = document.createElement("button");
  renameButton.className = "rename";
  renameButton.title = "重命名";
  renameButton.setAttribute("aria-label", `重命名 ${entry.name}`);
  renameButton.textContent = "✎";
  renameButton.addEventListener("click", () => actions.rename(entry));
  const deleteButton = document.createElement("button");
  deleteButton.className = "delete";
  deleteButton.title = "删除";
  deleteButton.setAttribute("aria-label", `删除 ${entry.name}`);
  deleteButton.textContent = "×";
  deleteButton.addEventListener("click", () => actions.remove(entry));
  const buttons = document.createElement("div");
  buttons.className = "file-actions";
  buttons.append(downloadButton, renameButton, deleteButton);
  row.append(name, modified, buttons);
  return row;
}
