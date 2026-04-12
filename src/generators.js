import { resolveSnippet, collectVarDecls, buildDefsById } from './snippetEngine.js';

export function generateLua(state, snippetsJson) {
  const name     = state.AbilityName || "my_ability_lua";
  const actions  = state.Lua?.OnSpellStart?.actions ?? [];
  const defsById = buildDefsById(snippetsJson);

  const precache  = new Set();
  const codeLines = [];
  const varDecls  = collectVarDecls(actions, defsById);

  for (const action of actions) {
    const def = defsById[action.type];
    if (!def) { console.warn(`generateLua: unknown snippet type "${action.type}"`); continue; }
    const { codeLine } = resolveSnippet(def, action.params);
    codeLines.push(codeLine);
    if (action.params.soundfile) precache.add(action.params.soundfile);
  }

  const ind = str => `    ${str}`;

  const precacheBody = precache.size
    ? [...precache].map(f => ind(`PrecacheResource("soundfile", "${f}", context)`)).join("\n")
    : ind("-- no resources to precache");

  const onSpellBody = [
    ...varDecls.map(ind),
    ...(varDecls.length && codeLines.length ? [""] : []),
    ...codeLines.map(ind),
  ].join("\n") || ind("-- TODO: implement OnSpellStart");

  return [
    `${name} = class({})`,
    "",
    `function ${name}:Precache(context)`,
    precacheBody,
    "end",
    "",
    `function ${name}:OnSpellStart()`,
    onSpellBody,
    "end",
    "",
  ].join("\n");
}

export function generateKV(state) {
  const name     = state.AbilityName || "my_ability_lua";
  const disabled = state._kvDisabled ?? new Set();

  const behavior = state.AbilityBehavior?.length
    ? state.AbilityBehavior.join(" | ")
    : "DOTA_ABILITY_BEHAVIOR_NO_TARGET";

  const targetType = state.AbilityUnitTargetType?.length
    ? state.AbilityUnitTargetType.join(" | ")
    : "";

  const lines = [
    `"${name}"`,
    "{",
    kv("BaseClass",       "ability_lua"),
    kv("ScriptFile",      state.ScriptFile  || ""),
    kv("AbilityType",     state.AbilityType || "DOTA_ABILITY_TYPE_BASIC"),
    kv("AbilityBehavior", behavior),
  ];

  if (targetType && !disabled.has("AbilityUnitTargetType")) {
    if (!disabled.has("AbilityUnitTargetTeam")) {
      lines.push(kv("AbilityUnitTargetTeam", state.AbilityUnitTargetTeam || "DOTA_UNIT_TARGET_TEAM_ENEMY"));
    }
    lines.push(kv("AbilityUnitTargetType", targetType));
  }

  if (!disabled.has("AbilityTextureName")) {
    lines.push(kv("AbilityTextureName", state.AbilityTextureName || ""));
  }
  if (!disabled.has("MaxLevel")) {
    lines.push(kv("MaxLevel", String(state.MaxLevel ?? 4)));
  }
  if (!disabled.has("AbilityCastRange")) {
    lines.push(kv("AbilityCastRange", state.AbilityCastRange || "0"));
  }
  if (!disabled.has("AbilityCastPoint")) {
    lines.push(kv("AbilityCastPoint", state.AbilityCastPoint || "0.3"));
  }
  if (!disabled.has("AbilityCooldown")) {
    lines.push(kv("AbilityCooldown", state.AbilityCooldown || "0"));
  }
  if (!disabled.has("AbilityManaCost")) {
    lines.push(kv("AbilityManaCost", state.AbilityManaCost || "0"));
  }
  if (!disabled.has("AbilityDamage") && state.AbilityDamage && state.AbilityDamage !== "0") {
    lines.push(kv("AbilityDamage", state.AbilityDamage));
  }

  const values = state.AbilityValues ?? [];
  if (values.length) {
    lines.push(
      '    "AbilityValues"',
      "    {",
      ...values.map(s => `        "${s.key}"${kvPad(s.key, 24)}"${s.value}"`),
      "    }"
    );
  }

  lines.push("}");
  return lines.join("\n") + "\n";
}

function kv(key, val) {
  return `    "${key}"${kvPad(key, 24)}"${val}"`;
}

function kvPad(key, targetLen) {
  return " ".repeat(Math.max(1, targetLen - key.length));
}
