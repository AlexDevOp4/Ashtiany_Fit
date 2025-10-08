(function () {
  const btn = document.getElementById("nav-toggle");
  const menu = document.getElementById("mobile-menu");
  const openI = document.getElementById("icon-open");
  const closeI = document.getElementById("icon-close");
  if (!btn || !menu) return;
  btn.addEventListener("click", () => {
    const expanded = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", String(!expanded));
    menu.classList.toggle("hidden", expanded);
    openI.classList.toggle("hidden", !expanded);
    closeI.classList.toggle("hidden", expanded);
  });
})();
