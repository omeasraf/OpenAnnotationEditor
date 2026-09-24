const state = {
  files: [],
  file: null,
  records: [],
  noteIndex: 0,
  selected: null,
  selection: null,
};
const $ = (id) => document.getElementById(id);

async function request(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

function currentRecord() {
  return state.records[state.noteIndex];
}
function annotations() {
  return currentRecord()?.annotations?.at(-1)?.result || [];
}
function noteText() {
  return currentRecord()?.data?.note_text || currentRecord()?.data?.text || "";
}
function setStatus(text, error = false) {
  $("save-status").textContent = text;
  $("save-status").style.color = error ? "#ffb5aa" : "#c9d4dc";
}

function renderFiles() {
  $("file-count").textContent = state.files.length;
  $("file-list").innerHTML = state.files
    .map(
      (file, index) =>
        `<button class="file-item ${file.path === state.file ? "active" : ""}" data-file="${index}"><span class="file-system">${escapeHtml(file.system || "fixture")}</span>${escapeHtml(file.name)}</button>`,
    )
    .join("");
  document
    .querySelectorAll(".file-item")
    .forEach((item) =>
      item.addEventListener("click", () =>
        loadFile(state.files[item.dataset.file].path),
      ),
    );
}

function renderNote() {
  const record = currentRecord();
  if (!record) return;
  $("current-file").textContent = state.file;
  $("note-position").textContent =
    `Note ${state.noteIndex + 1} of ${state.records.length}`;
  $("note-title").textContent = `Annotation note`;
  $("note-id").textContent = `ID ${record.id ?? "—"}`;
  $("annotation-count").textContent = annotations().length;
  const spans = annotations()
    .map((a, index) => ({ ...a.value, index }))
    .filter((a) => Number.isInteger(a.start) && Number.isInteger(a.end));
  const text = noteText();
  const boundaries = [
    ...new Set([0, text.length, ...spans.flatMap((a) => [a.start, a.end])]),
  ].sort((a, b) => a - b);
  let html = "";
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i],
      end = boundaries[i + 1],
      active = spans.filter((a) => a.start <= start && a.end >= end);
    const content = escapeHtml(text.slice(start, end));
    if (active.length) {
      const selected = state.selected === active[0].index ? " selected" : "";
      html += `<mark class="${selected}" data-annotation="${active[0].index}" title="${escapeHtml(active[0].labels?.[0] || "annotation")}">${content}</mark>`;
    } else html += content;
  }
  $("note-text").innerHTML = html;
  document
    .querySelectorAll("mark[data-annotation]")
    .forEach((mark) =>
      mark.addEventListener("click", () =>
        selectAnnotation(Number(mark.dataset.annotation)),
      ),
    );
  $("annotation-list").innerHTML = spans
    .map(
      (a) =>
        `<div class="annotation-item ${state.selected === a.index ? "active" : ""}" data-annotation="${a.index}"><span class="annotation-swatch"></span><div><span class="annotation-label">${escapeHtml(a.labels?.[0] || "Unlabeled")}</span><span class="annotation-value">${escapeHtml(text.slice(a.start, a.end))} · ${a.start}:${a.end}</span></div></div>`,
    )
    .join("");
  document
    .querySelectorAll(".annotation-item")
    .forEach((item) =>
      item.addEventListener("click", () =>
        selectAnnotation(Number(item.dataset.annotation)),
      ),
    );
  renderEditor();
}

function renderEditor() {
  const annotation =
    state.selected == null ? null : annotations()[state.selected];
  if (!annotation) {
    $("editor").className = "editor empty";
    $("editor").textContent =
      "Select an annotation or select text in the note.";
    return;
  }
  const value = annotation.value;
  $("editor").className = "editor";
  $("editor").innerHTML =
    `<label>Label</label><input id="edit-label" value="${escapeAttr(value.labels?.[0] || "")}"><label>Start</label><input id="edit-start" type="number" value="${value.start}"><label>End</label><input id="edit-end" type="number" value="${value.end}"><label>Text</label><textarea readonly>${escapeHtml(noteText().slice(value.start, value.end))}</textarea><div class="editor-actions"><button class="primary" id="save-annotation">Save annotation</button><button class="danger" id="delete-annotation">Remove</button></div><p class="hint">Start/end offsets are zero-based and update the annotation text from the note.</p>`;
  $("save-annotation").addEventListener("click", () =>
    updateAnnotation(
      Number($("edit-start").value),
      Number($("edit-end").value),
      $("edit-label").value,
    ),
  );
  $("delete-annotation").addEventListener("click", () => removeAnnotation());
}

