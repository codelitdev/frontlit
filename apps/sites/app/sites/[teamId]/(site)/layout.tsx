import { getSettings } from "@/lib/api";
import { API_PUBLIC_URL } from "@/lib/config";
import { getWidgetConfig } from "@/lib/embed-config";
import { CodeInjector } from "@/components/code-injector";
import { ChatLoader } from "@/components/chat-loader";
import { WebVitalsBeacon } from "@/components/web-vitals-beacon";

/** The public site: the team's code injection and the chat widget loader.
 * The chat iframe lives on the embed host (app/embed), outside every team
 * site (docs/embedded-support.md §6.3). */
export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const [settings, chatConfig] = await Promise.all([
    getSettings(teamId),
    getWidgetConfig(teamId),
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
      {chatConfig?.enabled && <ChatLoader teamId={teamId} config={chatConfig} />}
    </>
  );
}
