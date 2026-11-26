import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { captureScreenshot } from "../src/adb";
import { ScreenshotStore } from "../src/screenshot";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a3sAAAAASUVORK5CYII=",
  "base64",
);

test("captures binary PNG from the selected device without altering bytes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "droiddrop-screen-"));
  const old = process.env.ADB_PATH;
  try {
    const fakeAdb = path.join(root, "adb");
    const payload = path.join(root, "screen.png");
    await fs.writeFile(payload, png);
    await fs.writeFile(
      fakeAdb,
      `#!/bin/sh\n[ "$1" = "-s" ] && [ "$2" = "device-123" ] && [ "$3" = "exec-out" ] && [ "$4" = "screencap" ] && [ "$5" = "-p" ] || exit 2\ncat '${payload}'\n`,
      { mode: 0o755 },
    );
    process.env.ADB_PATH = fakeAdb;
    assert.deepEqual(await captureScreenshot("device-123"), png);
    await fs.writeFile(payload, "not a PNG");
    await assert.rejects(captureScreenshot("device-123"), /截屏.*(无效|失败)/);
  } finally {
    if (old === undefined) delete process.env.ADB_PATH;
    else process.env.ADB_PATH = old;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("stores each window's latest capture and saves its exact bytes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "droiddrop-save-"));
  try {
    const store = new ScreenshotStore();
    store.set(1, png);
    const newer = Buffer.concat([png, Buffer.from([1, 2, 3])]);
    store.set(2, newer);
    const output = path.join(root, "screenshot.png");
    await store.save(1, output);
    assert.deepEqual(await fs.readFile(output), png);
    store.clear(1);
    await assert.rejects(store.save(1, output), /截屏/);
    await store.save(2, output);
    assert.deepEqual(await fs.readFile(output), newer);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("cancelling a screenshot aborts an unresponsive adb process", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "droiddrop-abort-"));
  const old = process.env.ADB_PATH;
  try {
    const fakeAdb = path.join(root, "adb");
    await fs.writeFile(fakeAdb, "#!/bin/sh\nexec sleep 30\n", { mode: 0o755 });
    process.env.ADB_PATH = fakeAdb;
    const controller = new AbortController();
    const capture = captureScreenshot("device", controller.signal);
    controller.abort();
    await assert.rejects(capture, /取消/);
  } finally {
    if (old === undefined) delete process.env.ADB_PATH;
    else process.env.ADB_PATH = old;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("failed save removes its temporary file and leaves the target intact", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "droiddrop-save-fail-"));
  try {
    const store = new ScreenshotStore();
    store.set(1, png);
    const target = path.join(root, "existing.png");
    await fs.mkdir(target);
    await fs.writeFile(path.join(target, "keep"), "original");
    await assert.rejects(store.save(1, target));
    assert.equal(
      await fs.readFile(path.join(target, "keep"), "utf8"),
      "original",
    );
    assert.deepEqual(await fs.readdir(root), ["existing.png"]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
