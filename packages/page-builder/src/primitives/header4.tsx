import { createHeading } from "./heading";

export const Header4 = createHeading(
  "Header4",
  "h4",
  "scroll-m-20 text-xl font-semibold tracking-normal",
  (theme) => theme?.typography?.header4,
);
