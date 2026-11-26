import * as fs from "node:fs/promises";
import * as path from "node:path";

export class ScreenshotStore {
  private readonly captures = new Map<number, Buffer>();

  set(contentsId: number, image: Buffer): void {
    this.captures.set(contentsId, image);
  }

  clear(contentsId: number): void {
    this.captures.delete(contentsId);
  }

  async save(contentsId: number, destination: string): Promise<void> {
    const image = this.captures.get(contentsId);
    if (!image) throw new Error("没有可保存的截屏，请重新截屏。");
    // 在同一目录写完临时文件后再替换，写入失败时保留原文件。
    const tempDir = await fs.mkdtemp(
      path.join(path.dirname(destination), ".droiddrop-"),
    );
    try {
      const tempFile = path.join(tempDir, "screenshot.png");
      await fs.writeFile(tempFile, image);
      await fs.rename(tempFile, destination);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
}
