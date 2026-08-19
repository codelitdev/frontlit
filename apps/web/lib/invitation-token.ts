const storageKey = (invitationId: string) =>
    `frontlit.invitation.${invitationId}.token`;

export function readInvitationTokenFromHash(hash: string): string | null {
    const value = hash.startsWith("#") ? hash.slice(1) : hash;
    const params = new URLSearchParams(value);
    const token = params.get("token");
    return token && token.length > 0 ? token : null;
}

export function persistInvitationToken(invitationId: string, token: string) {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(storageKey(invitationId), token);
}

export function peekInvitationToken(invitationId: string): string | null {
    if (typeof sessionStorage === "undefined" || !invitationId) return null;
    return sessionStorage.getItem(storageKey(invitationId));
}

export function takeInvitationToken(invitationId: string): string | null {
    const token = peekInvitationToken(invitationId);
    if (token) clearInvitationToken(invitationId);
    return token;
}

export function clearInvitationToken(invitationId: string) {
    if (typeof sessionStorage === "undefined" || !invitationId) return;
    sessionStorage.removeItem(storageKey(invitationId));
}

export function clearInvitationHash(url: string): string {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.pathname + parsed.search;
}
