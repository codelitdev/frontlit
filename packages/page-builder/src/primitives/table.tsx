import type React from "react";
import type { ThemeStyle } from "../models";
import { cn } from "./lib/utils";

export interface TableColumn {
  key: string;
  label: string;
  className?: string;
}

export interface TableProps {
  columns: TableColumn[];
  rows: Record<string, React.ReactNode>[];
  theme?: ThemeStyle;
  className?: string;
}

/**
 * A themed data table. On narrow screens each row stacks into a block, with
 * the column name shown before every value.
 */
export function Table({ columns, rows, theme, className }: TableProps) {
  const typography = theme?.typography?.text2;
  const card = theme?.interactives?.card;
  const text = cn(
    typography?.fontFamily,
    typography?.fontSize ?? "text-sm",
    typography?.lineHeight,
    typography?.letterSpacing,
  );
  return (
    <div
      className={cn(
        "w-full min-w-0 overflow-hidden border border-border",
        card?.border?.radius ?? "rounded-md",
        className,
      )}
    >
      <table className={cn("block w-full border-collapse md:table", text)}>
        <thead className="hidden md:table-header-group">
          <tr className="border-b border-border bg-muted/50">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "px-3 py-2 text-left font-medium text-muted-foreground",
                  column.className,
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="block md:table-row-group">
          {rows.map((row, index) => (
            <tr
              key={index}
              className="block border-b border-border px-3 py-2 last:border-b-0 md:table-row md:p-0"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  data-label={column.label}
                  className={cn(
                    "block min-w-0 break-words py-1 align-top text-foreground before:mr-2 before:text-muted-foreground before:content-[attr(data-label)':'] md:table-cell md:px-3 md:py-2 md:before:content-none",
                    column.className,
                  )}
                >
                  {row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
