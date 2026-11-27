import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getChatbotSettings } from "@/lib/api";
import { API_PUBLIC_URL } from "@/lib/config";
import { loadSiteTheme } from "@/lib/load-site-theme";
import { ChatPanel } from "@/components/chat-panel";

interface Props {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ layout?: string }>;
}

/** The chat UI the embed loader iframes, at `embed.<domain>/<teamId>/chat`
 * (proxy.ts). `?layout=` is read per request; the settings behind it are
 * cached. */
export default function EmbedChatPage(props: Props) {
  return (
    <Suspense fallback={null}>
      <EmbedChat {...props} />
    </Suspense>
  );
}

async function EmbedChat({ params, searchParams }: Props) {
  const [{ teamId }, { layout: layoutParam }] = await Promise.all([
    params,
    searchParams,
  ]);
  const [settings, siteTheme] = await Promise.all([
    getChatbotSettings(teamId),
    loadSiteTheme(teamId),
  ]);
  if (!settings?.enabled) notFound();
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
