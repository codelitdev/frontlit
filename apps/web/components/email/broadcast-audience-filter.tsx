"use client";

import { useEffect, useState } from "react";
import type { ContactFilterWithAggregator } from "@sendlit/email-blocks";
import { listContacts, type ContactFilter } from "@/lib/api";
import { ContactAudienceFilter } from "@/components/contacts/contact-audience-filter";
import {
  EMPTY_CONTACT_FILTER,
  serializeContactFilter,
  toContactFilter,
} from "@/lib/contact-filters";

export function BroadcastAudienceFilter({
  value,
  onChange,
  disabled,
}: {
  value: ContactFilter | ContactFilterWithAggregator | null | undefined;
  onChange: (value: ContactFilterWithAggregator) => void;
  disabled?: boolean;
}) {
  const filter = toContactFilter(value);
  const [count, setCount] = useState<number | undefined>(undefined);
  const serializedFilter = serializeContactFilter(filter);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      listContacts({
        filter: serializedFilter,
        itemsPerPage: 1,
      })
        .then((result) => {
          if (!cancelled) setCount(result.total);
        })
        .catch(() => {
          if (!cancelled) setCount(undefined);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [serializedFilter]);

  return (
    <ContactAudienceFilter
      value={filter}
      onChange={onChange}
      count={count}
      countLabel="recipients"
      disabled={disabled}
    />
  );
}

export { EMPTY_CONTACT_FILTER };
