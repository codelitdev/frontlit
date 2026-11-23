import React from "react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import type { NodeProps } from "@tiptap/static-renderer";
import type { TypeTableRow } from "../docs/blocks";
import { DocsTabs } from "./docs-tabs";

type BlockProps = NodeProps<ProseMirrorNode, React.ReactNode>;

const childAttrs = (node: ProseMirrorNode) => {
  const attrs: Record<string, any>[] = [];
  node.forEach((child) => {
    attrs.push(child.attrs);
  });
  return attrs;
};

export function CodeGroup({ node, children }: BlockProps) {
  const labels = childAttrs(node).map(
    (attrs, index) => attrs.title ?? attrs.language ?? `Code ${index + 1}`,
  );
  return (
    <DocsTabs className="te-tabs te-code-group" labels={labels}>
      {children}
    </DocsTabs>
  );
}

export function Cards({ children }: BlockProps) {
  return <div className="te-cards">{children}</div>;
}

/** Card icons are lucide names, written in Fumadocs as `<BookOpen />`. */
const iconName = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Za-z])([0-9])/g, "$1-$2")
    .toLowerCase() as IconName;

export function Card({ node, children }: BlockProps) {
  const { title, href, icon } = node.attrs;
  const body = (
    <>
      {icon && (
        <DynamicIcon name={iconName(icon)} className="te-card__icon" aria-hidden />
      )}
      <span className="te-card__title">{title}</span>
      {node.childCount > 0 && <div className="te-card__body">{children}</div>}
    </>
  );
  return href ? (
    <a className="te-card" href={href}>
      {body}
    </a>
  ) : (
    <div className="te-card">{body}</div>
  );
}

export function TypeTable({ node }: BlockProps) {
  const rows = (node.attrs.rows ?? []) as TypeTableRow[];
  return (
    <div className="te-type-table">
      <table>
        <thead>
          <tr>
            <th>Prop</th>
            <th>Type</th>
            <th>Default</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td>
                <code>{row.name}</code>
                {row.required && (
                  <span className="te-type-table__required"> (required)</span>
                )}
              </td>
              <td>
                <code>{row.type}</code>
              </td>
              <td>{row.default === null ? "—" : <code>{row.default}</code>}</td>
              <td>{row.description ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Renderers of the docs-only blocks; the library renders Callout, Tabs, Steps and Accordion. */
export const docsBlockMapping = {
  codeGroup: CodeGroup,
  cards: Cards,
  card: Card,
  typeTable: TypeTable,
};
