export type PlatformTemplateKey =
    | "otp"
    | "invitation"
    | "ticket-created"
    | "ticket-reply"
    | "ticket-requester-message";

export type PlatformTemplateVariables = {
    otp: { otp: string };
    invitation: {
        teamName: string;
        inviterName?: string;
        expiresAt: string;
        acceptUrl: string;
        inviteeEmail: string;
    };
    "ticket-created": { subject: string; ticketUrl: string };
    "ticket-reply": {
        replyText: string;
        ticketUrl: string;
        sourcesText: string;
    };
    "ticket-requester-message": { inboxUrl: string };
};

/** Neutral style lifted from SendLit's `system:blank` starter, without a footer. */
export const PLATFORM_TEMPLATE_STYLE = {
    colors: {
        background: "#ffffff",
        foreground: "#111827",
        border: "#ffffff",
        accent: "#2563eb",
        accentForeground: "#ffffff",
    },
    typography: {
        header: {
            fontFamily: "Helvetica, sans-serif",
            letterSpacing: "0px",
            textTransform: "none",
            textDecoration: "none",
        },
        text: {
            fontFamily: "Helvetica, sans-serif",
            fontSize: "16px",
            lineHeight: "1.7",
            letterSpacing: "0px",
            textTransform: "none",
            textDecoration: "none",
        },
        link: {
            fontFamily: "Helvetica, sans-serif",
            fontSize: "14px",
            lineHeight: "1.5",
            letterSpacing: "0px",
            textTransform: "none",
            textDecoration: "none",
        },
    },
    interactives: {
        button: {
            padding: { x: "20px", y: "10px" },
            border: { width: "0px", radius: "8px", style: "solid" },
        },
        link: { padding: { x: "0px", y: "0px" } },
    },
    structure: {
        page: {
            background: "#ffffff",
            foreground: "#111827",
            width: "640px",
            marginY: "24px",
            borderWidth: "0px",
            borderStyle: "solid",
            borderRadius: "0px",
        },
        section: { padding: { x: "32px", y: "18px" } },
    },
} as const;

function textDocument(
    previewText: string,
    content: Array<Record<string, unknown>>,
): Record<string, unknown> {
    return {
        style: PLATFORM_TEMPLATE_STYLE,
        meta: { previewText },
        content,
    };
}

function text(content: string): Record<string, unknown> {
    return { blockType: "text", settings: { content } };
}

function link(text: string, url: string): Record<string, unknown> {
    return {
        blockType: "link",
        settings: { text, url, isButton: true },
    };
}

export type PlatformTemplateDefinition = {
    key: PlatformTemplateKey;
    title: string;
    content: Record<string, unknown>;
};

export const PLATFORM_TEMPLATES: readonly PlatformTemplateDefinition[] = [
    {
        key: "otp",
        title: "FrontLit: Sign-in code",
        content: textDocument("Your FrontLit verification code", [
            text(
                "Enter this code to sign in to FrontLit:\n\n## {{ otp | escape }}",
            ),
        ]),
    },
    {
        key: "invitation",
        title: "FrontLit: Team invitation",
        content: textDocument(
            "You've been invited to join a team on FrontLit",
            [
                text(`{% if inviterName %}{{ inviterName | escape }} invited you{% else %}You've been invited{% endif %} to join {{ teamName | escape }} on FrontLit.

You've been invited to collaborate on this team.

This invitation expires on {{ expiresAt | escape }}.

Sign in with {{ inviteeEmail | escape }}, then accept the invitation.`),
                link("Accept invitation", "{{ acceptUrl | escape }}"),
            ],
        ),
    },
    {
        // Reuses the former generic notification title so existing platform
        // teams receive an in-place repair rather than an orphaned shell.
        key: "ticket-created",
        title: "FrontLit: Support notification",
        content: textDocument("We received your FrontLit support request", [
            text(`Thanks — we received your support request. Reply to this email to continue the conversation.

Subject: {{ subject | escape }}`),
            link("View the ticket", "{{ ticketUrl | escape }}"),
        ]),
    },
    {
        key: "ticket-reply",
        title: "FrontLit: Support reply",
        content: textDocument("You have a new FrontLit support reply", [
            text(`{{ replyText | escape | newline_to_br }}
{% if sourcesText %}

Sources
{{ sourcesText | escape | newline_to_br }}
{% endif %}`),
            text("Reply to this email, or view the ticket."),
            link("View the ticket", "{{ ticketUrl | escape }}"),
        ]),
    },
    {
        key: "ticket-requester-message",
        title: "FrontLit: New ticket message",
        content: textDocument(
            "A requester sent a new FrontLit support message",
            [
                text("A new message was received on a support ticket."),
                link("View in the inbox", "{{ inboxUrl | escape }}"),
            ],
        ),
    },
];

export function templateDefinition(
    key: PlatformTemplateKey,
): PlatformTemplateDefinition {
    const found = PLATFORM_TEMPLATES.find((entry) => entry.key === key);
    if (!found) throw new Error(`unknown platform template ${key}`);
    return found;
}
