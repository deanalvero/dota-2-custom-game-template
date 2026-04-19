import { resolveSnippet, collectVarDecls, buildDefsById } from './snippetEngine.js';

const EVENT_SIGNATURES = {
  OnSpellStart:    name => `function ${name}:OnSpellStart()`,
  OnChannelFinish: name => `function ${name}:OnChannelFinish(interrupted)`,
  OnChannelThink:  name => `function ${name}:OnChannelThink(interval)`,
  OnProjectileHit: name => `function ${name}:OnProjectileHit(target, location)`,
  OnUpgrade:       name => `function ${name}:OnUpgrade()`,
  OnOwnerDied:     name => `function ${name}:OnOwnerDied()`,
};

export function generateLua(state, snippetsJson) {
  const name      = state.AbilityName || "my_ability_lua";
  const defsById  = buildDefsById(snippetsJson);
  const behaviors = state.AbilityBehavior ?? [];
  const ind       = s => `    ${s}`;
  const blocks    = [`${name} = class({})`, ""];
  const precache  = new Set();

  const impliedEvents = new Set(Object.keys(state.Lua ?? {}));
  if (behaviors.includes("DOTA_ABILITY_BEHAVIOR_CHANNELLED")) impliedEvents.add("OnChannelFinish");
  if (behaviors.includes("DOTA_ABILITY_BEHAVIOR_CHANNELLED")) impliedEvents.add("OnChannelThink");

  for (const event of impliedEvents) {
    (state.Lua?.[event]?.actions ?? []).forEach(a => {
      if (a.params?.soundfile) precache.add(a.params.soundfile);
    });
  }

  blocks.push(
    `function ${name}:Precache(context)`,
    precache.size
      ? [...precache].map(f => ind(`PrecacheResource("soundfile", "${f}", context)`)).join("\n")
      : ind("-- no resources to precache"),
    "end", ""
  );

  for (const event of impliedEvents) {
    const sig = EVENT_SIGNATURES[event];
    if (!sig) continue;
    const actions  = state.Lua?.[event]?.actions ?? [];
    const varDecls = collectVarDecls(actions, defsById);
    const codeLines = [];
    for (const action of actions) {
      const def = defsById[action.type];
      if (!def) continue;
      codeLines.push(resolveSnippet(def, action.params).codeLine);
    }
    const body = [
      ...varDecls.map(ind),
      ...(varDecls.length && codeLines.length ? [""] : []),
      ...codeLines.map(ind),
    ].join("\n") || ind(`-- TODO: implement ${event}`);
    blocks.push(sig(name), body, "end", "");
  }

  return blocks.join("\n");
}

export function generateKV(state) {
  const name      = state.AbilityName || "my_ability_lua";
  const disabled  = state._kvDisabled ?? new Set();
  const active    = state._activeFields ?? new Set();
  const behaviors = state.AbilityBehavior ?? [];
  const behavior  = behaviors.length ? behaviors.join(" | ") : null;
  const targetType = (state.AbilityUnitTargetType ?? []).join(" | ");

  const lines = [
    `"${name}"`, "{",
    kv("BaseClass",   "ability_lua"),
    kv("ScriptFile",  state.ScriptFile || ""),
    ...(behavior ? [kv("AbilityBehavior", behavior)] : []),
  ];

  const opt = (key, val) => {
    if (disabled.has(key) || !active.has(key) || val == null) return;
    lines.push(kv(key, String(val)));
  };

  opt("AbilityType",      state.AbilityType  || "DOTA_ABILITY_TYPE_BASIC");
  opt("AbilityTextureName", state.AbilityTextureName || "");
  opt("AbilitySharedCooldown", state.AbilitySharedCooldown);
  opt("AbilitySound",     state.AbilitySound);
  opt("LinkedAbility",    state.LinkedAbility);
  opt("AbilityCastAnimation", state.AbilityCastAnimation);
  opt("AbilityUnitDamageType", state.AbilityUnitDamageType);
  opt("SpellImmunityType",     state.SpellImmunityType);
  opt("SpellDispellableType",  state.SpellDispellableType);
  opt("FightRecapLevel",  state.FightRecapLevel);
  opt("HasScepterUpgrade",state.HasScepterUpgrade);
  opt("IsGrantedByScepter",state.IsGrantedByScepter);
  opt("IsGrantedByShard",  state.IsGrantedByShard);
  opt("AbilityDraftDisabled",state.AbilityDraftDisabled);

  if (targetType && active.has("AbilityUnitTargetType") && !disabled.has("AbilityUnitTargetType")) {
    if (active.has("AbilityUnitTargetTeam") && !disabled.has("AbilityUnitTargetTeam")) {
      lines.push(kv("AbilityUnitTargetTeam", state.AbilityUnitTargetTeam || "DOTA_UNIT_TARGET_TEAM_ENEMY"));
    }
    lines.push(kv("AbilityUnitTargetType", targetType));
    const flags = (state.AbilityUnitTargetFlags ?? []).join(" | ");
    if (flags && active.has("AbilityUnitTargetFlags") && !disabled.has("AbilityUnitTargetFlags")) {
      lines.push(kv("AbilityUnitTargetFlags", flags));
    }
  }

  opt("MaxLevel",         state.MaxLevel ?? 4);
  opt("AbilityCastRange", state.AbilityCastRange || "0");
  opt("AbilityCastPoint", state.AbilityCastPoint || "0.3");

  if (behaviors.includes("DOTA_ABILITY_BEHAVIOR_CHANNELLED") && active.has("AbilityChannelTime") && !disabled.has("AbilityChannelTime")) {
    lines.push(kv("AbilityChannelTime", state.AbilityChannelTime || "3"));
  }

  opt("AbilityCooldown",  state.AbilityCooldown  || "0");
  opt("AbilityManaCost",  state.AbilityManaCost  || "0");
  opt("AbilityDamage",    state.AbilityDamage    || "0");
  opt("AbilityDuration",  state.AbilityDuration  || "0");

  const values = state.AbilityValues ?? [];
  if (values.length) {
    lines.push('    "AbilityValues"', "    {",
      ...values.map(s => `        "${s.key}"${kvPad(s.key, 24)}"${s.value}"`),
      "    }");
  }

  lines.push("}");
  return lines.join("\n") + "\n";
}

function kv(key, val) { return `    "${key}"${kvPad(key, 24)}"${val}"`; }
function kvPad(key, n) { return " ".repeat(Math.max(1, n - key.length)); }
