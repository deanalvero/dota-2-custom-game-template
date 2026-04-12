export async function renderForm(schema, container, state, onChange) {
  for (const [key, config] of Object.entries(schema)) {
    const wrapper = document.createElement("div");
    wrapper.className = "field";

    const label = document.createElement("label");
    label.className = "field-label";
    label.textContent = config.label ?? key;
    wrapper.appendChild(label);

    switch (config.type) {
      case "text":
        renderText(wrapper, key, config, state, onChange);
        break;
      case "number":
        renderNumber(wrapper, key, config, state, onChange);
        break;
      case "perlevel":
        renderPerLevel(wrapper, key, config, state, onChange);
        break;
      case "multiselect":
        renderMultiselect(wrapper, key, config, state, onChange);
        break;
      case "select":
        await renderSelect(wrapper, key, config, state, onChange);
        break;
      case "special":
        renderSpecial(wrapper, key, state, onChange);
        break;
      default:
        console.warn(`formRenderer: unknown field type "${config.type}" for key "${key}"`);
    }

    container.appendChild(wrapper);
  }
}

function renderText(wrapper, key, config, state, onChange) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "field-input";
  input.value = state[key] ?? config.default ?? "";
  state[key] = input.value;

  input.addEventListener("input", () => {
    state[key] = input.value;
    onChange();
  });
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

  input.addEventListener("input", () => {
    state[key] = Number(input.value);
    onChange();
  });
  wrapper.appendChild(input);
}

function renderPerLevel(wrapper, key, config, state, onChange) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "field-input";
  input.placeholder = "e.g. 80 100 120 140  (one value per level)";
  input.value = state[key] ?? config.default ?? "";
  state[key] = input.value;

  const hint = document.createElement("span");
  hint.className = "field-hint";
  hint.textContent = "Space-separated values, one per level";

  input.addEventListener("input", () => {
    state[key] = input.value;
    onChange();
  });
  wrapper.appendChild(input);
  wrapper.appendChild(hint);
}

function renderMultiselect(wrapper, key, config, state, onChange) {
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
      if (cb.checked) {
        state[key] = [...state[key], opt];
      } else {
        state[key] = state[key].filter(x => x !== opt);
      }
      onChange();
    });

    label.appendChild(cb);
    label.append(" " + opt);
    group.appendChild(label);
  });

  wrapper.appendChild(group);
}

async function renderSelect(wrapper, key, config, state, onChange) {
  let options = config.options ?? [];

  if (config.source) {
    try {
      options = await fetch(`./data/${config.source}`).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      });
    } catch (err) {
      console.error(`formRenderer: failed to load select source "${config.source}"`, err);
    }
  }

  const sel = document.createElement("select");
  sel.className = "field-input";

  options.forEach(opt => {
    const o = document.createElement("option");
    o.value = o.textContent = opt;
    sel.appendChild(o);
  });

  state[key] = state[key] ?? config.default ?? options[0] ?? "";
  sel.value = state[key];

  sel.addEventListener("change", () => {
    state[key] = sel.value;
    onChange();
  });

  wrapper.appendChild(sel);
}

function renderSpecial(wrapper, key, state, onChange) {
  state[key] = state[key] ?? [];

  const list = document.createElement("div");
  list.className = "special-list";

  const VAR_TYPES = ["FIELD_FLOAT", "FIELD_INTEGER"];

  function renderEntries() {
    list.innerHTML = "";

    state[key].forEach((entry, i) => {
      const row = document.createElement("div");
      row.className = "special-row";

      const typeSelect = document.createElement("select");
      typeSelect.className = "field-input special-type";
      VAR_TYPES.forEach(t => {
        const o = document.createElement("option");
        o.value = o.textContent = t;
        typeSelect.appendChild(o);
      });
      typeSelect.value = entry.varType ?? "FIELD_FLOAT";
      typeSelect.addEventListener("change", () => {
        state[key][i].varType = typeSelect.value;
        onChange();
      });

      const keyInput = document.createElement("input");
      keyInput.type = "text";
      keyInput.className = "field-input special-key";
      keyInput.placeholder = "var name  e.g. damage";
      keyInput.value = entry.key ?? "";
      keyInput.addEventListener("input", () => {
        state[key][i].key = keyInput.value;
        onChange();
      });

      const valInput = document.createElement("input");
      valInput.type = "text";
      valInput.className = "field-input special-value";
      valInput.placeholder = "values  e.g. 100 200 300 400";
      valInput.value = entry.value ?? "";
      valInput.addEventListener("input", () => {
        state[key][i].value = valInput.value;
        onChange();
      });

      const removeBtn = document.createElement("button");
      removeBtn.textContent = "✕";
      removeBtn.className = "btn-remove";
      removeBtn.type = "button";
      removeBtn.addEventListener("click", () => {
        state[key].splice(i, 1);
        renderEntries();
        onChange();
      });

      row.append(typeSelect, keyInput, valInput, removeBtn);
      list.appendChild(row);
    });
  }

  renderEntries();

  const addBtn = document.createElement("button");
  addBtn.textContent = "+ Add Special Value";
  addBtn.className = "btn-add";
  addBtn.type = "button";
  addBtn.addEventListener("click", () => {
    state[key].push({ varType: "FIELD_FLOAT", key: "", value: "" });
    renderEntries();
    onChange();
  });

  wrapper.append(list, addBtn);
}
