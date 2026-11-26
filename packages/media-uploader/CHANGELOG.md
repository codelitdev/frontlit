# @frontlit/media-uploader

## 0.2.0

### Minor Changes

- bdb7029: `MediaUploadDialog` and `ImageUploadDialog` take an optional `labels` prop to translate every piece of text they show: titles, the description, tabs, the drop zone, buttons, placeholders, error messages and the close button's screen-reader text. Labels with a value in them are functions (`upTo: (size) => …`, `uploading: (progress) => …`, `fileTooLarge: (maxSize) => …`), so any translator works. Anything not passed stays English; `MediaUploaderLabels` and `defaultMediaUploaderLabels` are exported. The package also gets a `test` script, so its tests run in CI.

## 0.1.0

### Minor Changes

- faed9fa: `MediaUploadDialog` and `MediaUploaderProvider` accept an optional `uploadNotice`, a short note shown in the upload dialog.

## 0.1.0-alpha.1

### Minor Changes

- faed9fa: `MediaUploadDialog` and `MediaUploaderProvider` accept an optional `uploadNotice`, a short note shown in the upload dialog.
