import { renderForm, showAddableField } from './formRenderer.js';
import { generateLua, generateKV }      from './generators.js';
import { generateModifierLua }          from './modifierGenerator.js';
import { validate }                     from './validator.js';

const STORAGE_KEY = "abilitymaker_state_v4";

const DEFAULT_STATE = () => ({
  AbilityBehavior: [], AbilityUnitTargetType: [], AbilityUnitTargetFlags: [],
  AbilityValues: [], _kvDisabled: new Set(), _activeFields: new Set(),
  Lua: {
    OnSpellStart:    { actions: [] },
    OnChannelFinish: { actions: [] },
    OnChannelThink:  { actions: [] },
    OnProjectileHit: { actions: [] },
    OnUpgrade:       { actions: [] },
  },
  modifier: {
    ModifierName: "modifier_my_ability", ScriptFile: "modifiers/modifier_my_ability.lua",
    IsDebuff: false, IsHidden: false, IsPurgable: true, IsStunDebuff: false, IsPermanent: false,
    GetEffectName: "", GetEffectAttachType: "PATTACH_ABSORIGIN_FOLLOW", GetTexture: "", StatusEffectName: "",
    Properties: [],
    Events: {
      OnCreated: { actions: [] }, OnRefresh: { actions: [] },
      OnDestroy: { actions: [] }, OnIntervalThink: { actions: [] },
    },
  },
});

const state = loadState();

const [schema, snippetsJson, modSnippetsJson, soundsJson, particlesTxt, labels, modifierProps] = await Promise.all([
  fetch('./data/ability_schema.json').then(r => r.json()),
  fetch('./data/lua_snippets.json').then(r => r.json()),
  fetch('./data/modifier_snippets.json').then(r => r.json()),
  fetch('./data/sounds.json').then(r => r.json()),
  fetch('./data/particles.txt').then(r => r.text()),
  fetch('./data/option_labels.json').then(r => r.json()),
  fetch('./data/modifier_properties.json').then(r => r.json()),
]);

const flatSounds    = soundsJson.flatMap(s => s.sounds.map(name => ({ name, file: s.soundfile })));
const flatParticles = particlesTxt.split('\n').map(s => s.trim()).filter(Boolean).map(p => ({ name: p }));

initTheme();
initTabs();
await initAbilityTab();
initModifierTab();
abilityUpdate();
modifierUpdate();

function initTheme() {
  const saved = localStorage.getItem("theme") ?? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  applyTheme(saved);
  document.getElementById("themeToggle").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next); localStorage.setItem("theme", next);
  });
}
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  const btn = document.getElementById("themeToggle");
  if (btn) btn.textContent = t === "dark" ? "☀ Light" : "🌙 Dark";
}

function initTabs() {
  function activateTab(tabId) {
    document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tabId));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.toggle("active", c.id === tabId));
  }

  function getTabFromUrl() {
    return new URLSearchParams(location.search).get("tab") ?? "ability";
  }

  function setTabInUrl(tabId) {
    const params = new URLSearchParams(location.search);
    params.set("tab", tabId);
    history.pushState(null, "", `?${params}`);
  }

  activateTab(getTabFromUrl());

  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      setTabInUrl(btn.dataset.tab);
      activateTab(btn.dataset.tab);
    });
  });

  window.addEventListener("popstate", () => activateTab(getTabFromUrl()));
}

