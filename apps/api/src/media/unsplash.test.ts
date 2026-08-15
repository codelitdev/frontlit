import { describe, expect, it } from "vitest";
import { mapUnsplashResults } from "./unsplash";

describe("Unsplash mapping", () => {
    it("keeps photos that have a usable URL", () => {
        expect(
            mapUnsplashResults({
                results: [
                    {
                        id: "abc",
                        alt_description: "A lake",
                        urls: {
                            small: "https://images.unsplash.com/small",
                            regular: "https://images.unsplash.com/regular",
                        },
                        user: { name: "Ada" },
                    },
                    { id: "missing-url" },
                ],
            }),
        ).toEqual([
            {
                id: "abc",
                alt: "A lake",
                thumbUrl: "https://images.unsplash.com/small",
                url: "https://images.unsplash.com/regular",
                photographer: "Ada",
            },
        ]);
    });
});
