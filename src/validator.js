export function validate(state) {
  const issues = [];
  const err  = msg => issues.push({ level: "error",   message: msg });
  const warn = msg => issues.push({ level: "warning",  message: msg });

  const name      = state.AbilityName ?? "";
  const behaviors = state.AbilityBehavior ?? [];
  const active    = state._activeFields ?? new Set();

  if (!name.trim()) {
    err("Ability Name is required.");
  } else if (/\s/.test(name)) {
    err("Ability Name must not contain spaces — use underscores.");
  } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    err("Ability Name must start with a letter or underscore and contain only letters, numbers, or underscores.");
  }

  const script = state.ScriptFile ?? "";
  if (!script.trim()) {
    err("Script File is required.");
  } else if (!script.endsWith(".lua")) {
    err("Script File must end with .lua");
  } else {
    const basename = script.split("/").pop().replace(/\.lua$/, "");
    if (name.trim() && basename !== name.trim()) {
      warn(`Script File basename "${basename}" doesn't match Ability Name "${name}". They should match.`);
    }
  }

  if (!behaviors.length) err("At least one Ability Behavior must be selected.");

  const exclusive = [
    ["DOTA_ABILITY_BEHAVIOR_NO_TARGET", "DOTA_ABILITY_BEHAVIOR_UNIT_TARGET"],
    ["DOTA_ABILITY_BEHAVIOR_NO_TARGET", "DOTA_ABILITY_BEHAVIOR_POINT"],
    ["DOTA_ABILITY_BEHAVIOR_PASSIVE",   "DOTA_ABILITY_BEHAVIOR_UNIT_TARGET"],
    ["DOTA_ABILITY_BEHAVIOR_PASSIVE",   "DOTA_ABILITY_BEHAVIOR_NO_TARGET"],
    ["DOTA_ABILITY_BEHAVIOR_PASSIVE",   "DOTA_ABILITY_BEHAVIOR_POINT"],
  ];
  for (const [a, b] of exclusive) {
    if (behaviors.includes(a) && behaviors.includes(b)) {
      warn(`${shortB(a)} and ${shortB(b)} cannot be combined.`);
    }
  }

  if (behaviors.includes("DOTA_ABILITY_BEHAVIOR_UNIT_TARGET") && active.has("AbilityUnitTargetType")) {
    if (!(state.AbilityUnitTargetType ?? []).length) err("Unit Target behavior requires at least one Target Type.");
  }

  if (behaviors.includes("DOTA_ABILITY_BEHAVIOR_CHANNELLED")) {
    if (!(state.Lua?.OnChannelFinish?.actions?.length)) {
      warn("Channelled ability has no OnChannelFinish snippets.");
    }
    if (active.has("AbilityChannelTime") && !parseFloat(state.AbilityChannelTime)) {
      warn("Channelled ability should have a non-zero Channel Time.");
    }
  }

  (state.AbilityValues ?? []).forEach((v, i) => {
    if (!v.key?.trim()) warn(`Ability Value #${i + 1} has an empty variable name.`);
    if (!v.value?.trim()) warn(`Ability Value #${i + 1} "${v.key || "?"}" has an empty value.`);
  });

  return issues;
}

function shortB(b) {
  return b.replace("DOTA_ABILITY_BEHAVIOR_", "").replace(/_/g, " ")
    .toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
