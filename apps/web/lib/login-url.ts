type LoginUrlInput = { apiPublicUrl: string; webClient: string };

export function getWebLoginUrl({ apiPublicUrl, webClient }: LoginUrlInput): string {
    return `${apiPublicUrl}/login?redirect=${encodeURIComponent(`${webClient}/`)}`;
}
