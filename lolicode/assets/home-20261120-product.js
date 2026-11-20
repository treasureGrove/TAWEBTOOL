const install = document.querySelector("[data-terminal-install]");
const tabList = install?.querySelector("[role=tablist]");
const tabs = [...(tabList?.querySelectorAll("[role=tab]") ?? [])];
const panels = tabs.map((tab) =>
  document.getElementById(tab.getAttribute("aria-controls")),
);

if (tabs.length && panels.every(Boolean)) {
  const status = install.querySelector("[data-install-status]");
  let statusTimer;

  function select(index) {
    tabs.forEach((tab, tabIndex) => {
      const selected = tabIndex === index;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[tabIndex].hidden = !selected;
    });
    status.textContent = "";
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => select(index));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
        return;
      event.preventDefault();
      let next = index;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (event.key === "ArrowLeft")
        next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      select(next);
      tabs[next].focus();
    });
  });

  for (const panel of panels) {
    const code = panel.querySelector("code");
    const copy = panel.querySelector("[data-copy-install]");
    if (!code || !copy) continue;
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(code.textContent.trim());
        status.textContent = "已复制安装命令";
      } catch {
        status.textContent = "可选中命令文本后复制";
      }
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => {
        status.textContent = "";
      }, 3500);
    });
    copy.hidden = false;
  }

  const isLinux =
    /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent);
  select(isLinux ? 1 : 0);
  install.setAttribute("data-enhanced", "");
  tabList.hidden = false;
}
