import * as fs from "node:fs/promises";
import * as path from "node:path";

export async function saveScreenshot(
  image: Buffer,
  directory: string,
  capturedAt = new Date(),
): Promise<string> {
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = [
    capturedAt.getFullYear(),
    pad(capturedAt.getMonth() + 1),
    pad(capturedAt.getDate()),
  ].join("-");
  const time = [
    capturedAt.getHours(),
    capturedAt.getMinutes(),
    capturedAt.getSeconds(),
  ]
    .map(pad)
    .join("-");
  const timestamp = `${date}-${time}`;

  for (let suffix = 0; ; suffix++) {
    const name = `DroidDrop-${timestamp}${suffix ? `-${suffix}` : ""}.png`;
    const destination = path.join(directory, name);
    let file;
    try {
      file = await fs.open(destination, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw error;
    }
    try {
      await file.writeFile(image);
      await file.close();
      return destination;
    } catch (error) {
      await file.close().catch(() => {});
      await fs.unlink(destination).catch(() => {});
      throw error;
    }
  }
}
