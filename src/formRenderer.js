export async function renderForm(schema, container, state, onChange, labels = {}, opts = {}) {
  state._kvDisabled   = state._kvDisabled   ?? new Set();
  state._activeFields = state._activeFields ?? new Set();

  for (const [key, config] of Object.entries(schema)) {
    const isAddable = !!config.addable;
    const isCore    = !!config.core;

    const wrapper = document.createElement("div");
    wrapper.className = "field";
    wrapper.dataset.fieldKey = key;
    if (state._kvDisabled.has(key)) wrapper.classList.add("kv-disabled");
    if (isAddable && !state._activeFields.has(key)) wrapper.style.display = "none";

    const labelRow = document.createElement("div");
    labelRow.className = "field-label-row";

    const labelEl = document.createElement("label");
    labelEl.className = "field-label";
    labelEl.textContent = config.label ?? key;
    labelRow.appendChild(labelEl);

    if (isAddable) {
      const kvToggle = document.createElement("button");
      kvToggle.type = "button";
      kvToggle.className = "kv-toggle";
      kvToggle.title = "Toggle inclusion in KV output";
      kvToggle.setAttribute("aria-pressed", String(!state._kvDisabled.has(key)));
      kvToggle.textContent = state._kvDisabled.has(key) ? "KV off" : "KV on";
      kvToggle.addEventListener("click", () => {
        const off = state._kvDisabled.has(key);
        off ? state._kvDisabled.delete(key) : state._kvDisabled.add(key);
        wrapper.classList.toggle("kv-disabled", !off);
        kvToggle.textContent = off ? "KV on" : "KV off";
        kvToggle.setAttribute("aria-pressed", String(off));
        onChange();
      });
      labelRow.appendChild(kvToggle);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "field-remove";
      removeBtn.title = "Remove field";
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => {
        state._activeFields.delete(key);
        wrapper.style.display = "none";
        onChange();
      });
      labelRow.appendChild(removeBtn);
    }

    wrapper.appendChild(labelRow);

    switch (config.type) {
      case "text":        renderText(wrapper, key, config, state, onChange);                           break;
      case "number":      renderNumber(wrapper, key, config, state, onChange);                         break;
      case "perlevel":    renderPerLevel(wrapper, key, config, state, onChange);                       break;
      case "multiselect": renderMultiselect(wrapper, key, config, state, onChange, labels);            break;
      case "select":      await renderSelect(wrapper, key, config, state, onChange, labels);           break;
      case "behavior":    renderBehavior(wrapper, key, config, state, onChange, labels, opts);         break;
      case "values":      renderValues(wrapper, key, state, onChange);                                 break;
      default: console.warn(`Unknown field type "${config.type}" for "${key}"`);
    }

    container.appendChild(wrapper);
  }
}

export function showAddableField(container, key, state, onChange) {
  const wrapper = container.querySelector(`[data-field-key="${key}"]`);
  if (!wrapper) return;
  state._activeFields.add(key);
  wrapper.style.display = "";
  onChange();
}

function renderText(wrapper, key, config, state, onChange) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "field-input";
  input.value = state[key] ?? config.default ?? "";
  state[key] = input.value;
  input.addEventListener("input", () => { state[key] = input.value; onChange(); });
  wrapper.appendChild(input);
}

function renderNumber(wrapper, key, config, state, onChange) {
  const input = document.createElement("input");
  input.type = "number";
  input.className = "field-input";
  if (config.min != null) input.min = config.min;
  if (config.max != null) input.max = config.max;
  input.value = state[key] ?? config.default ?? 0;
  state[key] = Number(input.value);
  input.addEventListener("input", () => { state[key] = Number(input.value); onChange(); });
  wrapper.appendChild(input);
}

function renderPerLevel(wrapper, key, config, state, onChange) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "field-input";
  input.placeholder = "e.g. 80 100 120 140";
  input.value = state[key] ?? config.default ?? "";
  state[key] = input.value;
  const hint = document.createElement("span");
  hint.className = "field-hint";
  hint.textContent = "Space-separated values, one per level";
  input.addEventListener("input", () => { state[key] = input.value; onChange(); });
  wrapper.appendChild(input);
  wrapper.appendChild(hint);
}

function renderMultiselect(wrapper, key, config, state, onChange, labels) {
  state[key] = state[key] ?? [];
  const group = document.createElement("div");
  group.className = "checkbox-group";
  config.options.forEach(opt => {
    const label = document.createElement("label");
    label.className = "checkbox-label";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = state[key].includes(opt);
    cb.addEventListener("change", () => {
      state[key] = cb.checked ? [...state[key], opt] : state[key].filter(x => x !== opt);
      onChange();
    });
    label.appendChild(cb);
    label.append(" " + (labels[opt] ?? opt));
    group.appendChild(label);
  });
  wrapper.appendChild(group);
}

