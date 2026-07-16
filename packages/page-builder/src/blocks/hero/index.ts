import type { Widget } from "../../models";
import { heroMetadata } from "./metadata";
import { HeroWidget } from "./widget";
import { HeroEditor } from "./editor";
import { heroDefaults } from "./defaults";
import type { HeroSettings } from "./settings";

export * from "./settings";

export const Hero: Widget<HeroSettings> = {
    metadata: heroMetadata,
    widget: HeroWidget,
    editor: HeroEditor,
    getDefaultSettings: () => heroDefaults,
    layouts: [
        { id: "normal", name: "Standard" },
        { id: "card", name: "Card" },
        { id: "centered", name: "Centered" },
        { id: "media-below", name: "Media below" },
    ],
};
