---
"@frontlit/text-editor": minor
---

Add pluggable blocks. `defineProfile` builds the schema, Markdown parser and serializer, validator (with availability checks), renderer and a format reference from one list of blocks; the new server-safe `@frontlit/text-editor/blocks` entry exports it with a block library (Image, Video, Audio, PDF, File, Embed, Callout, Tabs, Accordion, Steps). The editor gains a `/` insert menu, drag handles, block settings popovers, a media picker and an `unavailable` prop; `TextRenderer` accepts profile objects, host block components and `resolveMedia`. The default and documentation setups are rebuilt on profiles with unchanged Markdown output. Blocks work from the keyboard (Ctrl/⌘+Shift+↑/↓ moves a block, Alt+F10 reaches its controls, Escape returns) and with screen readers: the editing area is a labelled textbox (new `ariaLabel` prop) and the `/` menu is announced through `aria-activedescendant`.
