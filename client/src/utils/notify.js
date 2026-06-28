/**
 * 统一通知工具 — 当前回退为 alert()
 */
export function notify(message, options = {}) {
  const { type = "info", duration = 3000 } = options;
  if (type === "error") {
    console.error("[Notify]", message);
  } else if (type === "success") {
    console.log("[Notify]", message);
  } else {
    console.info("[Notify]", message);
  }
  window.alert(message);
}
