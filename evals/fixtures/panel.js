import van from "vanjs-core";
const {div, section, input, span} = van.tags;

export function Settings({visible}) {
  const draft = van.state("");
  return div(() => visible.val ? section(input({
    value: draft,
    oninput: e => draft.val = e.currentTarget.value,
  })) : null);
}

export function Status({selected}) {
  return div(dom => {
    const node = dom ?? span("Status");
    node.className = selected.val ? "selected" : "";
    return node;
  });
}
