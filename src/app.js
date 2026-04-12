import { renderForm }            from './formRenderer.js';
import { generateLua, generateKV } from './generators.js';

const state = {
  AbilityBehavior:      [],
  AbilityUnitTargetType: [],
  AbilitySpecial:       [],
  Lua: { OnSpellStart: { actions: [] } },
};

const [schema, snippetsJson, soundsJson] = await Promise.all([
  fetch('./data/ability_schema.json').then(r => r.json()),
  fetch('./data/lua_snippets.json').then(r => r.json()),
  fetch('./data/sounds.json').then(r => r.json()),
]);

const flatSounds = soundsJson.flatMap(s =>
  s.sounds.map(name => ({ name, file: s.soundfile }))
);

await renderForm(schema, document.getElementById("form"), state, update);
renderSnippetButtons(snippetsJson);
update();

function renderSnippetButtons(snippetsJson) {
  const container = document.getElementById("snippets");

  for (const [eventName, defs] of Object.entries(snippetsJson)) {
    const heading = document.createElement("h4");
    heading.textContent = eventName;
    container.appendChild(heading);

    defs.forEach(def => {
      const btn = document.createElement("button");
      btn.textContent = `+ ${def.label}`;
      btn.className = "btn-add-snippet";
      btn.type = "button";
      btn.addEventListener("click", () =>
        openSnippetForm(def, eventName, btn, container)
      );
      container.appendChild(btn);
    });

    const listAnchor = document.createElement("div");
    listAnchor.id = `action-list-${eventName}`;
    container.appendChild(listAnchor);
  }
}

function openSnippetForm(def, eventName, anchorBtn, container) {
  const existing = container.querySelector(".snippet-form");
  if (existing) existing.remove();

  const form = document.createElement("div");
  form.className = "snippet-form";

  const paramValues = {};

  for (const [paramKey, paramConfig] of Object.entries(def.params ?? {})) {
    const fieldWrapper = document.createElement("div");
    fieldWrapper.className = "snippet-param";

    const label = document.createElement("label");
    label.textContent = paramKey;
    fieldWrapper.appendChild(label);

    if (paramConfig.type === "search_select") {
      const sourceItems = paramConfig.source === "sounds.json" ? flatSounds : [];
      buildSearchSelect(fieldWrapper, sourceItems, resolved => {
        Object.assign(paramValues, resolved);
      });

    } else if (paramConfig.type === "select") {
      const sel = document.createElement("select");
      sel.className = "field-input";
      (paramConfig.options ?? []).forEach(opt => {
        const o = document.createElement("option");
        o.value = o.textContent = opt;
        sel.appendChild(o);
      });
      paramValues[paramKey] = sel.value;
      sel.addEventListener("change", () => {
        paramValues[paramKey] = sel.value;
      });
      fieldWrapper.appendChild(sel);

    } else {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "field-input";
      input.addEventListener("input", () => {
        paramValues[paramKey] = input.value;
      });
      fieldWrapper.appendChild(input);
    }

    form.appendChild(fieldWrapper);
  }

  const confirmBtn = document.createElement("button");
  confirmBtn.textContent = "Add";
  confirmBtn.className = "btn-confirm";
  confirmBtn.type = "button";
  confirmBtn.addEventListener("click", () => {
    const missing = Object.keys(def.params ?? {}).filter(k => !paramValues[k]);
    if (missing.length) {
      alert(`Please fill in: ${missing.join(", ")}`);
      return;
    }
    state.Lua[eventName] ??= { actions: [] };
    state.Lua[eventName].actions.push({ type: def.id, params: { ...paramValues } });
    form.remove();
    refreshActionList(eventName);
    update();
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancel";
  cancelBtn.className = "btn-cancel";
  cancelBtn.type = "button";
  cancelBtn.addEventListener("click", () => form.remove());

  form.append(confirmBtn, cancelBtn);
  anchorBtn.insertAdjacentElement("afterend", form);
}

function buildSearchSelect(container, items, onSelect) {
  const input    = document.createElement("input");
  input.type        = "text";
  input.className   = "field-input";
  input.placeholder = "Search...";

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
          input.value      = item.name;
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

  actions.forEach((action, i) => {
    const li = document.createElement("li");

    const summary = document.createElement("span");
    summary.textContent = `${action.type}(${Object.entries(action.params)
      .filter(([k]) => k !== "soundfile")
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ")})`;

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "✕";
    removeBtn.className   = "btn-remove";
    removeBtn.type        = "button";
    removeBtn.addEventListener("click", () => {
      state.Lua[eventName].actions.splice(i, 1);
      refreshActionList(eventName);
      update();
    });

    li.append(summary, removeBtn);
    ul.appendChild(li);
  });

  anchor.appendChild(ul);
}

function update() {
  document.getElementById("luaPreview").textContent = generateLua(state, snippetsJson);
  document.getElementById("kvPreview").textContent  = generateKV(state);
}

document.getElementById("downloadLua").addEventListener("click", () => {
  const filename = `${state.AbilityName || "ability"}.lua`;
  download(filename, generateLua(state, snippetsJson));
});

document.getElementById("downloadKV").addEventListener("click", () => {
  download("npc_abilities_custom.txt", generateKV(state));
});

function download(filename, content) {
  const blob = new Blob([content], { type: "text/plain" });
  const a    = document.createElement("a");
  a.href     = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
