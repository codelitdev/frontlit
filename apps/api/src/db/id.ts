import { customAlphabet } from "nanoid";
import { uuidv7 } from "uuidv7";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const nanoid = customAlphabet(alphabet, 24);

/** Internal, time-ordered surrogate primary key — never exposed to API/MCP consumers. */
export function genId(): string {
    return uuidv7();
}

/** Public-facing id, e.g. `team_a1b2c3...`. The only id ever exposed outside the DB layer. */
export function genPublicId(prefix: string): string {
    return `${prefix}_${nanoid()}`;
}
