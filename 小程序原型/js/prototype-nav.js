/**
 * 开关滑块：由 [aria-pressed] 与 .demo-switch-track 样式控制
 */
document.querySelectorAll("[data-demo-switch]").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const on = btn.getAttribute("aria-pressed") === "true";
    btn.setAttribute("aria-pressed", String(!on));
  });
});
