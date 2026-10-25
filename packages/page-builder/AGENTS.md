## Development Tips

- Copy all page related packages like page-primitives, page-blocks etc., into this package. Converge all of them into this package.

## Testing

- When smoke-testing block or theme settings in the builder, don't stop at setting a value. Also reset each field you changed back to its original state, by clearing the text or with the field's reset button if it has one. Check that the change still saves ("Draft saved", not "Couldn't save changes") and that the canvas goes back to how it looked. The builder autosaves on every keystroke, so empty and partly typed values must save too.
