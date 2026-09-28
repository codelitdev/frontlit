import { describe, expect, it, vi } from "vitest";
import { loadDataSlots } from "@frontlit/page-builder/data-slots";

describe("generic page-builder data slots", () => {
  it("delegates each named slot to the host-owned loader", async () => {
    const loader = vi.fn(
      async ({ slot, instance, pageData }) =>
        `${slot}:${instance.settings?.source}:${pageData.teamId}`,
    );

    const result = await loadDataSlots(
      [
        {
          widgetId: "slot-1",
          name: "data-slot",
          deletable: false,
          moveable: true,
          shared: false,
          settings: {
            slot: "community.example-feed",
            source: "news",
          },
        },
      ],
      { "community.example-feed": loader },
      { pageType: "site", teamId: "team-1" },
    );

    expect(result).toEqual({
      "community.example-feed": "community.example-feed:news:team-1",
    });
    expect(loader).toHaveBeenCalledWith(
      expect.objectContaining({ slot: "community.example-feed" }),
    );
  });

  it("leaves unknown slots unresolved instead of coupling core to a host", async () => {
    await expect(
      loadDataSlots(
        [
          {
            widgetId: "slot-2",
            name: "data-slot",
            deletable: false,
            moveable: true,
            shared: false,
            settings: { slot: "another-app.resource" },
          },
        ],
        {},
        { pageType: "site" },
      ),
    ).resolves.toEqual({});
  });
});
