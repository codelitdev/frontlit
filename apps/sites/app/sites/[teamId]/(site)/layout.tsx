import { getChatbotSettings, getSettings } from "@/lib/api";
import { API_PUBLIC_URL } from "@/lib/config";
import { loadSiteTheme } from "@/lib/load-site-theme";
import { CodeInjector } from "@/components/code-injector";
import { ChatWidget } from "@/components/chat-widget";
import { WebVitalsBeacon } from "@/components/web-vitals-beacon";

/** The public site: the team's code injection and floating chat widget.
 * `/embed` lives outside this group so the chat iframe gets neither
 * (architecture.md §12.5/§7.3). */
export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const [settings, chatbot, siteTheme] = await Promise.all([
    getSettings(teamId),
    getChatbotSettings(teamId),
    loadSiteTheme(teamId),
  ]);

  return (
    <>
      <CodeInjector
        head={settings?.codeInjectionHead}
        body={settings?.codeInjectionBody}
      />
      {children}
      {process.env.SITE_RUM !== "off" && (
        <WebVitalsBeacon endpoint={`${API_PUBLIC_URL}/rum`} />
      )}
      {chatbot?.enabled && (
        <ChatWidget
          apiBaseUrl={API_PUBLIC_URL}
          teamId={teamId}
          name={chatbot.name}
          greeting={chatbot.greeting ?? null}
          accentColor={chatbot.accentColor}
          variant={chatbot.variant ?? "bubble"}
          widgetStyle={chatbot.widgetStyle}
          themeId={siteTheme.themeId}
          themeStyle={siteTheme.themeStyle}
        />
      )}
    </>
  );
}
