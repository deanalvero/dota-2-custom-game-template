import { renderForm }              from './formRenderer.js';
import { generateLua, generateKV } from './generators.js';

const state = {
  AbilityBehavior:       [],
  AbilityUnitTargetType: [],
  AbilityValues:         [],
  _kvDisabled:           new Set(),
  Lua: { OnSpellStart: { actions: [] } },
};

const [schema, snippetsJson, soundsJson, labels] = await Promise.all([
  fetch('./data/ability_schema.json').then(r => r.json()),
  fetch('./data/lua_snippets.json').then(r   => r.json()),
  fetch('./data/sounds.json').then(r         => r.json()),
  fetch('./data/option_labels.json').then(r  => r.json()),
]);

const flatSounds = soundsJson.flatMap(s => s.sounds.map(name => ({ name, file: s.soundfile })));

initTheme();
await renderForm(schema, document.getElementById("form"), state, update, labels);
initSnippetSection(snippetsJson);
update();

function initTheme() {
  const saved = localStorage.getItem("theme")
    ?? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  applyTheme(saved);
  document.getElementById("themeToggle").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem("theme", next);
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const btn = document.getElementById("themeToggle");
  if (btn) btn.textContent = theme === "dark" ? "☀ Light" : "🌙 Dark";
}

function initSnippetSection(snippetsJson) {
  const container = document.getElementById("snippets");
  for (const [eventName, defs] of Object.entries(snippetsJson)) {
    const heading = document.createElement("h4");
    heading.textContent = eventName;
    container.appendChild(heading);

    const openBtn = document.createElement("button");
    openBtn.textContent = "+ Add Snippet";
    openBtn.className = "btn-add-snippet";
    openBtn.type = "button";
    openBtn.addEventListener("click", () => openSnippetDialog(eventName, defs));
    container.appendChild(openBtn);

    const listAnchor = document.createElement("div");
    listAnchor.id = `action-list-${eventName}`;
    container.appendChild(listAnchor);
  }
}

function openSnippetDialog(eventName, defs) {
  const dialog      = document.getElementById("snippetDialog");
  const eventLabel  = document.getElementById("dialogEventLabel");
  const searchInput = document.getElementById("snippetSearch");
  const snippetList = document.getElementById("snippetList");
  const detailPane  = document.getElementById("snippetDetail");
  const addBtn      = document.getElementById("dialogAdd");

  eventLabel.textContent = eventName;
  searchInput.value = "";
  detailPane.innerHTML = '<div class="dialog-placeholder">← Select a snippet</div>';
  addBtn.disabled = true;

  let selectedDef = null;
  let paramValues = {};

  function renderList(filter = "") {
    snippetList.innerHTML = "";
    const q = filter.toLowerCase();
    defs
      .filter(d => !q || d.label.toLowerCase().includes(q))
      .forEach(def => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "snippet-list-item";
        if (selectedDef?.id === def.id) item.classList.add("selected");
        item.textContent = def.label;
        item.addEventListener("click", () => {
          selectedDef = def;
          paramValues = {};
          snippetList.querySelectorAll(".snippet-list-item").forEach(el => el.classList.remove("selected"));
          item.classList.add("selected");
          renderDetail(def);
          addBtn.disabled = false;
        });
        snippetList.appendChild(item);
      });
  }

  function renderDetail(def) {
    detailPane.innerHTML = "";

    const title = document.createElement("p");
    title.className = "detail-title";
    title.textContent = def.label;
    detailPane.appendChild(title);

    if (def.requires?.length) {
      const req = document.createElement("p");
      req.className = "detail-requires";
      req.textContent = `Requires: ${def.requires.join(", ")}`;
      detailPane.appendChild(req);
    }

    for (const [paramKey, paramConfig] of Object.entries(def.params ?? {})) {
      const row = document.createElement("div");
      row.className = "snippet-param";

      const lbl = document.createElement("label");
      lbl.className = "snippet-param-label";
      lbl.textContent = paramKey;
      row.appendChild(lbl);

      if (paramConfig.type === "search_select") {
        const sourceItems = paramConfig.source === "sounds.json" ? flatSounds : [];
        buildSearchSelect(row, sourceItems, resolved => Object.assign(paramValues, resolved));
      } else if (paramConfig.type === "select") {
        const sel = document.createElement("select");
        sel.className = "field-input";
        (paramConfig.options ?? []).forEach(opt => {
          const o = document.createElement("option");
          o.value = opt;
          o.textContent = labels[opt] ?? opt;
          sel.appendChild(o);
        });
        paramValues[paramKey] = sel.value;
        sel.addEventListener("change", () => { paramValues[paramKey] = sel.value; });
        row.appendChild(sel);
      } else {
        const input = document.createElement("input");
        input.type = "text";
        input.className = "field-input";
        input.addEventListener("input", () => { paramValues[paramKey] = input.value; });
        row.appendChild(input);
      }

      detailPane.appendChild(row);
    }
  }

  const onSearch = () => renderList(searchInput.value);
  searchInput.addEventListener("input", onSearch);

  const onAdd = () => {
    if (!selectedDef) return;
    const missing = Object.keys(selectedDef.params ?? {}).filter(k => !paramValues[k]);
    if (missing.length) { alert(`Please fill in: ${missing.join(", ")}`); return; }
    state.Lua[eventName] ??= { actions: [] };
    state.Lua[eventName].actions.push({ type: selectedDef.id, params: { ...paramValues } });
    dialog.close();
    refreshActionList(eventName);
    update();
  };

  addBtn.addEventListener("click", onAdd);
  document.getElementById("dialogClose").addEventListener("click",  () => dialog.close());
  document.getElementById("dialogCancel").addEventListener("click", () => dialog.close());

  const onBackdropClick = e => { if (e.target === dialog) dialog.close(); };
  dialog.addEventListener("click", onBackdropClick);

  dialog.addEventListener("close", () => {
    searchInput.removeEventListener("input", onSearch);
    addBtn.removeEventListener("click", onAdd);
    dialog.removeEventListener("click", onBackdropClick);
  }, { once: true });

  renderList();
  dialog.showModal();
  searchInput.focus();
}

