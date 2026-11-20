import { parseExpressionAt, type Expression } from "acorn";

/**
 * Evaluates a prop expression made only of literals: strings, numbers,
 * booleans, null, arrays and objects. Anything else (identifiers, calls,
 * template expressions, spreads) throws: Markdown never runs code.
 */
export function evaluateLiteral(source: string): unknown {
  const expression = parseExpressionAt(source, 0, { ecmaVersion: "latest" });
  if (source.slice(expression.end).trim()) throw new Error("Unexpected input.");
  return evaluate(expression);
}

function evaluate(node: Expression): unknown {
  switch (node.type) {
    case "Literal":
      if (
        node.value === null ||
        ["string", "number", "boolean"].includes(typeof node.value)
      )
        return node.value;
      break;
    case "TemplateLiteral":
      if (!node.expressions.length) return node.quasis[0].value.cooked;
      break;
    case "UnaryExpression":
      if (
        node.operator === "-" &&
        node.argument.type === "Literal" &&
        typeof node.argument.value === "number"
      )
        return -node.argument.value;
      break;
    case "ArrayExpression":
      return node.elements.map((element) => {
        if (!element || element.type === "SpreadElement")
          throw new Error("Not literal.");
        return evaluate(element);
      });
    case "ObjectExpression": {
      const output: Record<string, unknown> = {};
      for (const property of node.properties) {
        if (
          property.type !== "Property" ||
          property.kind !== "init" ||
          property.computed ||
          property.method ||
          property.shorthand
        )
          throw new Error("Not literal.");
        const key =
          property.key.type === "Identifier"
            ? property.key.name
            : property.key.type === "Literal" && typeof property.key.value === "string"
              ? property.key.value
              : undefined;
        if (key === undefined || key === "__proto__" || Object.hasOwn(output, key))
          throw new Error("Not literal.");
        output[key] = evaluate(property.value as Expression);
      }
      return output;
    }
  }
  throw new Error("Not literal.");
}

/** A JS string literal, single-quoted when that avoids escaping double quotes. */
export function quote(value: string): string {
  return value.includes('"') && !/['\\\n]/.test(value)
    ? `'${value}'`
    : JSON.stringify(value);
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
/** Writes a literal as JS source (the inverse of `evaluateLiteral`). */
export function writeLiteral(value: unknown): string {
  if (typeof value === "string") return quote(value);
  if (value === null || typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value)) return `[${value.map(writeLiteral).join(", ")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, item]) =>
        `${IDENTIFIER.test(key) ? key : JSON.stringify(key)}: ${writeLiteral(item)}`,
    );
    return entries.length ? `{ ${entries.join(", ")} }` : "{}";
  }
  throw new Error(`Cannot write ${typeof value} as a literal.`);
}