async function initAbilityTab() {
  const formEl = document.getElementById("form");
  await renderForm(schema, formEl, state, abilityUpdate, labels, {
    onBehaviorEdit: openBehaviorDialog,
  });

  const addKvBtn = document.createElement("button");
  addKvBtn.textContent = "+ Add KV Parameter";
  addKvBtn.className = "btn-add-kv";
  addKvBtn.type = "button";
  addKvBtn.addEventListener("click", () => openAddKVDialog(formEl));
  formEl.appendChild(addKvBtn);

  initSnippetSection("snippets", snippetsJson, state.Lua, abilityUpdate, flatSounds, flatParticles);

  for (const eventName of Object.keys(snippetsJson)) refreshActionList(eventName, snippetsJson, state.Lua, abilityUpdate);

  document.getElementById("shareBtn").addEventListener("click", async () => {
    const url = buildShareUrl();
    try { await navigator.clipboard.writeText(url); showFeedback("shareBtn", "Link copied!"); }
    catch { prompt("Copy this link:", url); }
  });

  document.getElementById("resetBtn").addEventListener("click", () => {
    if (!confirm("Reset all data? This clears your saved ability and modifier and cannot be undone.")) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    const clean = `${location.pathname}?tab=${new URLSearchParams(location.search).get("tab") ?? "ability"}`;
    location.replace(clean);
  });
  document.getElementById("downloadLua").addEventListener("click", () => {
    const errs = validate(state).filter(i => i.level === "error");
    if (errs.length) { alert("Fix errors first:\n\n" + errs.map(i => i.message).join("\n")); return; }
    download(`${state.AbilityName || "ability"}.lua`, generateLua(state, snippetsJson));
  });
  document.getElementById("downloadKV").addEventListener("click", () => {
    const errs = validate(state).filter(i => i.level === "error");
    if (errs.length) { alert("Fix errors first:\n\n" + errs.map(i => i.message).join("\n")); return; }
    download("npc_abilities_custom.txt", generateKV(state));
  });
}

function abilityUpdate() {
  renderValidation(validate(state), "validationPanel");
  document.getElementById("luaPreview").textContent = generateLua(state, snippetsJson);
  document.getElementById("kvPreview").textContent  = generateKV(state);
  saveState();
  syncUrlHash();
}

function initModifierTab() {
  const mod = state.modifier;
  const container = document.getElementById("modifierForm");

  makeTextField(container, "Modifier Name", mod, "ModifierName", modifierUpdate);
  makeTextField(container, "Script File",   mod, "ScriptFile",   modifierUpdate);
  makeTextField(container, "Effect Particle (GetEffectName)", mod, "GetEffectName", modifierUpdate, flatParticles);
  makeSelectField(container, "Effect Attach Type", mod, "GetEffectAttachType", modifierUpdate,
    ["PATTACH_ABSORIGIN_FOLLOW","PATTACH_OVERHEAD_FOLLOW","PATTACH_POINT_FOLLOW","PATTACH_ROOTBONE_FOLLOW"], labels);
  makeTextField(container, "Icon Texture (GetTexture)", mod, "GetTexture", modifierUpdate);
  makeTextField(container, "Status Effect Name",        mod, "StatusEffectName", modifierUpdate);

  const flagsSection = document.createElement("div");
  flagsSection.className = "field";
  const flagsLabel = document.createElement("label");
  flagsLabel.className = "field-label";
  flagsLabel.textContent = "Flags";
  flagsSection.appendChild(flagsLabel);
  const flagsGroup = document.createElement("div");
  flagsGroup.className = "checkbox-group";
  [["IsDebuff","Debuff"],["IsHidden","Hidden"],["IsPurgable","Purgable"],["IsStunDebuff","Stun Debuff"],["IsPermanent","Permanent"]].forEach(([key, label]) => {
    const lbl = document.createElement("label");
    lbl.className = "checkbox-label";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!mod[key];
    cb.addEventListener("change", () => { mod[key] = cb.checked; modifierUpdate(); });
    lbl.append(cb, " " + label);
    flagsGroup.appendChild(lbl);
  });
  flagsSection.appendChild(flagsGroup);
  container.appendChild(flagsSection);

  const propSection = document.createElement("div");
  propSection.className = "field";
  const propLabel = document.createElement("label");
  propLabel.className = "field-label";
  propLabel.textContent = "Properties";
  propSection.appendChild(propLabel);
  const propList = document.createElement("div");
  propList.className = "value-list";
  propSection.appendChild(propList);
  const addPropBtn = document.createElement("button");
  addPropBtn.textContent = "+ Add Property";
  addPropBtn.className = "btn-add";
  addPropBtn.type = "button";
  addPropBtn.addEventListener("click", () => openPropertyDialog(mod.Properties, renderProps, modifierUpdate));
  propSection.appendChild(addPropBtn);
  container.appendChild(propSection);

  function renderProps() {
    propList.innerHTML = "";
    mod.Properties.forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "modifier-prop-row";
      const nameEl = document.createElement("span");
      nameEl.className = "modifier-prop-name";
      nameEl.textContent = p.label;
      const valInput = document.createElement("input");
      valInput.type = "text";
      valInput.className = "field-input modifier-prop-val";
      valInput.placeholder = "special value key e.g. slow_pct";
      valInput.value = p.specialValue ?? "";
      valInput.addEventListener("input", () => { p.specialValue = valInput.value; modifierUpdate(); });
      const removeBtn = document.createElement("button");
      removeBtn.textContent = "✕";
      removeBtn.className = "btn-remove";
      removeBtn.type = "button";
      removeBtn.addEventListener("click", () => { mod.Properties.splice(i, 1); renderProps(); modifierUpdate(); });
      row.append(nameEl, valInput, removeBtn);
      propList.appendChild(row);
    });
  }
  renderProps();

  initSnippetSection("modSnippets", modSnippetsJson, mod.Events, modifierUpdate, flatSounds, flatParticles);
  for (const ev of Object.keys(modSnippetsJson)) refreshActionList(ev, modSnippetsJson, mod.Events, modifierUpdate);

  document.getElementById("downloadModifierLua").addEventListener("click", () => {
    if (!mod.ModifierName?.trim()) { alert("Modifier Name is required."); return; }
    download(`${mod.ModifierName}.lua`, generateModifierLua(mod, modSnippetsJson));
  });
}

