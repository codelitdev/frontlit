---
"@frontlit/media-uploader": minor
---

`MediaUploadDialog` and `ImageUploadDialog` take an optional `labels` prop to translate every piece of text they show: titles, the description, tabs, the drop zone, buttons, placeholders, error messages and the close button's screen-reader text. Labels with a value in them are functions (`upTo: (size) => …`, `uploading: (progress) => …`, `fileTooLarge: (maxSize) => …`), so any translator works. Anything not passed stays English; `MediaUploaderLabels` and `defaultMediaUploaderLabels` are exported. The package also gets a `test` script, so its tests run in CI.
