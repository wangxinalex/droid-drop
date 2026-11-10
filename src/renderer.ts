import type { SortKey, SortDirection } from "./sort.js";
import { renderFileList } from "./file-list.js";
import { listenForConfirmations } from "./confirmation-dialog.js";
import type { Device, DroidDropAPI, FileEntry } from "./shared/types.js";

declare global {
  interface Window {
    droiddrop: DroidDropAPI;
  }
}

function element(id: string): HTMLElement {
  const result = document.getElementById(id);
  if (!result) throw new Error(`缺少界面元素：${id}`);
  return result;
}
const $ = element;
const button = (id: string): HTMLButtonElement =>
  element(id) as HTMLButtonElement;
const input = (id: string): HTMLInputElement => element(id) as HTMLInputElement;
const dialog = (id: string): HTMLDialogElement =>
  element(id) as HTMLDialogElement;

let renameTarget: { serial: string; dir: string; name: string } | null = null;

const state: {
  devices: Device[];
  serial: string | null;
  path: string;
  busy: boolean;
  request: number;
  toastTimer: number | undefined;
  entries: FileEntry[];
  sortKey: SortKey;
  sortDirection: SortDirection;
} = {
  devices: [],
  serial: null,
  path: "/sdcard",
  busy: false,
  request: 0,
  toastTimer: undefined,
  entries: [],
  sortKey: "name",
  sortDirection: "asc",
};

function toast(message: string, isError = false) {
  const el = $("toast");
  el.textContent = message;
  el.className = `toast${isError ? " error" : ""}`;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => el.classList.add("hidden"), 6000);
}
function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(
    /^Error invoking remote method '[^']+': Error: /,
    "",
  );
}
function deviceName(device: Device) {
  return device.model || (device.emulator ? "Android 模拟器" : device.serial);
}
function renderDevices() {
  const container = $("devices");
  container.replaceChildren();
  if (!state.devices.length) {
    const note = document.createElement("p");
    note.className = "no-devices";
    note.textContent = "还没有检测到设备";
    container.append(note);
    return;
  }
  for (const device of state.devices) {
    const button = document.createElement("button");
    button.className = `device${state.serial === device.serial ? " selected" : ""}`;
    button.disabled = device.state !== "device" || state.busy;
    const icon = document.createElement("span");
    icon.className = "device-icon";
    icon.textContent = device.emulator ? "▣" : "▯";
    const info = document.createElement("span");
    info.className = "device-info";
    const name = document.createElement("strong");
    name.textContent = deviceName(device);
    const status = document.createElement("small");
    status.textContent =
      device.state === "device"
        ? device.emulator
          ? "模拟器 · 已连接"
          : "已连接"
        : device.state === "unauthorized"
          ? "请在设备上允许 USB 调试"
          : device.state;
    info.append(name, status);
    button.append(icon, info);
    button.addEventListener("click", () => selectDevice(device));
    container.append(button);
  }
}
async function refreshDevices(quiet = false, openFirst = false) {
  if (state.busy) return;
  try {
    state.devices = await window.droiddrop.devices();
    if (
      state.serial &&
      !state.devices.some(
        (device) => device.serial === state.serial && device.state === "device",
      )
    ) {
      state.serial = null;
      state.request++;
      $("browser").classList.add("hidden");
      $("empty").classList.remove("hidden");
      $("title").textContent = "文件传输";
      $("subtitle").textContent = "你的 Mac 和 Android，轻松互传。";
    }
    renderDevices();
    $("status").textContent = state.serial
      ? "设备已连接"
      : state.devices.length
        ? `${state.devices.length} 台设备已发现`
        : "等待设备连接";
    if (openFirst && !state.serial && !state.busy) {
      const device = state.devices.find((item) => item.state === "device");
      if (device) selectDevice(device);
      else toast("没有可用设备，请检查连接或允许 USB 调试。", true);
    }
  } catch (error) {
    if (!quiet) toast(errorMessage(error), true);
    $("status").textContent = "ADB 连接不可用";
  }
}
function selectDevice(device: Device) {
  state.serial = device.serial;
  state.path = "/sdcard";
  $("title").textContent = deviceName(device);
  $("subtitle").textContent = device.serial;
  $("empty").classList.add("hidden");
  $("browser").classList.remove("hidden");
  $("status").textContent = "设备已连接";
  renderDevices();
  loadFiles();
}
async function loadFiles() {
  const request = ++state.request;
  const serial = state.serial;
  const dir = state.path;
  if (!serial) return;
  state.entries = [];
  $("path").textContent = dir;
  button("up").disabled = dir === "/";
  $("files").replaceChildren();
  $("file-count").textContent = "";
  $("file-empty").textContent = "正在读取文件…";
  $("file-empty").classList.remove("hidden");
  try {
    const entries = await window.droiddrop.files(serial, dir);
    // 用户可能已切换设备或目录；忽略较早请求的结果。
    if (request !== state.request) return;
    $("file-count").textContent = `${entries.length} 项`;
    $("file-empty").textContent = "这个文件夹是空的。";
    $("file-empty").classList.toggle("hidden", entries.length > 0);
    state.entries = entries;
    renderFiles();
  } catch (error) {
    if (request !== state.request) return;
    $("file-empty").textContent = "无法读取此文件夹。";
    toast(errorMessage(error), true);
  }
}
function renderFiles() {
  renderFileList(
    $("files"),
    state.entries,
    state.sortKey,
    state.sortDirection,
    {
      openDirectory: (entry) => {
        if (state.busy) return;
        state.path = entry.path;
        loadFiles();
      },
      download,
      rename: openRename,
      remove,
    },
  );
}
document.querySelectorAll<HTMLButtonElement>("[data-sort]").forEach((button) =>
  button.addEventListener("click", () => {
    const key = button.dataset.sort as SortKey;
    state.sortDirection =
      state.sortKey === key && state.sortDirection === "asc" ? "desc" : "asc";
    state.sortKey = key;
    document
      .querySelectorAll<HTMLButtonElement>("[data-sort]")
      .forEach((item) => {
        const label = { name: "名称", modifiedAt: "修改时间" }[
          item.dataset.sort as SortKey
        ];
        item.textContent =
          label +
          (item.dataset.sort === key
            ? state.sortDirection === "asc"
              ? " ↑"
              : " ↓"
            : "");
      });
    renderFiles();
  }),
);
function setBusy(busy: boolean, message = "") {
  state.busy = busy;
  button("upload").disabled = busy;
  button("new-folder").disabled = busy;
  button("up").disabled = busy || state.path === "/";
  button("refresh-files").disabled = busy;
  button("refresh").disabled = busy;
  $("browser").classList.toggle("busy", busy);
  $("status").textContent = busy ? message : "设备已连接";
  renderDevices();
}
async function upload() {
  if (state.busy || !state.serial) return;
  setBusy(true, "正在发送文件…");
  try {
    const result = await window.droiddrop.push(state.serial, state.path);
    if (!result.canceled) {
      toast(
        result.completed
          ? `已发送 ${result.completed} 个文件`
          : "没有文件被发送",
      );
      await loadFiles();
    }
  } catch (error) {
    toast(errorMessage(error), true);
    await loadFiles();
  } finally {
    setBusy(false);
  }
}
async function download(entry: FileEntry) {
  if (state.busy || !state.serial) return;
  setBusy(true, "正在保存到 Mac…");
  try {
    const result = await window.droiddrop.pull(state.serial, entry);
    if (!result.canceled) toast(`已保存到 ${result.destination}`);
  } catch (error) {
    toast(errorMessage(error), true);
  } finally {
    setBusy(false);
  }
}
async function remove(entry: FileEntry) {
  if (state.busy || !state.serial) return;
  setBusy(true, "正在删除…");
  try {
    const result = await window.droiddrop.removeEntry(
      state.serial,
      state.path,
      entry,
    );
    if (!result.canceled) {
      toast(`已删除 ${entry.name}`);
      await loadFiles();
    }
  } catch (error) {
    toast(errorMessage(error), true);
    await loadFiles();
  } finally {
    setBusy(false);
  }
}
function openRename(entry: FileEntry) {
  if (state.busy || !state.serial) return;
  renameTarget = { serial: state.serial, dir: state.path, name: entry.name };
  input("rename-name").value = entry.name;
  $("rename-error").classList.add("hidden");
  dialog("rename-dialog").showModal();
  input("rename-name").select();
}

