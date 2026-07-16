import type { ContentSettings } from "./settings";

export const contentDefaults: Partial<ContentSettings> = {
    title: "One dashboard, every channel",
    body: {
        type: "doc",
        content: [
            {
                type: "paragraph",
                content: [
                    {
                        type: "text",
                        text: "FrontLit lets you launch a marketing site, run a blog, staff a help desk, send a newsletter and publish a changelog — all without stitching together five different tools.",
                    },
                ],
            },
        ],
    },
    alignment: "left",
    headerAlignment: "left",
    mediaRadius: 3,
};
