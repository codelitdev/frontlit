## Accessibility

- The editor, its blocks and the renderer must meet **WCAG 2.2 AA**. Treat a regression like any other bug: a change is not done until it passes.
- Everything works from the keyboard. Every pointer action has a keyboard equivalent (the drag handle has Ctrl/⌘+Shift+↑/↓; block controls are reached with Alt+F10 and left with Escape). Update the README's keyboard table when keys change.
- Focus never gets lost: popovers take focus when they open and give it back to their trigger on Escape. Menus that keep focus in the text (the `/` menu) use `aria-activedescendant`.
- Every control has an accessible name that says which item it acts on ("Remove tab 2", not "Remove item").
- Text contrast is at least 4.5:1, and state indicators such as the highlighted menu item at least 3:1, with the default tokens. Anything portaled to `<body>` sits outside `.tiptap-editor`, so it needs the tokens or fallbacks (see `tokens.css`).
- Before handing off a UI change, run axe (axe-core is in the workspace) over the editor with the affected blocks inserted and any menus or popovers open, and walk the change with the keyboard only. `examples/text-editor-blocks` has every block.
