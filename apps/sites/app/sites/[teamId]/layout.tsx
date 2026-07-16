import type { Metadata } from "next";
import { headers } from "next/headers";
import { getChatbotSettings, getSettings } from "@/lib/api";
import { CodeInjector } from "@/components/code-injector";
import { ChatWidget } from "@/components/chat-widget";

export async function generateMetadata({ params }: { params: Promise<{ teamId: string }> }): Promise<Metadata> {
    const { teamId } = await params;
    const settings = await getSettings(teamId);
    const siteTitle = settings?.title || "FrontLit site";
    const logoUrl = (settings?.logo?.url as string | undefined) ?? null;

    return {
        title: { template: `%s | ${siteTitle}`, default: siteTitle },
        description: settings?.subtitle ?? undefined,
        applicationName: "FrontLit",
        generator: "FrontLit",
        icons: logoUrl ? { icon: logoUrl } : undefined,
        openGraph: { siteName: siteTitle, images: logoUrl ? [{ url: logoUrl }] : undefined },
    };
}

export default async function TenantLayout({ children, params }: { children: React.ReactNode; params: Promise<{ teamId: string }> }) {
    const { teamId } = await params;
    const isEmbed = (await headers()).get("x-frontlit-embed") === "1";
    if (isEmbed) return <>{children}</>;

    const [settings, chatbot] = await Promise.all([getSettings(teamId), getChatbotSettings(teamId)]);

    return (
        <>
            <CodeInjector head={settings?.codeInjectionHead} body={settings?.codeInjectionBody} />
            {children}
            {chatbot?.enabled && <ChatWidget name={chatbot.name} accentColor={chatbot.accentColor} />}
        </>
    );
}
