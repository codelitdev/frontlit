# @frontlit/text-editor

## 0.1.0-alpha.3

### Minor Changes

- 253e3cf: `Editor` delivers an edit that is still waiting on its debounce when it unmounts, instead of dropping it. A new `debounceMs` prop (default 1000) sets how long it waits after the last edit before calling `onChange`.
