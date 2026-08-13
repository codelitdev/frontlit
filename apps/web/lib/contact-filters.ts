import type {
    ContactFilterDefinition,
    ContactFilterWithAggregator,
} from "@sendlit/email-blocks";
import type { ContactFilter, Segment } from "./api";

export const EMPTY_CONTACT_FILTER: ContactFilterWithAggregator = {
    aggregator: "and",
    filters: [],
};

/** SendLit's built-in contact filters, aligned with `POST /sequences` and
 * `GET /contacts?filter=`. Host-specific definitions (community, products)
 * stay out — FrontLit contacts only have email, tags, subscription, and
 * signup date. */
export const SENDLIT_CONTACT_FILTER_DEFINITIONS: ContactFilterDefinition[] = [
    {
        name: "email",
        label: "Email",
        conditions: [
            { value: "is", label: "is exactly" },
            { value: "contains", label: "contains" },
            { value: "not_contains", label: "does not contain" },
        ],
        valueInput: {
            type: "text",
            label: "Email value",
            placeholder: "e.g. example.com",
        },
    },
    {
        name: "tag",
        label: "Tag",
        conditions: [
            { value: "is", label: "is" },
            { value: "is_not", label: "is not" },
        ],
        valueInput: {
            type: "text",
            label: "Tag",
            placeholder: "e.g. frontlit",
        },
    },
    {
        name: "subscription",
        label: "Subscription",
        conditions: [{ value: "is", label: "is" }],
        valueInput: {
            type: "select",
            label: "Status",
            placeholder: "Select status",
            options: [
                { value: "subscribed", label: "Subscribed" },
                { value: "unsubscribed", label: "Unsubscribed" },
            ],
        },
    },
    {
        name: "signedUp",
        label: "Signed up",
        conditions: [
            { value: "after", label: "after" },
            { value: "before", label: "before" },
            { value: "on", label: "on" },
        ],
        valueInput: {
            type: "date",
            label: "Signup date",
            dateValueFormat: "date",
        },
    },
];

export function toContactFilter(
    value: ContactFilter | ContactFilterWithAggregator | null | undefined,
): ContactFilterWithAggregator {
    if (!value || !Array.isArray(value.filters)) return EMPTY_CONTACT_FILTER;
    return {
        aggregator: value.aggregator === "or" ? "or" : "and",
        filters: value.filters.map((item) => ({
            name: item.name,
            condition: item.condition,
            ...(item.value === undefined ? {} : { value: item.value }),
            ...(item.key === undefined ? {} : { key: item.key }),
            ...(item.valueLabel === undefined
                ? {}
                : { valueLabel: item.valueLabel }),
        })),
    };
}

export function serializeContactFilter(
    value: ContactFilterWithAggregator,
): string | undefined {
    if (value.filters.length === 0) return undefined;
    return JSON.stringify(value);
}

export function segmentsToFilterSegments(segments: Segment[]) {
    return segments.map((segment) => ({
        id: segment.segmentId,
        name: segment.name,
        filter: toContactFilter(segment.filter),
    }));
}