function modifierUpdate() {
  const mod = state.modifier;
  document.getElementById("modifierPreview").textContent  = generateModifierLua(mod, modSnippetsJson);
  document.getElementById("addonInitPreview").textContent = generateAddonInit(mod);
  saveState();
}

function generateAddonInit(mod) {
  const name   = mod.ModifierName  || "modifier_my_ability";
  const script = mod.ScriptFile    || `modifiers/${name}`;
  const path   = script.replace(/\.lua$/, "");
  return `LinkLuaModifier("${name}", "${path}", LUA_MODIFIER_MOTION_NONE)`;
}

function makeTextField(container, labelText, obj, key, onChange, searchItems = null) {
  const wrapper = document.createElement("div");
  wrapper.className = "field";
  const lbl = document.createElement("label");
  lbl.className = "field-label";
  lbl.textContent = labelText;
  wrapper.appendChild(lbl);
  const input = document.createElement("input");
  input.type = "text";
  input.className = "field-input";
  input.value = obj[key] ?? "";
  input.addEventListener("input", () => { obj[key] = input.value; onChange(); });
  wrapper.appendChild(input);
  if (searchItems) {
    const dropdown = document.createElement("div");
    dropdown.className = "dropdown";
    input.addEventListener("input", () => {
      const q = input.value.toLowerCase().trim();
      dropdown.innerHTML = "";
      if (!q) return;
      searchItems.filter(it => it.name.toLowerCase().includes(q)).slice(0, 20).forEach(it => {
        const opt = document.createElement("div");
        opt.textContent = it.name;
        opt.addEventListener("click", () => { input.value = it.name; obj[key] = it.name; dropdown.innerHTML = ""; onChange(); });
        dropdown.appendChild(opt);
      });
    });
    wrapper.appendChild(dropdown);
  }
  container.appendChild(wrapper);
}

