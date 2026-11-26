import React from "react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import type { NodeProps } from "@tiptap/static-renderer";
import type { TypeTableRow } from "../docs/blocks";
import { DocsTabs } from "./docs-tabs";
import {
  blocksTakingLabels,
  defaultTextEditorLabels,
  type TextEditorLabels,
} from "../labels";

type BlockProps = NodeProps<ProseMirrorNode, React.ReactNode>;

const childAttrs = (node: ProseMirrorNode) => {
  const attrs: Record<string, any>[] = [];
  node.forEach((child) => {
    attrs.push(child.attrs);
  });
  return attrs;
};

export function CodeGroup({
  node,
  children,
  labels = defaultTextEditorLabels,
}: BlockProps & { labels?: TextEditorLabels }) {
  const tabs = childAttrs(node).map(
    (attrs, index) => attrs.title ?? attrs.language ?? labels.codeTab(index + 1),
  );
  return (
    <DocsTabs className="te-tabs te-code-group" labels={tabs}>
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

export function TypeTable({
  node,
  labels = defaultTextEditorLabels,
}: BlockProps & { labels?: TextEditorLabels }) {
  const rows = (node.attrs.rows ?? []) as TypeTableRow[];
  return (
    <div className="te-type-table">
      <table>
        <thead>
          <tr>
            <th>{labels.typeTableProp}</th>
            <th>{labels.typeTableType}</th>
            <th>{labels.typeTableDefault}</th>
            <th>{labels.typeTableDescription}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td>
                <code>{row.name}</code>
                {row.required && (
                  <span className="te-type-table__required">{` ${labels.typeTableRequired}`}</span>
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
blocksTakingLabels.add(CodeGroup);
blocksTakingLabels.add(TypeTable);
