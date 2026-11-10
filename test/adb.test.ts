import test from "node:test";
import assert from "node:assert/strict";
import {
  parseDevices,
  parseEntries,
  parseTimes,
  shellQuote,
  remoteJoin,
  listFiles,
  createDirectory,
  removeEntry,
  renameEntry,
} from "../src/adb";

test("parses physical and emulator devices including unavailable states", () => {
  assert.deepEqual(
    parseDevices(
      "List of devices attached\nR58 device product:phone model:Pixel_8 transport_id:1\nemulator-5554 device product:sdk model:sdk_gphone64_arm64\nABC unauthorized usb:1-1\nXYZ offline\n",
    ),
    [
      { serial: "R58", state: "device", model: "Pixel 8", emulator: false },
      {
        serial: "emulator-5554",
        state: "device",
        model: "sdk gphone64 arm64",
        emulator: true,
      },
      { serial: "ABC", state: "unauthorized", model: "", emulator: false },
      { serial: "XYZ", state: "offline", model: "", emulator: false },
    ],
  );
});

test("parses null-delimited paths and identifies directories including unusual names", () => {
  const all = Buffer.from("/sdcard/a b\0/sdcard/f\nile\0/sdcard/folder\0");
  const dirs = Buffer.from("/sdcard/folder\0");
  assert.deepEqual(parseEntries(all, dirs), [
    { name: "folder", path: "/sdcard/folder", isDirectory: true },
    { name: "a b", path: "/sdcard/a b", isDirectory: false },
    { name: "f\nile", path: "/sdcard/f\nile", isDirectory: false },
  ]);
});

test("quotes remote shell paths and joins paths safely", () => {
  assert.equal(shellQuote("/sdcard/a'b $c"), "'/sdcard/a'\\''b $c'");
  assert.equal(remoteJoin("/sdcard/", "hello.txt"), "/sdcard/hello.txt");
});

test("lists a storage path that is a symbolic link", async () => {
  const fs = require("node:fs/promises");
  const os = require("node:os");
  const path = require("node:path");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "droiddrop-test-"));
  const oldAdbPath = process.env.ADB_PATH;
  const oldPath = process.env.PATH;
  try {
    await fs.mkdir(path.join(root, "storage"));
    await fs.writeFile(path.join(root, "storage", "hello.txt"), "hello");
    await fs.symlink(path.join(root, "storage"), path.join(root, "sdcard"));
    const fakeAdb = path.join(root, "adb");
    await fs.writeFile(fakeAdb, '#!/bin/sh\nshift 3\nexec sh -c "$1"\n', {
      mode: 0o755,
    });
    await fs.writeFile(
      path.join(root, "stat"),
      '#!/bin/sh\nprintf "1600000000\\n"\n',
      { mode: 0o755 },
    );
    process.env.ADB_PATH = fakeAdb;
    process.env.PATH = `${root}:${oldPath}`;
    const entries = await listFiles("emulator-5554", path.join(root, "sdcard"));
    assert.equal(entries.length, 1);
    assert.equal(entries[0].name, "hello.txt");
    assert.equal(entries[0].modifiedAt, 1600000000);
  } finally {
    if (oldAdbPath === undefined) delete process.env.ADB_PATH;
    else process.env.ADB_PATH = oldAdbPath;
    process.env.PATH = oldPath;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("creates and deletes a device folder with shell-sensitive characters", async () => {
  const fs = require("node:fs/promises");
  const os = require("node:os");
  const path = require("node:path");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "droiddrop-actions-"));
  const oldAdbPath = process.env.ADB_PATH;
  try {
    const fakeAdb = path.join(root, "adb");
    await fs.writeFile(fakeAdb, '#!/bin/sh\nshift 3\nexec sh -c "$1"\n', {
      mode: 0o755,
    });
    process.env.ADB_PATH = fakeAdb;
    const name = "family's $files";
    const target = path.join(root, name);
    await createDirectory("device", root, name);
    assert.equal((await fs.stat(target)).isDirectory(), true);
    await fs.writeFile(path.join(target, "child"), "contents");
    await removeEntry("device", root, name);
    await assert.rejects(fs.access(target), { code: "ENOENT" });
    await assert.rejects(
      createDirectory("device", root, "../bad"),
      /文件夹名称/,
    );
    await assert.rejects(removeEntry("device", root, ".."), /名称/);
  } finally {
    if (oldAdbPath === undefined) delete process.env.ADB_PATH;
    else process.env.ADB_PATH = oldAdbPath;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("reads modification times and handles missing timestamps", () => {
  const times = parseTimes(
    Buffer.from(
      [
        "/sdcard/a\nfile",
        "1600000000",
        "/sdcard/b",
        "",
        "/sdcard/c",
        "%Y",
        "",
      ].join("\0"),
    ),
  );
  assert.deepEqual(times.get("/sdcard/a\nfile"), { modifiedAt: 1600000000 });
  assert.deepEqual(times.get("/sdcard/b"), { modifiedAt: null });
  assert.deepEqual(times.get("/sdcard/c"), { modifiedAt: null });
});

test("renames files and folders safely and refuses to overwrite existing names", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "droiddrop-rename-"));
  const oldAdbPath = process.env.ADB_PATH;
  const oldPath = process.env.PATH;
  try {
    const fakeAdb = path.join(root, "adb");
    await fs.writeFile(fakeAdb, '#!/bin/sh\nshift 3\nexec sh -c "$1"\n', {
      mode: 0o755,
    });
    await fs.writeFile(
      path.join(root, "mv"),
      '#!/bin/sh\nshift\nexec /bin/mv -n "$@"\n',
      { mode: 0o755 },
    );
    process.env.ADB_PATH = fakeAdb;
    process.env.PATH = `${root}:${oldPath}`;
    await fs.writeFile(path.join(root, "old.txt"), "original");
    await renameEntry("device", root, "old.txt", "new '$name.txt");
    assert.equal(
      await fs.readFile(path.join(root, "new '$name.txt"), "utf8"),
      "original",
    );
    await fs.mkdir(path.join(root, "old folder"));
    await fs.writeFile(path.join(root, "old folder", "child"), "inside");
    await renameEntry("device", root, "old folder", "new folder");
    assert.equal(
      await fs.readFile(path.join(root, "new folder", "child"), "utf8"),
      "inside",
    );
    await fs.writeFile(path.join(root, "existing"), "keep");
    await assert.rejects(
      renameEntry("device", root, "new '$name.txt", "existing"),
      /已存在/,
    );
    assert.equal(
      await fs.readFile(path.join(root, "existing"), "utf8"),
      "keep",
    );
    assert.equal(
      await fs.readFile(path.join(root, "new '$name.txt"), "utf8"),
      "original",
    );
    await assert.rejects(
      renameEntry("device", root, "existing", "../bad"),
      /名称/,
    );
    await fs.symlink(path.join(root, "missing"), path.join(root, "dangling"));
    await assert.rejects(
      renameEntry("device", root, "existing", "dangling"),
      /已存在/,
    );
  } finally {
    if (oldAdbPath === undefined) delete process.env.ADB_PATH;
    else process.env.ADB_PATH = oldAdbPath;
    process.env.PATH = oldPath;
    await fs.rm(root, { recursive: true, force: true });
  }
});