function makeSelectField(container, labelText, obj, key, onChange, options, labels) {
  const wrapper = document.createElement("div");
  wrapper.className = "field";
  const lbl = document.createElement("label");
  lbl.className = "field-label";
  lbl.textContent = labelText;
  wrapper.appendChild(lbl);
  const sel = document.createElement("select");
  sel.className = "field-input";
  options.forEach(opt => {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = labels[opt] ?? opt;
    sel.appendChild(o);
  });
  sel.value = obj[key] ?? options[0];
  sel.addEventListener("change", () => { obj[key] = sel.value; onChange(); });
  wrapper.appendChild(sel);
  container.appendChild(wrapper);
}

function initSnippetSection(containerId, snippetsJson, luaState, onUpdate, sounds, particles) {
  const container = document.getElementById(containerId);
  for (const [eventName, defs] of Object.entries(snippetsJson)) {
    const heading = document.createElement("h4");
    heading.textContent = eventName;
    container.appendChild(heading);
    const openBtn = document.createElement("button");
    openBtn.textContent = "+ Add Snippet";
    openBtn.className = "btn-add-snippet";
    openBtn.type = "button";
    openBtn.addEventListener("click", () => openSnippetDialog(eventName, defs, luaState, onUpdate, sounds, particles));
    container.appendChild(openBtn);
    const anchor = document.createElement("div");
    anchor.id = `action-list-${eventName}`;
    container.appendChild(anchor);
  }
}

function refreshActionList(eventName, snippetsJson, luaState, onUpdate) {
  const anchor = document.getElementById(`action-list-${eventName}`);
  if (!anchor) return;
  anchor.innerHTML = "";
  const actions = luaState[eventName]?.actions ?? [];
  if (!actions.length) return;

  const allDefs = Object.values(snippetsJson).flat();
  const ul = document.createElement("ul");
  ul.className = "action-list";

  actions.forEach((action, i) => {
    const def = allDefs.find(d => d.id === action.type);
    const li = document.createElement("li");
    li.className = "draggable-item";

    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.textContent = "⠿";
    handle.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "action-label";
    label.textContent = def?.label ?? action.type;

    const editBtn = document.createElement("button");
    editBtn.textContent = "✎";
    editBtn.className = "btn-edit-action";
    editBtn.title = "Edit snippet";
    editBtn.type = "button";
    editBtn.addEventListener("click", () => {
      const defs = snippetsJson[eventName] ?? [];
      openSnippetDialog(eventName, defs, luaState, onUpdate,
        flatSounds, flatParticles, { editIndex: i, existingAction: action });
    });

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "✕";
    removeBtn.className = "btn-remove";
    removeBtn.type = "button";
    removeBtn.addEventListener("click", () => {
      luaState[eventName].actions.splice(i, 1);
      refreshActionList(eventName, snippetsJson, luaState, onUpdate);
      onUpdate();
    });

    li.append(handle, label, editBtn, removeBtn);
    ul.appendChild(li);
  });

  attachDragReorder(ul, luaState[eventName].actions, () => {
    refreshActionList(eventName, snippetsJson, luaState, onUpdate);
    onUpdate();
  });
  anchor.appendChild(ul);
}