listenForConfirmations(window.droiddrop);

$("cancel-rename").addEventListener("click", () =>
  dialog("rename-dialog").close(),
);
$("rename-dialog").addEventListener("close", () => {
  renameTarget = null;
});
$("rename-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const target = renameTarget;
  const newName = input("rename-name").value;
  if (!target || state.busy) return;
  if (target.serial !== state.serial || target.dir !== state.path) {
    $("rename-error").textContent = "设备或目录已更改，请重新选择文件。";
    $("rename-error").classList.remove("hidden");
    return;
  }
  if (newName === target.name) {
    dialog("rename-dialog").close();
    return;
  }
  setBusy(true, "正在重命名…");
  button("confirm-rename").disabled = true;
  try {
    await window.droiddrop.renameEntry(
      target.serial,
      target.dir,
      target.name,
      newName,
    );
    dialog("rename-dialog").close();
    toast(`已重命名为 ${newName}`);
    await loadFiles();
  } catch (error) {
    $("rename-error").textContent = errorMessage(error);
    $("rename-error").classList.remove("hidden");
  } finally {
    button("confirm-rename").disabled = false;
    setBusy(false);
  }
});
$("new-folder").addEventListener("click", () => {
  input("folder-name").value = "";
  dialog("folder-dialog").showModal();
  $("folder-name").focus();
});
$("cancel-folder").addEventListener("click", () =>
  dialog("folder-dialog").close(),
);
$("folder-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = input("folder-name").value;
  dialog("folder-dialog").close();
  if (state.busy || !state.serial) return;
  setBusy(true, "正在创建文件夹…");
  try {
    await window.droiddrop.createDirectory(state.serial, state.path, name);
    toast(`已创建 ${name}`);
    await loadFiles();
  } catch (error) {
    toast(errorMessage(error), true);
  } finally {
    setBusy(false);
  }
});
$("refresh").addEventListener("click", () => refreshDevices());
$("empty-refresh").addEventListener("click", () => refreshDevices(false, true));
$("refresh-files").addEventListener("click", loadFiles);
$("upload").addEventListener("click", upload);
$("up").addEventListener("click", () => {
  state.path = state.path.replace(/\/+$/, "").replace(/\/[^/]*$/, "") || "/";
  loadFiles();
});
refreshDevices();
setInterval(() => refreshDevices(true), 5000);
