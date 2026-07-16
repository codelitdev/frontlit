import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/** Symmetric encryption for secrets stored in jsonb config columns (e.g. a
 * GitHub PAT in `integrations.config` — architecture.md §8.1). Never log or
 * return these values verbatim over the API. */
function deriveKey(): Buffer {
    const secret = process.env.INTEGRATIONS_ENCRYPTION_KEY || process.env.BETTER_AUTH_SECRET;
    if (!secret) {
        throw new Error("INTEGRATIONS_ENCRYPTION_KEY or BETTER_AUTH_SECRET must be set to store integration secrets");
    }
    return scryptSync(secret, "frontlit-integrations", 32);
}

export function encryptSecret(plaintext: string): string {
    const key = deriveKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(".");
}

export function decryptSecret(payload: string): string {
    const [ivB64, tagB64, dataB64] = payload.split(".");
    const key = deriveKey();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