async function renderSelect(wrapper, key, config, state, onChange, labels) {
  let options = config.options ?? [];
  if (config.source) {
    try {
      options = await fetch(`./data/${config.source}`).then(r => r.json());
    } catch (e) { console.error(`Failed to load "${config.source}"`, e); }
  }
  const sel = document.createElement("select");
  sel.className = "field-input";
  options.forEach(opt => {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = labels[opt] ?? opt;
    sel.appendChild(o);
  });
  state[key] = state[key] ?? config.default ?? options[0] ?? "";
  sel.value = state[key];

  if (config.previewUrl) {
    const row = document.createElement("div");
    row.className = "select-preview-row";
    const img = document.createElement("img");
    img.className = "texture-preview";
    img.style.display = "none";
    img.src = config.previewUrl.replace("{{value}}", state[key]);
    img.addEventListener("load",  () => { img.style.display = ""; });
    img.addEventListener("error", () => { img.style.display = "none"; });
    sel.addEventListener("change", () => {
      state[key] = sel.value;
      img.style.display = "none";
      img.src = config.previewUrl.replace("{{value}}", sel.value);
      onChange();
    });
    row.append(sel, img);
    wrapper.appendChild(row);
  } else {
    sel.addEventListener("change", () => { state[key] = sel.value; onChange(); });
    wrapper.appendChild(sel);
  }
}

function renderBehavior(wrapper, key, config, state, onChange, labels, opts) {
  state[key] = state[key] ?? [];

  const tagsEl = document.createElement("div");
  tagsEl.className = "behavior-tags";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "btn-edit-behaviors";
  editBtn.textContent = "+ Behaviors";
  editBtn.addEventListener("click", () => {
    opts.onBehaviorEdit?.({
      options: config.options,
      labels,
      current: [...state[key]],
      onConfirm: selected => {
        state[key] = selected;
        renderTags();
        onChange();
      },
    });
  });

  function renderTags() {
    tagsEl.innerHTML = "";
    state[key].forEach((b, i) => {
      const tag = document.createElement("span");
      tag.className = "behavior-tag";
      const label = document.createElement("span");
      label.textContent = labels[b] ?? b;
      const del = document.createElement("button");
      del.type = "button";
      del.className = "behavior-tag-del";
      del.setAttribute("aria-label", `Remove ${labels[b] ?? b}`);
      del.textContent = "×";
      del.addEventListener("click", () => {
        state[key].splice(i, 1);
        renderTags();
        onChange();
      });
      tag.append(label, del);
      tagsEl.appendChild(tag);
    });
    tagsEl.appendChild(editBtn);
  }

  renderTags();
  wrapper.appendChild(tagsEl);
}

function renderValues(wrapper, key, state, onChange) {
  state[key] = state[key] ?? [];
  const list = document.createElement("div");
  list.className = "value-list";

  function renderEntries() {
    list.innerHTML = "";
    state[key].forEach((entry, i) => {
      const row = document.createElement("div");
      row.className = "value-row draggable-item";

      const handle = document.createElement("span");
      handle.className = "drag-handle";
      handle.textContent = "⠿";
      handle.setAttribute("aria-hidden", "true");

      const keyInput = document.createElement("input");
      keyInput.type = "text";
      keyInput.className = "field-input value-key";
      keyInput.placeholder = "var name";
      keyInput.value = entry.key ?? "";
      keyInput.addEventListener("input", () => { state[key][i].key = keyInput.value; onChange(); });

      const valInput = document.createElement("input");
      valInput.type = "text";
      valInput.className = "field-input value-val";
      valInput.placeholder = "values e.g. 250 350";
      valInput.value = entry.value ?? "";
      valInput.addEventListener("input", () => { state[key][i].value = valInput.value; onChange(); });

      const removeBtn = document.createElement("button");
      removeBtn.textContent = "✕";
      removeBtn.className = "btn-remove";
      removeBtn.type = "button";
      removeBtn.addEventListener("click", () => { state[key].splice(i, 1); renderEntries(); onChange(); });

      row.append(handle, keyInput, valInput, removeBtn);
      list.appendChild(row);
    });
    attachDragReorder(list, state[key], () => { renderEntries(); onChange(); });
  }

  renderEntries();
  const addBtn = document.createElement("button");
  addBtn.textContent = "+ Add Ability Value";
  addBtn.className = "btn-add";
  addBtn.type = "button";
  addBtn.addEventListener("click", () => { state[key].push({ key: "", value: "" }); renderEntries(); onChange(); });
  wrapper.append(list, addBtn);
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
