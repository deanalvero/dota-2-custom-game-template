import { renderForm } from './formRenderer.js';
import { generateLua, generateKV } from './generators.js';

const state = {
  AbilityBehavior: [],
  Lua: { OnSpellStart: { actions: [] } }
};

const formEl = document.getElementById("form");
const snippetsEl = document.getElementById("snippets");

const schema = await fetch('./data/ability_schema.json').then(r => r.json());
renderForm(schema, formEl, state, update);

document.getElementById("addSound").onclick = async () => {
  const sounds = await fetch('./data/sounds.json').then(r => r.json());
  const flat = sounds.flatMap(s => s.sounds.map(name => ({
    name,
    file: s.soundfile
  })));

  const container = document.createElement("div");

  const input = document.createElement("input");
  const dropdown = document.createElement("div");
  dropdown.className = "dropdown";

  input.oninput = () => {
    dropdown.innerHTML = "";
    flat
      .filter(s => s.name.toLowerCase().includes(input.value.toLowerCase()))
      .forEach(s => {
        const option = document.createElement("div");
        option.textContent = s.name;
        option.onclick = () => {
          state.Lua.OnSpellStart.actions.push({
            type: "play_sound_on_caster",
            params: { sound: s.name }
          });
          update();
          container.remove();
        };
        dropdown.appendChild(option);
      });
  };

  container.appendChild(input);
  container.appendChild(dropdown);
  snippetsEl.appendChild(container);
};

function update() {
  document.getElementById("luaPreview").textContent = generateLua(state);
  document.getElementById("kvPreview").textContent = generateKV(state);
}

document.getElementById("downloadLua").onclick = () => {
  download("ability.lua", generateLua(state));
};

document.getElementById("downloadKV").onclick = () => {
  download("npc_abilities_custom.txt", generateKV(state));
};

function download(name, content) {
  const blob = new Blob([content]);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}