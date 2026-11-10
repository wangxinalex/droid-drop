import type { DroidDropAPI } from "./shared/types.js";

export function listenForConfirmations(api: DroidDropAPI): void {
  const confirmDialog =
    document.querySelector<HTMLDialogElement>("#confirm-dialog")!;
  const confirmButton =
    document.querySelector<HTMLButtonElement>("#confirm-action")!;
  const confirmTitle = document.getElementById("confirm-title")!;
  const confirmDetail = document.getElementById("confirm-detail")!;
  api.onConfirmation((request) => {
    confirmTitle.textContent = request.message;
    confirmDetail.textContent = request.detail;
    confirmButton.textContent = request.action === "delete" ? "删除" : "替换";
    confirmButton.className = `button ${request.action === "delete" ? "danger" : "confirm"}`;
    // 关闭对话框（包括 Esc）一律视为取消，只有明确点击确认才继续。
    confirmDialog.returnValue = "cancel";
    confirmDialog.addEventListener(
      "close",
      () => {
        api.respondConfirmation(
          request.id,
          confirmDialog.returnValue === "confirm",
        );
      },
      { once: true },
    );
    confirmDialog.showModal();
  });
}
