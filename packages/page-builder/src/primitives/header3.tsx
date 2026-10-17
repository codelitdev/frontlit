import { createHeading } from "./heading";

export const Header3 = createHeading(
  "Header3",
  "h3",
  "scroll-m-20 text-2xl font-semibold tracking-normal",
  (theme) => theme?.typography?.header3,
);
