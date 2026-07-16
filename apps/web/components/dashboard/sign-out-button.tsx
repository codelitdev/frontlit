"use client";

import { useRouter } from "next/navigation";

/**
 * A plain `<form action="/api/auth/sign-out">` also works (Better Auth's
 * sign-out endpoint doesn't require JS), but it lands the browser on the
 * endpoint's raw `{"success":true}` JSON response instead of navigating
 * anywhere — this fetches instead so we can redirect client-side.
 */
export function SignOutButton() {
    const router = useRouter();

    async function handleSignOut() {
        await fetch("/api/auth/sign-out", { method: "POST" });
        router.push("/login");
    }

    return (
        <button
            type="button"
            onClick={handleSignOut}
            className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-neutral-100"
        >
            Log out
        </button>
    );
}
