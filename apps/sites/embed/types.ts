/** Public widget settings: `GET embed.<domain>/<teamId>/config`, or inlined
 * by hosted sites (apps/sites/lib/embed-config.ts). */
export interface WidgetConfig {
  enabled: boolean;
  name?: string;
  variant?: "bubble" | "text_input";
  style?: {
    bubbleShape?: "circle" | "rounded" | "square";
    bubbleIcon?: "chat" | "message" | "sparkles" | "bot";
    bubbleSize?: "sm" | "md" | "lg";
    inputRadius?: "none" | "sm" | "md" | "lg" | "full";
    inputPlaceholder?: string | null;
    inputWidth?: "sm" | "md" | "lg";
  };
  colors?: {
    primary: string;
    primaryForeground: string;
    card: string;
    border: string;
    mutedForeground: string;
  };
  /** The chat iframe, always on the embed host. */
  chatUrl?: string;
}
