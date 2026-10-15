import { createHeading } from "./heading";

export const Header2 = createHeading(
  "Header2",
  "h2",
  "scroll-m-20 text-balance text-3xl font-bold tracking-tight",
  (theme) => theme?.typography?.header2,
);
