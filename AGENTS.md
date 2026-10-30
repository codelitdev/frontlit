# Development Guidelines for FrontLit

## Architecture Guidelines

- Strive for a simpler design and add more complexity only when it is required to solve a problem.
- Avoid over-engineering.
- Don't go for premature-optimizations.
- We haven't hit planet scale yet, so don't try to cater to edge cases which our users may not even encounter.

## Development Tips

- The platform is in early stages of development. We don't even have a production deployment yet. So, feel free to scratch migrations and write those from scratch as many times as you need, reset database etc.. No need to worry about being backwards compatible.
- Prefer simpler data structures, schemas and logic over complicated implementation.
- Don't over-engineer or pre-optimize, just to tackle edge cases which have very slim chances of occuring.
- There should be no shared user identity between admin and learner apps.
- Do not consider an issue done until you've done full e2e browser based smoke.

## Public site UI

Every visual component on the public site (`apps/sites`) must be built from
`@frontlit/page-builder` primitives. No exceptions.

Use the primitives in `packages/page-builder/src/primitives` — `Section`,
`Header1`–`Header4`, `Subheader1`–`Subheader2`, `Text1`–`Text2`, `Caption`,
`Button`, `Input`, `PageCard` / `PageCardContent`, `Label`, `Badge`, `Link` —
and the themed `TextRenderer` for TipTap JSON. Pass `theme` from
`useSiteThemeStyle()` or the page renderer so typography and interactives
follow the team theme.

- Do not style headings, body copy, captions, buttons, inputs, cards, or
  badges with one-off Tailwind as a substitute for a primitive.
- If a needed primitive does not exist, add it under
  `packages/page-builder/src/primitives` and use that. Do not special-case
  the host.
- Layout-only wrappers (`div` / `ul` / `nav` with flex, grid, or gap) and
  Next.js `Link` for routing are allowed. Visible text, controls, and
  surfaces inside them must still be primitives.
- Decorative icons may sit inside a primitive; they are not a replacement
  for one.
