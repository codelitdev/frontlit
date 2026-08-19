import { describe, expect, it } from "vitest";
import {
    clearInvitationHash,
    persistInvitationToken,
    peekInvitationToken,
    readInvitationTokenFromHash,
    takeInvitationToken,
} from "./invitation-token";

describe("invitation token helpers", () => {
    it("reads the raw secret from the URL fragment only", () => {
        expect(readInvitationTokenFromHash("#token=super-secret&x=1")).toBe(
            "super-secret",
        );
        expect(readInvitationTokenFromHash("")).toBeNull();
    });

    it("stores the secret in session storage and removes it after take", () => {
        const store = new Map<string, string>();
        const memory = {
            setItem(key: string, value: string) {
                store.set(key, value);
            },
            getItem(key: string) {
                return store.get(key) ?? null;
            },
            removeItem(key: string) {
                store.delete(key);
            },
        };
        Object.defineProperty(globalThis, "sessionStorage", {
            value: memory,
            configurable: true,
        });
        persistInvitationToken("tinv_1", "raw-token");
        expect(peekInvitationToken("tinv_1")).toBe("raw-token");
        expect(peekInvitationToken("tinv_1")).toBe("raw-token");
        expect(takeInvitationToken("tinv_1")).toBe("raw-token");
        expect(takeInvitationToken("tinv_1")).toBeNull();
    });

    it("strips the fragment from browser-visible URLs", () => {
        expect(
            clearInvitationHash(
                "https://app.frontlit.dev/team-invitations/tinv_1#token=secret",
            ),
        ).toBe("/team-invitations/tinv_1");
    });
});
