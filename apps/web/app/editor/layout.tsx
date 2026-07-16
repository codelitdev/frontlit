import { requireAuth } from "@/lib/server-auth";

export default async function EditorLayout({ children }: { children: React.ReactNode }) {
    await requireAuth();
    return children;
}