function selectAnnotation(index) {
  state.selected = index;
  state.selection = null;
  $("selection-info").textContent = "Select text to add an annotation.";
  $("add-selection").disabled = true;
  renderNote();
}
function updateAnnotation(start, end, label) {
  if (start < 0 || end <= start || end > noteText().length || !label.trim())
    return;
  const value = annotations()[state.selected].value;
  value.start = start;
  value.end = end;
  value.text = noteText().slice(start, end);
  value.labels = [label.trim()];
  saveFile();
}
function removeAnnotation() {
  if (state.selected == null) return;
  annotations().splice(state.selected, 1);
  state.selected = null;
  saveFile();
}
function addSelection() {
  if (!state.selection) return;
  const [start, end] = state.selection;
  const result = {
    id: `manual-${Date.now()}`,
    type: "labels",
    from_name: "label",
    to_name: "text",
    value: { start, end, text: noteText().slice(start, end), labels: ["MISC"] },
  };
  currentRecord().annotations.at(-1).result.push(result);
  state.selected = annotations().length - 1;
  state.selection = null;
  $("add-selection").disabled = true;
  saveFile();
}

async function saveFile() {
  try {
    setStatus("Saving…");
    await request(`/api/file?path=${encodeURIComponent(state.file)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.records),
    });
    setStatus("Saved");
    renderNote();
  } catch (error) {
    setStatus(error.message, true);
  }
}
async function loadFile(path) {
  try {
    setStatus("Loading…");
    state.file = path;
    state.records = await request(`/api/file?path=${encodeURIComponent(path)}`);
    state.noteIndex = 0;
    state.selected = null;
    renderFiles();
    renderNote();
    setStatus("Ready");
  } catch (error) {
    setStatus(error.message, true);
  }
}

function selectionOffsets() {
  const selection = window.getSelection();
  if (
    !selection ||
    selection.isCollapsed ||
    !$("note-text").contains(selection.anchorNode) ||
    !$("note-text").contains(selection.focusNode)
  )
    return null;
  const range = selection.getRangeAt(0);
  const walker = document.createTreeWalker(
    $("note-text"),
    NodeFilter.SHOW_TEXT,
  );
  let position = 0,
    start = null,
    end = null,
    node;
  while ((node = walker.nextNode())) {
    if (node === range.startContainer) start = position + range.startOffset;
    if (node === range.endContainer) end = position + range.endOffset;
    position += node.textContent.length;
  }
  if (start == null || end == null) return null;
  return start <= end ? [start, end] : [end, start];
}
$("note-text").addEventListener("mouseup", () => {
  const offsets = selectionOffsets();
  if (!offsets) return;
  state.selection = offsets;
  $("selection-info").textContent = `Selected ${offsets[0]}:${offsets[1]}`;
  $("add-selection").disabled = false;
});
$("add-selection").addEventListener("click", addSelection);
$("prev-note").addEventListener("click", () => {
  if (state.noteIndex > 0) {
    state.noteIndex--;
    state.selected = null;
    renderNote();
  }
});
$("next-note").addEventListener("click", () => {
  if (state.noteIndex + 1 < state.records.length) {
    state.noteIndex++;
    state.selected = null;
    renderNote();
  }
});
function jumpToNote() {
  const requested = $("note-id-input").value.trim();
  const index = state.records.findIndex(
    (record) => String(record.id) === requested,
  );
  if (!requested) return;
  if (index < 0) {
    setStatus(`Note ${requested} was not found`, true);
    return;
  }
  state.noteIndex = index;
  state.selected = null;
  renderNote();
  setStatus("Ready");
}
$("jump-note").addEventListener("click", jumpToNote);
$("note-id-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter") jumpToNote();
});
function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function escapeAttr(value) {
  return escapeHtml(value);
}

(async function init() {
  try {
    const payload = await request("/api/files");
    state.files = payload.files;
    renderFiles();
    if (state.files.length) await loadFile(state.files[0].path);
    else setStatus("No JSON files found", true);
  } catch (error) {
    setStatus(error.message, true);
  }
})();
