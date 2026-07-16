import { getChatbotSettings } from "@/lib/api";
import { API_PUBLIC_URL } from "@/lib/config";
import { ChatPanel } from "@/components/chat-panel";

export default async function EmbedChatPage({ params }: { params: Promise<{ teamId: string }> }) {
    const { teamId } = await params;
    const settings = await getChatbotSettings(teamId);

    return (
        <div className="flex h-screen flex-col bg-white">
            <ChatPanel
                apiBaseUrl={API_PUBLIC_URL}
                teamId={teamId}
                name={settings?.name || "Assistant"}
                greeting={settings?.greeting ?? null}
                accentColor={settings?.accentColor ?? null}
            />
        </div>
    );
}
