import type { FaqSettings } from "./settings";
import { generateUniqueId } from "../../utils";

export const faqDefaults: Partial<FaqSettings> = {
    title: "Frequently asked questions",
    headerAlignment: "left",
    items: [
        {
            id: generateUniqueId(),
            question: "What can I build with FrontLit?",
            answer: "A marketing website, articles, documentation, product updates, customer support, and email — all from one connected dashboard.",
        },
        {
            id: generateUniqueId(),
            question: "Do I need to know how to code?",
            answer: "No. Every page is assembled from ready-made blocks like this one, and you can customize copy, media and layout without touching code.",
        },
        {
            id: generateUniqueId(),
            question: "Can I use my own domain?",
            answer: "Yes, every FrontLit site can be connected to a custom domain in a few clicks.",
        },
        {
            id: generateUniqueId(),
            question: "Is there a free plan?",
            answer: "Yes, you can get started for free and upgrade as your audience grows.",
        },
    ],
};
