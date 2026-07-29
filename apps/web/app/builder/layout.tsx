import { requireAuth } from "@/lib/server-auth";

export default async function BuilderLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requireAuth();
    return children;
}
