export function renderForm(schema, container, state, onChange) {
  Object.entries(schema).forEach(([key, config]) => {
    const div = document.createElement("div");

    if (config.type === "text") {
      const input = document.createElement("input");
      input.value = config.default || "";
      input.oninput = () => {
        state[key] = input.value;
        onChange();
      };
      div.appendChild(input);
    }

    if (config.type === "multiselect") {
      config.options.forEach(opt => {
        const label = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";

        cb.onchange = () => {
          state[key] = state[key] || [];
          if (cb.checked) state[key].push(opt);
          else state[key = state[key].filter(x => x !== opt)];
          onChange();
        };

        label.appendChild(cb);
        label.append(opt);
        div.appendChild(label);
      });
    }

    container.appendChild(div);
  });
}