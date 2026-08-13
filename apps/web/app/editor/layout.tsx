import { requireAuth } from "@/lib/server-auth";
import { EditorAccessGate } from "@/components/workspace/editor-access-gate";

export default async function EditorLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requireAuth();
    return <EditorAccessGate>{children}</EditorAccessGate>;
}
