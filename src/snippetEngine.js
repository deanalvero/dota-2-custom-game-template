const VARIABLE_REGISTRY = {
  caster:  "local caster  = self:GetCaster()",
  target:  "local target  = self:GetCursorTarget()",
  point:   "local point   = self:GetCursorPosition()",
  ability: "local ability = self",
};

function renderTemplate(template, params) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in params)) {
      throw new Error(`Snippet template references unknown param "{{${key}}}"`);
    }
    return params[key];
  });
}

export function resolveSnippet(snippetDef, params) {
  const varDecls = (snippetDef.requires ?? []).map(v => {
    const decl = VARIABLE_REGISTRY[v];
    if (!decl) throw new Error(`Snippet references unknown required variable "${v}"`);
    return decl;
  });

  const codeLine = renderTemplate(snippetDef.template, params);
  return { varDecls, codeLine };
}

export function collectVarDecls(actions, defsById) {
  const seen  = new Set();
  const decls = [];

  for (const action of actions) {
    const def = defsById[action.type];
    if (!def) continue;

    for (const v of (def.requires ?? [])) {
      if (!seen.has(v)) {
        seen.add(v);
        decls.push(VARIABLE_REGISTRY[v]);
      }
    }
  }
  return decls;
}

export function buildDefsById(snippetsJson) {
  const map = {};
  for (const defs of Object.values(snippetsJson)) {
    for (const def of defs) {
      map[def.id] = def;
    }
  }
  return map;
}
