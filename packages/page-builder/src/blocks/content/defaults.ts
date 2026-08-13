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
                        text: "FrontLit brings your website, content, customer support, and audience engagement into one connected front office.",
                    },
                ],
            },
        ],
    },
    alignment: "left",
    headerAlignment: "left",
    mediaRadius: 3,
};
