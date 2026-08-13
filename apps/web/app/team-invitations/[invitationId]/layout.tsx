import type { Metadata } from "next";

export const metadata: Metadata = {
    referrer: "no-referrer",
};

export default function InvitationLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-background">
            <meta name="referrer" content="no-referrer" />
            {children}
        </div>
    );
}
