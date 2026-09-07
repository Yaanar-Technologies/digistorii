import crypto from "crypto";

/**
 * AES-256-GCM encryption for sensitive per-tenant secrets
 * (Razorpay key secrets, webhook secrets, etc.)
 *
 * Requires ENCRYPTION_KEY env var: a 32-byte key, base64-encoded.
 * Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 * Store it in your platform's env (NOT per-tenant) — this key encrypts
 * every tenant's secrets, so treat it like a master key: rotate carefully,
 * never commit it, never log it.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recommended for GCM
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
    const keyB64 = process.env.ENCRYPTION_KEY;
    if (!keyB64) {
        throw new Error(
            "ENCRYPTION_KEY env var is not set. Generate one with: " +
            "node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
        );
    }
    const key = Buffer.from(keyB64, "base64");
    if (key.length !== 32) {
        throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes.");
    }
    return key;
}

/**
 * Encrypts a plaintext string. Output format (single string, safe for a
 * TEXT column): base64(iv) + ":" + base64(authTag) + ":" + base64(ciphertext)
 */
export function encryptSecret(plaintext: string): string {
    if (plaintext === "" || plaintext === null || plaintext === undefined) {
        throw new Error("Cannot encrypt empty/null value.");
    }
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
        iv.toString("base64"),
        authTag.toString("base64"),
        encrypted.toString("base64"),
    ].join(":");
}

/**
 * Decrypts a string produced by encryptSecret. Throws if the payload was
 * tampered with (GCM auth tag mismatch) or malformed.
 */
export function decryptSecret(payload: string): string {
    if (!payload) {
        throw new Error("Cannot decrypt empty/null value.");
    }
    const parts = payload.split(":");
    if (parts.length !== 3) {
        throw new Error("Malformed encrypted payload — expected iv:authTag:ciphertext.");
    }
    const [ivB64, authTagB64, cipherB64] = parts;
    const key = getKey();
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const ciphertext = Buffer.from(cipherB64, "base64");

    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
        throw new Error("Malformed encrypted payload — invalid iv/authTag length.");
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
    ]);

    return decrypted.toString("utf8");
}

/**
 * Returns a masked preview safe to display in UI (e.g. settings page),
 * so you never round-trip the real secret back to the browser.
 * e.g. "rzp_test_••••••••3f2a"
 */
export function maskSecret(plaintext: string, visibleTail = 4): string {
    if (!plaintext || plaintext.length <= visibleTail) return "••••••••";
    return "••••••••" + plaintext.slice(-visibleTail);
}