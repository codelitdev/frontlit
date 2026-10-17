import type { Theme } from "../../models";
import { classic } from "./classic";
import { editorial } from "./editorial";
import { midnight } from "./midnight";
import { neobrutalism } from "./neobrutalism";
import { studio } from "./studio";
import { terminal } from "./terminal";

export const themes: Theme[] = [
  classic,
  studio,
  midnight,
  editorial,
  neobrutalism,
  terminal,
];
