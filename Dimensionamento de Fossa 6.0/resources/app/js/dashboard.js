(function(){
  "use strict";

  const byId = id => document.getElementById(id);
  const tabList = document.querySelector(".tabnav");
  const tabs = [...tabList.querySelectorAll('[role="tab"]')];
  const toggle = byId("dashboardToggle");
  const narrow = window.matchMedia("(max-width:1100px)");
  const horizontal = window.matchMedia("(max-width:760px)");
  const preference = "dre-dashboard-sidebar";
  let saved;
  try { saved = localStorage.getItem(preference); } catch {}
  let choice = saved === "compact" || saved === "expanded" ? saved : null;

  function syncSidebar(){
    const compact = choice ? choice === "compact" : narrow.matches;
    document.body.dataset.sidebar = compact ? "compact" : "expanded";
    toggle.setAttribute("aria-expanded", String(!compact));
    toggle.setAttribute("aria-label", compact ? "Expandir navegação" : "Recolher navegação");
    tabList.setAttribute("aria-orientation", horizontal.matches ? "horizontal" : "vertical");
  }
  toggle.addEventListener("click", () => {
    choice = document.body.dataset.sidebar === "compact" ? "expanded" : "compact";
    try { localStorage.setItem(preference,choice); } catch {}
    syncSidebar();
  });
  narrow.addEventListener("change",syncSidebar);
  horizontal.addEventListener("change",syncSidebar);
  syncSidebar();

  tabList.addEventListener("keydown", event => {
    const current = tabs.indexOf(event.target);
    if (current < 0) return;
    const previous = horizontal.matches ? "ArrowLeft" : "ArrowUp";
    const next = horizontal.matches ? "ArrowRight" : "ArrowDown";
    let index;
    if (event.key === previous) index = (current+tabs.length-1)%tabs.length;
    else if (event.key === next) index = (current+1)%tabs.length;
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = tabs.length-1;
    else return;
    event.preventDefault();
    tabs[index].click();
    tabs[index].focus({preventScroll:true});
  });

  const dialog = byId("dashboardCommand");
  const query = byId("dashboardCommandQuery");
  const results = byId("dashboardCommandItems");
  const empty = byId("dashboardCommandEmpty");
  const search = byId("dashboardSearch");
  const commands = tabs.map(tab => [tab.getAttribute("aria-label"),tab.id]).concat([
    ["Criar projeto","newProjectBtn"],
    ["Abrir projeto","openProjBtn"],
    ["Salvar projeto","saveProjBtn"],
    ["Exportar quantitativos CSV","exportCsvBtn"],
    ["Pré-visualizar memorial","previewBtn"],
    ["Gerar memorial PDF","printBtn"],
    ["Alternar tema","themeToggle"]
  ]);
  const normalize = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();

  function renderCommands(){
    const term = normalize(query.value);
    const buttons = commands.filter(([name,id]) => !byId(id).disabled && normalize(name).includes(term))
      .map(([name,id]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "dashboard-command-item";
        button.textContent = name;
        button.addEventListener("click", () => {
          dialog.close();
          byId(id).click();
        });
        return button;
      });
    results.replaceChildren(...buttons);
    empty.hidden = buttons.length > 0;
  }

  function openCommand(){
    if (dialog.open || document.querySelector("#previewOverlay.open,#confirmOverlay.open")) return;
    query.value = "";
    renderCommands();
    dialog.showModal();
    query.focus();
  }
  search.addEventListener("click",openCommand);
  byId("dashboardCommandClose").addEventListener("click",() => dialog.close());
  dialog.addEventListener("click",event => { if (event.target === dialog) dialog.close(); });
  query.addEventListener("input",renderCommands);
  dialog.addEventListener("keydown",event => {
    const buttons = [...results.children];
    const index = buttons.indexOf(document.activeElement);
    if (event.key === "Escape"){
      event.preventDefault();
      event.stopPropagation();
      dialog.close();
    } else if (event.key === "ArrowDown" && buttons.length){
      event.preventDefault();
      buttons[(index+1)%buttons.length].focus();
    } else if (event.key === "ArrowUp" && index >= 0){
      event.preventDefault();
      (buttons[index-1] || query).focus();
    } else if (event.key === "Enter" && document.activeElement === query && buttons.length){
      event.preventDefault();
      buttons[0].click();
    }
  });
  document.addEventListener("keydown",event => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return;
    event.preventDefault();
    openCommand();
  });

  window.DREDashboard = {
    showSection(name){
      const title = byId("tabBtn"+name).getAttribute("aria-label");
      byId("dashboardPageTitle").textContent = title;
      byId("dashboardBreadcrumb").textContent = title;
    }
  };
})();
