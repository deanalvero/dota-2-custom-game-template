import { resolveSnippet, collectVarDecls, buildDefsById } from './snippetEngine.js';

export function generateModifierLua(mod, snippetsJson) {
  const name     = mod.ModifierName || "modifier_my_ability";
  const defsById = buildDefsById(snippetsJson);
  const ind      = s => `    ${s}`;
  const lines    = [`${name} = class({})`, ""];

  const boolFn = (fn, val) => {
    if (val !== undefined) lines.push(`function ${name}:${fn}() return ${val ? "true" : "false"} end`);
  };
  boolFn("IsDebuff",    mod.IsDebuff);
  boolFn("IsPurgable",  mod.IsPurgable);
  boolFn("IsHidden",    mod.IsHidden);
  boolFn("IsStunDebuff",mod.IsStunDebuff);
  boolFn("IsPermanent", mod.IsPermanent);

  if (mod.GetEffectName) {
    lines.push("",
      `function ${name}:GetEffectName()`,
      ind(`return "${mod.GetEffectName}"`),
      "end",
      `function ${name}:GetEffectAttachType()`,
      ind(`return ${mod.GetEffectAttachType || "PATTACH_ABSORIGIN_FOLLOW"}`),
      "end"
    );
  }
  if (mod.GetTexture) {
    lines.push("",
      `function ${name}:GetTexture()`,
      ind(`return "${mod.GetTexture}"`),
      "end"
    );
  }
  if (mod.StatusEffectName) {
    lines.push("",
      `function ${name}:GetStatusEffectName()`,
      ind(`return "${mod.StatusEffectName}"`),
      "end"
    );
  }

  const props = mod.Properties ?? [];
  if (props.length) {
    lines.push("",
      `function ${name}:DeclareFunctions()`,
      ind("return {"),
      ...props.map(p => ind(ind(p.constant + ","))),
      ind("}"),
      "end"
    );
    for (const p of props) {
      lines.push("",
        `function ${name}:${p.luaFn}()`,
        p.specialValue
          ? ind(`return self:GetAbility():GetSpecialValueFor("${p.specialValue}")`)
          : ind("return 0 -- TODO"),
        "end"
      );
    }
  }

  const EVENT_SIGS = {
    OnCreated:       `${name}:OnCreated(params)`,
    OnRefresh:       `${name}:OnRefresh(params)`,
    OnDestroy:       `${name}:OnDestroy()`,
    OnIntervalThink: `${name}:OnIntervalThink()`,
  };

  for (const [event, sig] of Object.entries(EVENT_SIGS)) {
    const actions  = mod.Events?.[event]?.actions ?? [];
    const varDecls = collectVarDecls(actions, defsById);
    const codeLines = [];

    for (const action of actions) {
      const def = defsById[action.type];
      if (!def) continue;
      codeLines.push(resolveSnippet(def, action.params).codeLine);
    }

    if (!actions.length && event !== "OnCreated" && event !== "OnDestroy") continue;

    const body = [
      ...varDecls.map(ind),
      ...(varDecls.length && codeLines.length ? [""] : []),
      ...codeLines.map(ind),
    ].join("\n") || ind(`-- TODO: implement ${event}`);

    lines.push("", `function ${sig}`, body, "end");
  }

  lines.push("");
  return lines.join("\n");
}
