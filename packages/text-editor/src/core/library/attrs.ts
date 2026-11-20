import type { AttrSpec } from "../types";
import { isId } from "../urls";

/** Attribute spec helpers for block definitions. */
export const attr = {
  /** A string; may be empty while an author is typing (autosave must not fail). */
  text(description: string, extra: Partial<AttrSpec<string>> = {}): AttrSpec<string> {
    return {
      default: "",
      type: "string",
      validate: (v) => typeof v === "string",
      description,
      ...extra,
    };
  },
  optionalText(
    description: string,
    extra: Partial<AttrSpec<string | null>> = {},
  ): AttrSpec<string | null> {
    return {
      default: null,
      type: "string",
      validate: (v) => v === null || typeof v === "string",
      description,
      ...extra,
    };
  },
  oneOf<T extends string>(
    values: readonly T[],
    description: string,
    message: string,
  ): AttrSpec<T | null> {
    return {
      default: null,
      type: values.map((value) => JSON.stringify(value)).join(" | "),
      validate: (v) => v === null || values.includes(v as T) || message,
      description,
    };
  },
  /** An uploaded media ID (`[A-Za-z0-9_-]{1,64}`); the host checks ownership. */
  media(description: string, required = true): AttrSpec<string | null> {
    return {
      default: null,
      type: "media ID",
      validate: (v) =>
        (v === null && !required) ||
        isId(v) ||
        "Media IDs are 1–64 letters, digits, _ or -.",
      description,
      required,
    };
  },
  integer(
    description: string,
    min: number,
    max: number,
    extra: Partial<AttrSpec<number | null>> = {},
  ): AttrSpec<number | null> {
    return {
      default: null,
      type: "number",
      validate: (v) =>
        v === null ||
        (Number.isInteger(v) && Number(v) >= min && Number(v) <= max) ||
        `Use a whole number from ${min} to ${max}.`,
      description,
      ...extra,
    };
  },
};

export const paragraph = { type: "paragraph" } as const;
