import type { PricingSettings } from "./settings";

export const pricingDefaults: Partial<PricingSettings> = {
    title: "Simple, transparent pricing",
    headerAlignment: "center",
    tiers: [
        {
            name: "Starter",
            price: "$0/mo",
            description: "For hobby sites and side projects.",
            features: ["1 website", "FrontLit branding", "Community support"],
            buttonCaption: "Get started",
            buttonAction: "#",
        },
        {
            name: "Pro",
            price: "$29/mo",
            description: "For growing businesses that need more.",
            features: [
                "5 websites",
                "Custom domain",
                "Blog + Email",
                "Priority support",
            ],
            buttonCaption: "Start free trial",
            buttonAction: "#",
            highlighted: true,
        },
        {
            name: "Business",
            price: "$79/mo",
            description: "For teams that need scale and control.",
            features: [
                "Unlimited websites",
                "Help desk & chatbot",
                "Team seats",
                "Dedicated support",
            ],
            buttonCaption: "Contact sales",
            buttonAction: "#",
        },
    ],
};
