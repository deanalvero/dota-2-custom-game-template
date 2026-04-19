const VARIABLE_REGISTRY = {
  caster:  "local caster  = self:GetCaster()",
  target:  "local target  = self:GetCursorTarget()",
  point:   "local point   = self:GetCursorPosition()",
  ability: "local ability = self",
  level:   "local level   = self:GetLevel()",
  parent:  "local parent  = self:GetParent()",
};

function renderTemplate(template, params) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in params)) throw new Error(`Unknown param "{{${key}}}"`);
    return params[key];
  });
}

export function resolveSnippet(snippetDef, params) {
  const varDecls = (snippetDef.requires ?? []).map(v => {
    const decl = VARIABLE_REGISTRY[v];
    if (!decl) throw new Error(`Unknown required variable "${v}"`);
    return decl;
  });
  return { varDecls, codeLine: renderTemplate(snippetDef.template, params) };
}

export function collectVarDecls(actions, defsById) {
  const seen = new Set(), decls = [];
  for (const action of actions) {
    for (const v of (defsById[action.type]?.requires ?? [])) {
      if (!seen.has(v)) { seen.add(v); decls.push(VARIABLE_REGISTRY[v]); }
    }
  }
  return decls;
}

export function buildDefsById(snippetsJson) {
  const map = {};
  for (const defs of Object.values(snippetsJson)) {
    for (const def of defs) map[def.id] = def;
  }
  return map;
}
