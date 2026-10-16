import { createHeading } from "./heading";

export const Header1 = createHeading(
  "Header1",
  "h1",
  "scroll-m-20 text-balance text-4xl font-bold tracking-tight",
  (theme) => theme?.typography?.header1,
);
