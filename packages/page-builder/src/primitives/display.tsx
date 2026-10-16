import { createHeading } from "./heading";

/** Hero-sized headline, styled separately from section H1s. */
export const Display = createHeading(
  "Display",
  "h1",
  "scroll-m-20 text-balance text-5xl font-bold tracking-tight",
  (theme) => theme?.typography?.display ?? theme?.typography?.header1,
);
