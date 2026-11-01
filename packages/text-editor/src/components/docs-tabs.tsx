"use client";

import React, { useId, useState } from "react";

/**
 * Tab switching for docs Tabs and Code groups; the only client part of them.
 * Every panel is server-rendered, so hidden tabs stay in the page for search.
 */
export function DocsTabs({
  labels,
  children,
  className,
}: {
  labels: string[];
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const [active, setActive] = useState(0);
  const panels = React.Children.toArray(children);

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + labels.length) % labels.length;
    setActive(next);
    document.getElementById(`${id}-tab-${next}`)?.focus();
  }

  return (
    <div className={className}>
      <div role="tablist" className="te-tabs__list">
        {labels.map((label, index) => (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: labels may repeat or be empty.
            key={index}
            id={`${id}-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={index === active}
            aria-controls={`${id}-panel-${index}`}
            tabIndex={index === active ? 0 : -1}
            className="te-tabs__tab"
            onClick={() => setActive(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {label}
          </button>
        ))}
      </div>
      {panels.map((panel, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: panels follow their tab's position.
          key={index}
          id={`${id}-panel-${index}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${index}`}
          hidden={index !== active}
          className="te-tabs__panel"
        >
          {panel}
        </div>
      ))}
    </div>
  );
}
