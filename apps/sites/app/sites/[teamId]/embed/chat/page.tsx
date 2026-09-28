import { getChatbotSettings } from "@/lib/api";
import { API_PUBLIC_URL } from "@/lib/config";
import { loadSiteTheme } from "@/lib/load-site-theme";
import { ChatPanel } from "@/components/chat-panel";

export default async function EmbedChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ layout?: string }>;
}) {
  const { teamId } = await params;
  const { layout: layoutParam } = await searchParams;
  const [settings, siteTheme] = await Promise.all([
    getChatbotSettings(teamId),
    loadSiteTheme(teamId),
  ]);
  const layout = layoutParam === "docked" ? "docked" : "panel";
  const style = settings?.widgetStyle;

  return (
    <>
      {layout === "docked" && (
        // Parent page should show through around the docked composer/sheet.

        <style
          dangerouslySetInnerHTML={{
            __html: "html,body{background:transparent!important;}",
          }}
        />
      )}
      <div
        className={
          layout === "docked"
            ? "flex h-dvh min-h-0 flex-col overflow-hidden bg-transparent"
            : "flex h-dvh min-h-0 flex-col overflow-hidden bg-background"
        }
      >
        <ChatPanel
          apiBaseUrl={API_PUBLIC_URL}
          teamId={teamId}
          name={settings?.name || "Assistant"}
          greeting={settings?.greeting ?? null}
          accentColor={settings?.accentColor ?? null}
          themeId={siteTheme.themeId}
          themeStyle={siteTheme.themeStyle}
          layout={layout}
          placeholder={style?.inputPlaceholder || "Ask a question…"}
          inputRadius={style?.inputRadius ?? "full"}
          inputWidth={style?.inputWidth ?? "md"}
        />
      </div>
    </>
  );
}
