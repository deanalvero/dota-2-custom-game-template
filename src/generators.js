const variableRegistry = {
  caster: "local caster = self:GetCaster()"
};

export function generateLua(state) {
  const name = state.AbilityName || "ability_lua";

  const vars = new Set();
  const lines = [];
  const precache = new Set();

  state.Lua.OnSpellStart.actions.forEach(a => {
    vars.add("caster");

    lines.push(`EmitSoundOn("${a.params.sound}", caster)`);

    if (a.params.sound.includes("VengefulSpirit")) {
      precache.add("soundevents/game_sounds_heroes/game_sounds_vengefulspirit.vsndevts");
    }
  });

  return `
${name} = class({})

function ${name}:Precache(context)
${[...precache].map(f => `    PrecacheResource("soundfile", "${f}", context)`).join("\n")}
end

function ${name}:OnSpellStart()
    ${[...vars].map(v => variableRegistry[v]).join("\n    ")}

    ${lines.join("\n    ")}
end
`;
}

export function generateKV(state) {
  return `
"${state.AbilityName}"
{
    "BaseClass" "ability_lua"
    "ScriptFile" "${state.ScriptFile}"
    "AbilityBehavior" "${(state.AbilityBehavior || []).join(" | ")}"
    "AbilityTextureName" "${state.AbilityTextureName || ""}"
}
`;
}