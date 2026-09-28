"use client";

import { useEffect, useState } from "react";
import {
  ContactFilterBuilder,
  type ContactFilterSegment,
  type ContactFilterWithAggregator,
} from "@sendlit/email-blocks";
import { ApiError } from "@/lib/api-client";
import {
  createSegment,
  deleteSegment,
  listSegments,
  type ContactFilter,
} from "@/lib/api";
import {
  SENDLIT_CONTACT_FILTER_DEFINITIONS,
  segmentsToFilterSegments,
  toContactFilter,
} from "@/lib/contact-filters";

export function ContactAudienceFilter({
  value,
  onChange,
  count,
  countLabel = "contacts",
  disabled,
  className,
}: {
  value: ContactFilter | ContactFilterWithAggregator | null | undefined;
  onChange: (value: ContactFilterWithAggregator) => void;
  count?: number;
  countLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const filter = toContactFilter(value);
  const [segments, setSegments] = useState<ContactFilterSegment[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState("");

  useEffect(() => {
    listSegments()
      .then((result) => setSegments(segmentsToFilterSegments(result.items)))
      .catch(() => setSegments([]));
  }, []);

  return (
    <ContactFilterBuilder
      className={className}
      value={filter}
      onChange={(next) => {
        setSelectedSegmentId("");
        onChange(next);
      }}
      filterDefinitions={SENDLIT_CONTACT_FILTER_DEFINITIONS}
      segments={segments}
      selectedSegmentId={selectedSegmentId}
      onSegmentSelect={(segment) => {
        setSelectedSegmentId(segment.id);
        onChange(segment.filter);
      }}
      onSaveSegment={async (name, savedFilter) => {
        const created = await createSegment({
          name,
          filter: savedFilter,
        });
        const next: ContactFilterSegment = {
          id: created.segmentId,
          name: created.name,
          filter: toContactFilter(created.filter),
        };
        setSegments((current) => [...current, next]);
        setSelectedSegmentId(next.id);
      }}
      onDeleteSegment={async (segment) => {
        try {
          await deleteSegment(segment.id);
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 404)) {
            throw err;
          }
        }
        setSegments((current) => current.filter((item) => item.id !== segment.id));
        if (selectedSegmentId === segment.id) setSelectedSegmentId("");
      }}
      count={count}
      countLabel={countLabel}
      defaultSegmentLabel="Everyone"
      disabled={disabled}
    />
  );
}
