import { Fragment } from "react";

/** Lets a path-like title wrap after each "/" rather than mid-segment. */
export function breakAfterSlashes(text: string) {
  const parts = text.split("/");
  return parts.map((part, index) => (
    <Fragment key={index}>
      {part}
      {index < parts.length - 1 ? (
        <>
          /<wbr />
        </>
      ) : null}
    </Fragment>
  ));
}
