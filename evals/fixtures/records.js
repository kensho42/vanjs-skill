import van from "vanjs-core";
import * as vanX from "vanjs-ext";
const {div, span, ul, li, input} = van.tags;

export function Records(initial) {
  const data = vanX.reactive({rows: initial, errors: {}});
  const root = div(
    span({class: "error"}, () => data.errors.server ?? ""),
    vanX.list(ul, data.rows, ({val: row}) => li(
      {"data-id": row.id},
      input({value: () => row.text, oninput: e => row.text = e.currentTarget.value}),
    )),
  );
  return {
    root,
    refresh(next) { data.rows = next; },
    clear() { data.rows.length = 0; },
    error(message) { if (message) data.errors.server = message; else delete data.errors.server; },
  };
}
