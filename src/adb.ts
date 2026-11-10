import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import type { Device, EntryInfo, FileEntry } from "./shared/types";

const execFileAsync = promisify(execFile);
// adb shell 会在设备上解析命令；远端路径必须按 shell 规则转义。
export const shellQuote = (value: string): string =>
  `'${value.replace(/'/g, "'\\''")}'`;
export const remoteJoin = (dir: string, name: string): string =>
  `${dir.replace(/\/$/, "")}/${name}`;

export function parseDevices(output: string): Device[] {
  return output
    .split(/\r?\n/)
    .slice(1)
    .filter((line) => line.trim())
    .map((line) => {
      const [serial, state, ...details] = line.trim().split(/\s+/);
      const model =
        details
          .find((item) => item.startsWith("model:"))
          ?.slice(6)
          .replace(/_/g, " ") || "";
      return { serial, state, model, emulator: serial.startsWith("emulator-") };
    });
}

export function parseEntries(all: Buffer, directories: Buffer): EntryInfo[] {
  const paths = (buffer: Buffer): string[] =>
    buffer.toString("utf8").split("\0").filter(Boolean);
  const dirs = new Set(paths(directories));
  return paths(all)
    .map((item) => ({
      name: item.slice(item.lastIndexOf("/") + 1),
      path: item,
      isDirectory: dirs.has(item),
    }))
    .sort(
      (a, b) =>
        Number(b.isDirectory) - Number(a.isDirectory) ||
        a.name.localeCompare(b.name),
    );
}

export function parseTimes(
  output: Buffer,
): Map<string, { modifiedAt: number | null }> {
  const fields = output.toString("utf8").split("\0");
  const result = new Map<string, { modifiedAt: number | null }>();
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const value = fields[i + 1].trim();
    result.set(fields[i], {
      modifiedAt:
        /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : null,
    });
  }
  return result;
}

function findAdb(): string {
  const candidates = [
    process.env.ADB_PATH,
    process.env.ANDROID_HOME &&
      path.join(process.env.ANDROID_HOME, "platform-tools", "adb"),
    process.env.ANDROID_SDK_ROOT &&
      path.join(process.env.ANDROID_SDK_ROOT, "platform-tools", "adb"),
    path.join(os.homedir(), "Library/Android/sdk/platform-tools/adb"),
  ].filter((candidate): candidate is string => Boolean(candidate));
  return (
    candidates.find((candidate) => {
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return true;
      } catch {
        return false;
      }
    }) || "adb"
  );
}

export function adb(args: string[], options: { binary: true }): Promise<Buffer>;
export function adb(
  args: string[],
  options?: { binary?: false },
): Promise<string>;
export async function adb(
  args: string[],
  options: { binary?: boolean } = {},
): Promise<string | Buffer> {
  try {
    if (options.binary) {
      const { stdout } = await execFileAsync(findAdb(), args, {
        encoding: "buffer",
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
      });
      return stdout;
    }
    const { stdout } = await execFileAsync(findAdb(), args, {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout;
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & {
      stderr?: string | Buffer;
    };
    if (failure.code === "ENOENT")
      throw new Error(
        "找不到 adb。请安装 Android SDK Platform Tools，或设置 ADB_PATH。",
      );
    throw new Error(String(failure.stderr || failure.message).trim());
  }
}

export async function listFiles(
  serial: string,
  dir: string,
): Promise<FileEntry[]> {
  if (!dir.startsWith("/")) throw new Error("设备路径必须是绝对路径");
  // /sdcard 通常是符号链接，末尾斜杠确保 find 遍历链接指向的目录。
  const quoted = shellQuote(`${dir.replace(/\/+$/, "")}/`);
  const [all, dirs] = await Promise.all([
    adb(
      [
        "-s",
        serial,
        "exec-out",
        `find ${quoted} -mindepth 1 -maxdepth 1 -print0`,
      ],
      { binary: true },
    ),
    adb(
      [
        "-s",
        serial,
        "exec-out",
        `find ${quoted} -mindepth 1 -maxdepth 1 -type d -print0`,
      ],
      { binary: true },
    ),
  ]);
  const entries = parseEntries(all, dirs);
  if (!entries.length) return [];
  // 路径和时间用 NUL 分隔，避免空格或换行混入文件名时解析错位。
  const script = `for p do printf '%s\\0' "$p"; v=$(stat -c '%Y' -- "$p" 2>/dev/null); printf '%s\\0' "$v"; done`;
  const output = await adb(
    [
      "-s",
      serial,
      "exec-out",
      `find ${quoted} -mindepth 1 -maxdepth 1 -exec sh -c ${shellQuote(script)} sh {} +`,
    ],
    { binary: true },
  );
  const times = parseTimes(output);
  return entries.map((entry) => ({
    ...entry,
    ...(times.get(entry.path) || { modifiedAt: null }),
  }));
}

function entryPath(dir: string, name: string): string {
  if (typeof dir !== "string" || !dir.startsWith("/") || dir.includes("\0"))
    throw new Error("设备路径无效");
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\0")
  )
    throw new Error("文件夹名称或文件名称无效");
  return remoteJoin(dir, name);
}

export async function createDirectory(
  serial: string,
  dir: string,
  name: string,
): Promise<void> {
  await adb([
    "-s",
    serial,
    "shell",
    `mkdir -- ${shellQuote(entryPath(dir, name))}`,
  ]);
}
export async function removeEntry(
  serial: string,
  dir: string,
  name: string,
): Promise<void> {
  await adb([
    "-s",
    serial,
    "shell",
    `rm -rf -- ${shellQuote(entryPath(dir, name))}`,
  ]);
}

export async function renameEntry(
  serial: string,
  dir: string,
  oldName: string,
  newName: string,
): Promise<void> {
  const source = shellQuote(entryPath(dir, oldName));
  const destination = shellQuote(entryPath(dir, newName));
  if (oldName === newName) return;

  // -n 防止覆盖，-T 避免目标目录出现时将文件移入其中。
  const command = `
    if [ -e ${destination} ] || [ -L ${destination} ]; then
      echo '目标名称已存在' >&2
      exit 1
    fi
    mv -nT -- ${source} ${destination} || exit $?
    if [ -e ${source} ] || [ -L ${source} ]; then
      echo '重命名未完成，目标可能已存在' >&2
      exit 1
    fi
  `;
  await adb(["-s", serial, "shell", command]);
}
