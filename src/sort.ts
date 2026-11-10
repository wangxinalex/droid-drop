import type { FileEntry } from "./shared/types.js";

export type SortKey = "name" | "modifiedAt";
export type SortDirection = "asc" | "desc";

export function sortEntries<
  T extends Pick<FileEntry, "name" | "modifiedAt"> & { isDirectory?: boolean },
>(entries: T[], key: SortKey, direction: SortDirection): T[] {
  const sign = direction === "desc" ? -1 : 1;
  return [...entries].sort((a, b) => {
    // 先固定文件夹与文件的分组，再按用户选择的方向排列组内内容。
    const folderOrder =
      Number(Boolean(b.isDirectory)) - Number(Boolean(a.isDirectory));
    if (folderOrder) return folderOrder;
    if (key === "name")
      return (
        sign *
        a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: "base",
        })
      );
    // 未知时间始终放在各自分组末尾，不随升降序翻转。
    if (a.modifiedAt == null || b.modifiedAt == null)
      return (
        Number(a.modifiedAt == null) - Number(b.modifiedAt == null) ||
        a.name.localeCompare(b.name)
      );
    return sign * (a.modifiedAt - b.modifiedAt) || a.name.localeCompare(b.name);
  });
}
