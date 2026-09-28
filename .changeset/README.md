# Changesets

Version and publish the public packages (`@frontlit/page-builder`, `@frontlit/text-editor`).

1. On a PR that changes a public package, run `bun run changeset` and commit the file under `.changeset/`.
2. Merge to `main`. CI opens a `chore: update versions` PR.
3. Merge that PR. CI publishes to npm.
