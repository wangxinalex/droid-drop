# DroidDrop

Mac 上的 Android 文件传输工具。通过 ADB 显示连接的真机和模拟器，浏览设备存储，发送文件或将文件和文件夹保存到 Mac。

## 运行

需要 macOS、Node.js 及 [Android SDK Platform Tools](https://developer.android.com/tools/releases/platform-tools)。在手机上开启开发者选项和 USB 调试，并在连接后允许调试；模拟器启动后会自动显示。

```sh
npm install
npm start
```

DroidDrop 会优先查找 `ADB_PATH`、`ANDROID_HOME` 或 `ANDROID_SDK_ROOT`，然后查找 `~/Library/Android/sdk/platform-tools/adb` 和 `PATH` 中的 `adb`。如使用非标准位置，可运行：

```sh
ADB_PATH=/path/to/adb npm start
```

选择左侧设备，默认打开 `/sdcard`。点击文件夹进入，点击文件或右侧下载按钮保存到 Mac；使用“发送文件到设备”选择一个或多个 Mac 文件。文件列表显示修改时间，点击名称或修改时间列标题可升序或降序排序，文件夹始终排在文件前。可以新建文件夹、重命名或删除文件和文件夹；重命名时不会覆盖同名目标，删除前需要确认，且删除不可恢复。发送时若目标文件已存在，会先询问是否替换；下载文件夹时如目标已存在，请选择其他保存位置。

## 打包

```sh
npm run dist
```

打包后的应用仍需要本机安装 adb。未签名的本地构建首次打开时可能需要在 macOS 隐私与安全设置中允许打开。

## 开发

应用源码和测试使用 TypeScript，`npm run build` 会先进行严格类型检查，再将 Electron 主进程与界面代码编译到 `build/`。`npm run format` 可统一格式化源码。

### 源码导览

- `src/main.ts`：启动 Electron 窗口并注册进程间通信。
- `src/ipc.ts`：接收界面请求，处理文件选择、确认和传输。
- `src/preload.ts` 与 `src/shared/types.ts`：定义界面可以调用的接口及共享数据类型。
- `src/adb.ts`：查找并调用 adb，读取设备和文件，执行设备端文件操作。
- `src/renderer.ts`：维护界面状态，响应设备选择、导航和文件操作。
- `src/file-list.ts`、`src/sort.ts`、`src/confirmation-dialog.ts`：分别负责文件列表显示、排序和确认弹窗。
- `src/index.html` 与 `src/style.css`：界面结构和样式；`test/` 包含自动测试。

例如，发送文件时，`renderer.ts` 调用 `preload.ts` 暴露的接口，`ipc.ts` 处理文件选择和覆盖确认，最后由 `adb.ts` 调用 adb。界面不直接访问 Node.js 或设备。

## 检查

```sh
npm test
```
