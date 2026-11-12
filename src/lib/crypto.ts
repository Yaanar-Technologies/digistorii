import crypto from "crypto";
import { encryptSecret, decryptSecret, maskSecret } from "./cryptoHelper";

/**
 * Standard crypto utilities for per-tenant secret encryption/decryption (AES-256-GCM).
 * Re-exports canonical functions and provides aliases matching lib/crypto conventions.
 */

export { encryptSecret, decryptSecret, maskSecret };

export function encrypt(plaintext: string): string {
  return encryptSecret(plaintext);
}

export function decrypt(ciphertext: string): string {
  return decryptSecret(ciphertext);
}

