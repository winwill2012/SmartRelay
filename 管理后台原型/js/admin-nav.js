/**
 * 管理后台：移动端侧栏抽屉开关、遮罩关闭、大屏移除 open 状态
 */
(function () {
  var sidebar = document.getElementById("admin-sidebar");
  var overlay = document.getElementById("admin-overlay");
  var toggle = document.getElementById("admin-drawer-toggle");

  function openDrawer() {
    if (!sidebar || !overlay) return;
    sidebar.classList.add("is-open");
    overlay.classList.add("is-visible");
    document.body.style.overflow = "hidden";
  }

  function closeDrawer() {
    if (!sidebar || !overlay) return;
    sidebar.classList.remove("is-open");
    overlay.classList.remove("is-visible");
    document.body.style.overflow = "";
  }

  if (toggle) {
    toggle.addEventListener("click", function () {
      if (sidebar && sidebar.classList.contains("is-open")) closeDrawer();
      else openDrawer();
    });
  }

  if (overlay) {
    overlay.addEventListener("click", closeDrawer);
  }

  window.addEventListener("resize", function () {
    if (window.matchMedia("(min-width: 1024px)").matches) closeDrawer();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (sidebar && sidebar.classList.contains("is-open")) closeDrawer();
  });
})();

/**
 * 桌面端：侧栏收起 / 展开（localStorage 记忆）
 */
(function () {
  var layout = document.querySelector(".admin-layout");
  var pin = document.getElementById("admin-sidebar-toggle");
  var key = "smartrelay-admin-sidebar-collapsed";
  if (!layout || !pin) return;

  function mqDesktop() {
    return window.matchMedia("(min-width: 1024px)").matches;
  }

  function setCollapsed(collapsed) {
    layout.classList.toggle("admin-layout--sidebar-collapsed", collapsed);
    pin.setAttribute("aria-label", collapsed ? "展开菜单" : "收起菜单");
    pin.setAttribute("aria-expanded", collapsed ? "false" : "true");
    try {
      if (mqDesktop()) localStorage.setItem(key, collapsed ? "1" : "0");
    } catch (e) {}
  }

  try {
    if (mqDesktop() && localStorage.getItem(key) === "1") setCollapsed(true);
  } catch (e) {}

  pin.addEventListener("click", function () {
    if (!mqDesktop()) return;
    setCollapsed(!layout.classList.contains("admin-layout--sidebar-collapsed"));
  });

  window.addEventListener("resize", function () {
    if (!mqDesktop()) layout.classList.remove("admin-layout--sidebar-collapsed");
  });
})();

/**
 * 顶栏：用户名下拉（修改密码、退出登录）
 */
(function () {
  var menu = document.querySelector(".admin-user-menu");
  var trigger = document.getElementById("admin-user-trigger");
  var panel = document.getElementById("admin-user-dropdown");
  if (!menu || !trigger || !panel) return;

  function openMenu() {
    menu.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
  }

  function closeMenu() {
    menu.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
  }

  function toggleMenu() {
    if (menu.classList.contains("is-open")) closeMenu();
    else openMenu();
  }

  trigger.addEventListener("click", function (e) {
    e.stopPropagation();
    toggleMenu();
  });

  menu.addEventListener("click", function (e) {
    e.stopPropagation();
  });

  document.addEventListener("click", function () {
    closeMenu();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && menu.classList.contains("is-open")) {
      closeMenu();
      trigger.focus();
    }
  });
})();