function buildSearchSelect(container, items, onSelect) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "field-input";
  input.placeholder = "Search…";

  const dropdown = document.createElement("div");
  dropdown.className = "dropdown";

  input.addEventListener("input", () => {
    const q = input.value.toLowerCase().trim();
    dropdown.innerHTML = "";
    if (!q) return;
    items
      .filter(item => item.name.toLowerCase().includes(q))
      .slice(0, 20)
      .forEach(item => {
        const opt = document.createElement("div");
        opt.textContent = item.name;
        opt.addEventListener("click", () => {
          input.value = item.name;
          dropdown.innerHTML = "";
          onSelect({ sound: item.name, soundfile: item.file });
        });
        dropdown.appendChild(opt);
      });
  });

  container.append(input, dropdown);
}

function refreshActionList(eventName) {
  const anchor  = document.getElementById(`action-list-${eventName}`);
  anchor.innerHTML = "";
  const actions = state.Lua[eventName]?.actions ?? [];
  if (!actions.length) return;

  const ul = document.createElement("ul");
  ul.className = "action-list";

  const rebuild = () => refreshActionList(eventName);

  actions.forEach((action, i) => {
    const li = document.createElement("li");
    li.className = "draggable-item";

    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.textContent = "⠿";
    handle.setAttribute("aria-hidden", "true");

    const summary = document.createElement("span");
    summary.className = "action-summary";
    summary.textContent = `${action.type}(${
      Object.entries(action.params)
        .filter(([k]) => k !== "soundfile")
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")
    })`;

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "✕";
    removeBtn.className = "btn-remove";
    removeBtn.type = "button";
    removeBtn.addEventListener("click", () => {
      state.Lua[eventName].actions.splice(i, 1);
      rebuild();
      update();
    });

    li.append(handle, summary, removeBtn);
    ul.appendChild(li);
  });

  attachDragReorder(ul, state.Lua[eventName].actions, () => { rebuild(); update(); });
  anchor.appendChild(ul);
}

function attachDragReorder(listEl, dataArray, onReorder) {
  let dragSrcIndex = null;

  listEl.querySelectorAll(".draggable-item").forEach((item, index) => {
    const handle = item.querySelector(".drag-handle");

    handle.setAttribute("draggable", "true");

    handle.addEventListener("dragstart", e => {
      dragSrcIndex = index;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
      requestAnimationFrame(() => item.classList.add("dragging"));
    });

    handle.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      listEl.querySelectorAll(".draggable-item").forEach(el => el.classList.remove("drag-over"));
    });

    item.addEventListener("dragover", e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      listEl.querySelectorAll(".draggable-item").forEach(el => el.classList.remove("drag-over"));
      if (index !== dragSrcIndex) item.classList.add("drag-over");
    });

    item.addEventListener("dragleave", () => item.classList.remove("drag-over"));

    item.addEventListener("drop", e => {
      e.preventDefault();
      item.classList.remove("drag-over");
      if (dragSrcIndex === null || dragSrcIndex === index) return;
      const [moved] = dataArray.splice(dragSrcIndex, 1);
      dataArray.splice(index, 0, moved);
      dragSrcIndex = null;
      onReorder();
    });
  });
}

function update() {
  document.getElementById("luaPreview").textContent = generateLua(state, snippetsJson);
  document.getElementById("kvPreview").textContent  = generateKV(state);
}

document.getElementById("downloadLua").addEventListener("click", () => {
  download(`${state.AbilityName || "ability"}.lua`, generateLua(state, snippetsJson));
});
document.getElementById("downloadKV").addEventListener("click", () => {
  download("npc_abilities_custom.txt", generateKV(state));
});

function download(filename, content) {
  const blob = new Blob([content], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
