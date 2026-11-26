# DroidDrop：从 Figma 设计到代码

这个练习以「未连接设备」空状态为例，演示 Figma → MCP → Electron 的完整过程。它修改的是应用中的一块界面，而不是整个应用。

## 1. 打开设计

打开 [完整窗口设计](https://www.figma.com/design/8XouzGPqCMOl687HrGtHOK?node-id=3-2)，在左侧图层面板展开 `02 / 完整窗口 — 未连接`，可以看到侧栏、标题、中央内容和底部状态。画布上还保留了 [空状态局部设计](https://www.figma.com/design/8XouzGPqCMOl687HrGtHOK?node-id=1-2)，方便单独查看细节。完整窗口用于理解整体层级，局部 Frame 用于设计和实现具体区域。

展开 `01 / 未连接设备`：

- 最外层 Frame 是设计画布：780 × 560，浅绿色背景，圆角 16。
- `空状态内容 / Auto layout` 把图示、标题、说明和按钮纵向排列，间距 18。
- `连接图示` 是 96 × 96 的圆角方块；其中的箭头是单独的文字图层。
- 标题、说明和按钮文字都是可编辑的文字图层；按钮本身是一个 Auto Layout Frame。

选中任一图层，查看右侧的尺寸、填充、圆角和文字设置。选中内容容器，尝试调整 Auto Layout 的间距，观察子元素如何一起移动。可用撤销恢复，避免改变本练习基准。

设计文字使用 Noto Sans SC，以保证 Figma 中中文正常显示；应用沿用系统字体，因此字形可能略有不同。设计是固定尺寸的参考，应用会根据窗口尺寸伸缩。

## 2. 从设计获取上下文

在 Codex 中连接 Figma 后，可以选中 Frame 并复制包含 `node-id` 的链接，然后输入：

> 读取这个 Figma 节点的设计上下文，说明它的布局、颜色和文字，并将它适配到 DroidDrop 现有的空状态界面。保留现有设备查找行为。

本例中的局部 Frame 节点是 `1:2`，完整窗口节点是 `3:2`。本次实现读取的是局部 Frame：MCP 返回了参考代码、节点信息和截图；参考代码采用 React 和 Tailwind，而本项目是 Electron + 原生 HTML/CSS/TypeScript，因此需要转换，不能直接粘贴。

## 3. 设计如何对应代码

| Figma | 项目代码 | 说明 |
| --- | --- | --- |
| 外层 Frame | `src/style.css` 的 `.empty` | 背景、圆角，以及随可用空间伸缩的容器 |
| 垂直 Auto Layout | `.empty` 的 `flex-direction: column` 和 `gap: 18px` | 代码用 Flexbox 实现排列关系 |
| 连接图示 | `src/index.html` 的 `.empty-art` 和对应 CSS | 96 × 96、圆角 30、背景及箭头颜色 |
| 标题与说明 | `.empty h2`、`.empty p` | 对应文案、字号、颜色和行高 |
| 查找设备按钮 | `#empty-refresh` 和 `.empty .button.primary` | 对应按钮样式；原有 ID 保持不变 |

按钮的行为仍由 `src/renderer.ts` 中对 `empty-refresh` 的监听器调用 `refreshDevices(false, true)`。UI 通过 preload 暴露的接口访问设备，设计转换没有改变 ADB 或 IPC 逻辑。

## 4. 运行和验证

```sh
npm install
npm test
npm start
```

在没有连接设备时，对照 Figma 检查图示、文案、按钮和间距。点击「查找并打开设备」，检查刷新行为；如果没有可用设备，应用会显示提示。连接已授权的 Android 设备后，再确认可以打开设备文件。也可将窗口缩小到最小尺寸，检查内容没有被裁切。

## 5. 继续练习

1. 在 Figma 中把空状态内容容器的间距从 18 改为 24。
2. 复制该 Frame 的节点链接，请 Codex 重新读取设计上下文并同步对应 CSS。
3. 再修改按钮文字或颜色，让 Codex 解释 Figma 属性和代码变更的对应关系。
4. 运行 `npm test`，启动应用并人工对照；自动测试无法替代视觉检查和真实设备验证。

Figma 与代码不会自动双向同步：每次修改设计后，都需要重新读取、实现和验证。设计文件中的字体与本机系统字体也可能产生少量视觉差异。