function openSnippetDialog(eventName, defs, luaState, onUpdate, sounds, particles, editOpts = null) {
  const dialog      = document.getElementById("snippetDialog");
  const eventLabel  = document.getElementById("dialogEventLabel");
  const searchInput = document.getElementById("snippetSearch");
  const snippetList = document.getElementById("snippetList");
  const detailPane  = document.getElementById("snippetDetail");
  const addBtn      = document.getElementById("dialogAdd");
  const isEdit      = editOpts !== null;

  eventLabel.textContent = eventName;
  searchInput.value = "";
  detailPane.innerHTML = '<div class="dialog-placeholder">← Select a snippet</div>';
  addBtn.disabled = !isEdit;
  addBtn.textContent = isEdit ? "Update" : "Add";

  let selectedDef = isEdit ? defs.find(d => d.id === editOpts.existingAction.type) ?? null : null;
  let paramValues = isEdit ? { ...editOpts.existingAction.params } : {};

  if (selectedDef) renderDetail(selectedDef);

  function renderList(filter = "") {
    snippetList.innerHTML = "";
    const q = filter.toLowerCase();
    defs.filter(d => !q || d.label.toLowerCase().includes(q)).forEach(def => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "snippet-list-item";
      if (selectedDef?.id === def.id) item.classList.add("selected");
      item.textContent = def.label;
      item.addEventListener("click", () => {
        selectedDef = def;
        if (!isEdit) paramValues = {};
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
        const items = paramConfig.source === "sounds.json" ? sounds : particles;
        const isSounds = paramConfig.source === "sounds.json";
        buildSearchSelect(row, items, paramKey, isSounds, val => {
          if (isSounds) { paramValues.sound = val.name; paramValues.soundfile = val.file; }
          else paramValues[paramKey] = val.name;
        }, paramValues[paramKey] ?? "");
      } else if (paramConfig.type === "select") {
        const sel = document.createElement("select");
        sel.className = "field-input";
        (paramConfig.options ?? []).forEach(opt => {
          const o = document.createElement("option");
          o.value = opt; o.textContent = labels[opt] ?? opt;
          sel.appendChild(o);
        });
        sel.value = paramValues[paramKey] ?? sel.options[0]?.value ?? "";
        paramValues[paramKey] = sel.value;
        sel.addEventListener("change", () => { paramValues[paramKey] = sel.value; });
        row.appendChild(sel);
      } else {
        const input = document.createElement("input");
        input.type = "text";
        input.className = "field-input";
        if (paramConfig.placeholder) input.placeholder = paramConfig.placeholder;
        input.value = paramValues[paramKey] ?? "";
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
    const missing = Object.keys(selectedDef.params ?? {})
      .filter(k => k !== "soundfile" && !paramValues[k]);
    if (missing.length) { alert(`Please fill in: ${missing.join(", ")}`); return; }
    luaState[eventName] ??= { actions: [] };
    if (isEdit) {
      luaState[eventName].actions[editOpts.editIndex] = { type: selectedDef.id, params: { ...paramValues } };
    } else {
      luaState[eventName].actions.push({ type: selectedDef.id, params: { ...paramValues } });
    }
    dialog.close();
    refreshActionList(eventName, eventName in snippetsJson ? snippetsJson : modSnippetsJson,
      luaState, onUpdate);
    onUpdate();
  };

  addBtn.addEventListener("click", onAdd);
  document.getElementById("dialogClose").addEventListener("click",   () => dialog.close());
  document.getElementById("dialogCancel").addEventListener("click",  () => dialog.close());
  const onBackdrop = e => { if (e.target === dialog) dialog.close(); };
  dialog.addEventListener("click", onBackdrop);
  dialog.addEventListener("close", () => {
    searchInput.removeEventListener("input", onSearch);
    addBtn.removeEventListener("click", onAdd);
    dialog.removeEventListener("click", onBackdrop);
  }, { once: true });

  renderList(isEdit && selectedDef ? selectedDef.label : "");
  dialog.showModal();
  if (!isEdit) searchInput.focus();
}

function buildSearchSelect(container, items, paramKey, isSounds, onSelect, initialValue = "") {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "field-input";
  input.placeholder = "Search…";
  input.value = initialValue;
  const dropdown = document.createElement("div");
  dropdown.className = "dropdown";
  input.addEventListener("input", () => {
    const q = input.value.toLowerCase().trim();
    dropdown.innerHTML = "";
    if (!q) return;
    items.filter(it => it.name.toLowerCase().includes(q)).slice(0, 20).forEach(it => {
      const opt = document.createElement("div");
      opt.textContent = it.name;
      opt.addEventListener("click", () => {
        input.value = it.name;
        dropdown.innerHTML = "";
        onSelect(it);
      });
      dropdown.appendChild(opt);
    });
  });
  container.append(input, dropdown);
}

function openBehaviorDialog({ options, labels, current, onConfirm }) {
  const dialog = document.getElementById("behaviorDialog");
  const searchInput = dialog.querySelector(".behavior-search");
  const listEl = dialog.querySelector(".behavior-option-list");
  const confirmBtn = dialog.querySelector(".behavior-confirm");

  let selected = new Set(current);
  searchInput.value = "";

  function renderOptions(filter = "") {
    listEl.innerHTML = "";
    const q = filter.toLowerCase();
    options.filter(o => !q || (labels[o] ?? o).toLowerCase().includes(q)).forEach(opt => {
      const label = document.createElement("label");
      label.className = "behavior-option";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selected.has(opt);
      cb.addEventListener("change", () => {
        cb.checked ? selected.add(opt) : selected.delete(opt);
      });
      const name = document.createElement("span");
      name.textContent = labels[opt] ?? opt;
      label.append(cb, name);
      listEl.appendChild(label);
    });
  }

  searchInput.addEventListener("input", () => renderOptions(searchInput.value));
  const onConfirmClick = () => { onConfirm([...selected]); dialog.close(); };
  confirmBtn.addEventListener("click", onConfirmClick);
  const onClose = () => confirmBtn.removeEventListener("click", onConfirmClick);
  dialog.addEventListener("close", onClose, { once: true });
  const onBackdrop = e => { if (e.target === dialog) dialog.close(); };
  dialog.addEventListener("click", onBackdrop);

  renderOptions();
  dialog.showModal();
  searchInput.focus();
}

function openAddKVDialog(formEl) {
  const dialog = document.getElementById("addKVDialog");
  const listEl = dialog.querySelector(".addkv-list");
  const searchInput = dialog.querySelector(".addkv-search");
  searchInput.value = "";

  const addable = Object.entries(schema).filter(([k, v]) => v.addable && !state._activeFields.has(k));

  function renderList(filter = "") {
    listEl.innerHTML = "";
    const q = filter.toLowerCase();
    addable.filter(([k, v]) => !q || (v.label ?? k).toLowerCase().includes(q)).forEach(([key, config]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "addkv-item";
      btn.textContent = config.label ?? key;
      btn.addEventListener("click", () => {
        showAddableField(formEl, key, state, abilityUpdate);
        dialog.close();
        abilityUpdate();
      });
      listEl.appendChild(btn);
    });
    if (!listEl.children.length) {
      const empty = document.createElement("p");
      empty.className = "dialog-placeholder";
      empty.textContent = "All parameters already added.";
      listEl.appendChild(empty);
    }
  }

  searchInput.addEventListener("input", () => renderList(searchInput.value));
  const onBackdrop = e => { if (e.target === dialog) dialog.close(); };
  dialog.addEventListener("click", onBackdrop);
  dialog.addEventListener("close", () => dialog.removeEventListener("click", onBackdrop), { once: true });

  renderList();
  dialog.showModal();
  searchInput.focus();
}

function openPropertyDialog(properties, onRender, onUpdate) {
  const dialog = document.getElementById("propDialog");
  const listEl = dialog.querySelector(".prop-dialog-list");
  const searchInput = dialog.querySelector(".prop-search");
  const grouped = {};
  modifierProps.forEach(p => { (grouped[p.group] ??= []).push(p); });

  function renderList(filter = "") {
    listEl.innerHTML = "";
    const q = filter.toLowerCase();
    Object.entries(grouped).forEach(([group, props]) => {
      const filtered = props.filter(p => !q || p.label.toLowerCase().includes(q));
      if (!filtered.length) return;
      const heading = document.createElement("div");
      heading.className = "prop-group-heading";
      heading.textContent = group;
      listEl.appendChild(heading);
      filtered.forEach(prop => {
        const already = properties.some(p => p.constant === prop.constant);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "addkv-item" + (already ? " addkv-item--added" : "");
        btn.textContent = prop.label + (already ? " ✓" : "");
        if (!already) {
          btn.addEventListener("click", () => {
            properties.push({ ...prop, specialValue: "" });
            onRender();
            onUpdate();
            dialog.close();
          });
        }
        listEl.appendChild(btn);
      });
    });
  }

  searchInput.addEventListener("input", () => renderList(searchInput.value));
  const onBackdrop = e => { if (e.target === dialog) dialog.close(); };
  dialog.addEventListener("click", onBackdrop);
  dialog.addEventListener("close", () => dialog.removeEventListener("click", onBackdrop), { once: true });
  searchInput.value = "";
  renderList();
  dialog.showModal();
  searchInput.focus();
}

function attachDragReorder(listEl, dataArray, onReorder) {
  let dragSrcIndex = null;
  listEl.querySelectorAll(".draggable-item").forEach((item, index) => {
    const handle = item.querySelector(".drag-handle");
    handle.setAttribute("draggable", "true");
    handle.addEventListener("dragstart", e => {
      dragSrcIndex = index;
      e.dataTransfer.effectAllowed = "move";
      requestAnimationFrame(() => item.classList.add("dragging"));
    });
    handle.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      listEl.querySelectorAll(".draggable-item").forEach(el => el.classList.remove("drag-over"));
    });
    item.addEventListener("dragover", e => {
      e.preventDefault();
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

function renderValidation(issues, panelId) {
  const panel = document.getElementById(panelId);
  panel.innerHTML = "";
  issues.forEach(({ level, message }) => {
    const item = document.createElement("div");
    item.className = `validation-item validation-${level}`;
    item.textContent = (level === "error" ? "✕ " : "⚠ ") + message;
    panel.appendChild(item);
  });
}

function showFeedback(btnId, msg) {
  const btn = document.getElementById(btnId);
  const orig = btn.textContent;
  btn.textContent = msg; btn.disabled = true;
  setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
}

function serializeState(s) {
  return { ...s, _kvDisabled: [...(s._kvDisabled ?? new Set())], _activeFields: [...(s._activeFields ?? new Set())] };
}
function deserializeState(raw) {
  if (!raw || typeof raw !== "object") return null;
  const def = DEFAULT_STATE();
  const s = { ...def, ...raw };
  s._kvDisabled   = new Set(raw._kvDisabled   ?? []);
  s._activeFields = new Set(raw._activeFields  ?? []);
  s.Lua ??= {};
  s.Lua.OnSpellStart    ??= { actions: [] };
  s.Lua.OnChannelFinish ??= { actions: [] };
  s.Lua.OnChannelThink  ??= { actions: [] };
  s.Lua.OnProjectileHit ??= { actions: [] };
  s.Lua.OnUpgrade       ??= { actions: [] };
  s.modifier ??= def.modifier;
  s.modifier.Properties ??= [];
  s.modifier.Events ??= def.modifier.Events;
  return s;
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState(state))); } catch {}
}
function loadState() {
  const params = new URLSearchParams(location.search);
  const stateParam = params.get("state");
  if (stateParam) {
    try {
      const s = deserializeState(JSON.parse(decodeURIComponent(escape(atob(stateParam)))));
      if (s) return s;
    } catch {}
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const s = deserializeState(JSON.parse(stored));
      if (s) return s;
    }
  } catch {}
  return DEFAULT_STATE();
}
function buildShareUrl() {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(serializeState(state)))));
  const tab = new URLSearchParams(location.search).get("tab") ?? "ability";
  return `${location.origin}${location.pathname}?tab=${tab}&state=${encoded}`;
}
function syncUrlHash() {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(serializeState(state)))));
  const tab = new URLSearchParams(location.search).get("tab") ?? "ability";
  history.replaceState(null, "", `${location.pathname}?tab=${tab}&state=${encoded}`);
}
function download(filename, content) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}
