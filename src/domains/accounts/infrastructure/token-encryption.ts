import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }
  const keyBuffer = Buffer.from(key, "hex");
  if (keyBuffer.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes (64 hex characters)");
  }
  return keyBuffer;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a base64-encoded string containing iv:authTag:ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Format: base64(iv):base64(authTag):base64(ciphertext)
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/**
 * Decrypts a string produced by encrypt().
 * Returns the original plaintext.
 */
export function decrypt(encryptedData: string): string {
  const key = getEncryptionKey();

  const parts = encryptedData.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format");
  }

  const [ivBase64, authTagBase64, ciphertextBase64] = parts;
  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");
  const ciphertext = Buffer.from(ciphertextBase64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Safely decrypts a token, returning null if decryption fails.
 * Use this when handling potentially stale/corrupt tokens from the DB.
 */
export function safeDecrypt(encryptedData: string | null | undefined): string | null {
  if (!encryptedData) return null;
  try {
    return decrypt(encryptedData);
  } catch {
    return null;
  }
}
