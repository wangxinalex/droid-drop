export interface Device {
  serial: string;
  state: string;
  model: string;
  emulator: boolean;
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  modifiedAt: number | null;
}

export interface EntryInfo {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface ConfirmationRequest {
  id: string;
  action: "delete" | "replace";
  message: string;
  detail: string;
}

export interface DroidDropAPI {
  onConfirmation(callback: (request: ConfirmationRequest) => void): void;
  respondConfirmation(id: string, confirmed: boolean): void;
  devices(): Promise<Device[]>;
  files(serial: string, dir: string): Promise<FileEntry[]>;
  createDirectory(serial: string, dir: string, name: string): Promise<void>;
  renameEntry(
    serial: string,
    dir: string,
    oldName: string,
    newName: string,
  ): Promise<void>;
  removeEntry(
    serial: string,
    dir: string,
    entry: EntryInfo,
  ): Promise<{ canceled: boolean }>;
  push(
    serial: string,
    dir: string,
  ): Promise<{ canceled?: boolean; completed?: number }>;
  pull(
    serial: string,
    entry: EntryInfo,
  ): Promise<{ canceled?: boolean; destination?: string }>;
  showInFolder(file: string): Promise<void>;
}
