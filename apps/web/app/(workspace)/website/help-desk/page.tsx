"use client";

import { useEffect, useState } from "react";
import { getInboxAiSettings, type InboxAiSettings } from "@/lib/api";
import { PageHeader } from "@/components/workspace/page-header";
import { Loading } from "@/components/workspace/loading";
import { ScrollablePage } from "@/components/workspace/scrollable-page";
import { Card, CardContent } from "@/components/ui/codelit/card";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";
import { InboxAiPolicyForm } from "@/components/workspace/inbox-ai-policy-form";

export default function HelpDeskPage() {
  useSetBreadcrumb([
    { label: "Website", href: "/website?tab=pages" },
    { label: "Help desk" },
  ]);
  const [settings, setSettings] = useState<InboxAiSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getInboxAiSettings()
      .then(setSettings)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !settings) {
    return (
      <ScrollablePage>
        <Loading />
      </ScrollablePage>
    );
  }

  return (
    <ScrollablePage>
      <div className="max-w-2xl space-y-6">
        <PageHeader
          title="Help desk"
          description="Auto-reply and escalation for form, email, API, and MCP tickets."
        />
        <Card>
          <CardContent className="space-y-5 pt-6">
            <InboxAiPolicyForm
              channel="tickets"
              initial={settings.channels.tickets}
              aiConfigured={settings.aiConfigured}
            />
          </CardContent>
        </Card>
      </div>
    </ScrollablePage>
  );
}
