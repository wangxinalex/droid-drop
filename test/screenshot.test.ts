import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { captureScreenshot } from "../src/adb";
import { saveScreenshot } from "../src/screenshot";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a3sAAAAASUVORK5CYII=",
  "base64",
);

test("saves captures directly with unique filenames without overwriting", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "droiddrop-direct-"));
  try {
    const time = new Date(2026, 10, 26, 22, 32, 10, 123);
    const first = await saveScreenshot(png, root, time);
    const second = await saveScreenshot(png, root, time);
    assert.notEqual(first, second);
    assert.equal(path.dirname(first), root);
    assert.equal(path.basename(first), "DroidDrop-2026-11-26-22-32-10.png");
    assert.equal(path.basename(second), "DroidDrop-2026-11-26-22-32-10-1.png");
    assert.deepEqual(await fs.readFile(first), png);
    assert.deepEqual(await fs.readFile(second), png);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

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

test("reports save failures without changing existing screenshots", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "droiddrop-save-fail-"));
  try {
    const existing = path.join(root, "existing.png");
    await fs.writeFile(existing, "original");
    await assert.rejects(saveScreenshot(png, path.join(root, "missing")));
    assert.equal(await fs.readFile(existing, "utf8"), "original");
    assert.deepEqual(await fs.readdir(root), ["existing.png"]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
