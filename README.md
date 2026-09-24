# OPEN Annotation Editor

Small local editor for Label Studio JSON exports. It lists JSON fixtures, shows one note at a time with highlighted annotations, and writes edits back to the source file immediately.

From this directory:

```bash
python app.py
```

Then open <http://127.0.0.1:8765>.

Use `--data-dir` to point at another annotation directory:

```bash
python server.py --data-dir /path/to/annotations
```

Click an annotation to edit its label or offsets, select text to add a `MISC` annotation, and use Remove to delete one. Changes are saved atomically after each action.
