import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit authentication tag

export function validateEncryptionConfig(): { valid: boolean; isProductionSafe: boolean; message: string } {
  const envKey = process.env.ENCRYPTION_SECRET_KEY || process.env.TOKEN_ENCRYPTION_KEY;
  if (!envKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CRITICAL SECURITY ERROR: ENCRYPTION_SECRET_KEY is not set in production.");
    }
    return { valid: true, isProductionSafe: false, message: "Using development fallback encryption key." };
  }

  const is64Hex = /^[0-9a-fA-F]{64}$/.test(envKey);
  const is32BytesRaw = Buffer.from(envKey, "utf8").length === 32;

  if (!is64Hex && !is32BytesRaw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "CRITICAL SECURITY ERROR: ENCRYPTION_SECRET_KEY must be exactly 32 bytes (64 hex characters or 32-byte UTF-8 string)."
      );
    }
    return { valid: true, isProductionSafe: false, message: "Key provided is not 32 bytes; falling back to SHA-256 digest." };
  }

  return { valid: true, isProductionSafe: true, message: "ENCRYPTION_SECRET_KEY is valid 32 bytes." };
}

function getEncryptionKey(): Buffer {
  const envKey =
    process.env.ENCRYPTION_SECRET_KEY ||
    process.env.TOKEN_ENCRYPTION_KEY ||
    process.env.SESSION_SECRET;

  if (envKey) {
    // If exact 64 hex characters (32 bytes hex)
    if (/^[0-9a-fA-F]{64}$/.test(envKey)) {
      return Buffer.from(envKey, "hex");
    }
    // If exact 32 bytes string
    const rawBuf = Buffer.from(envKey, "utf8");
    if (rawBuf.length === 32) {
      return rawBuf;
    }
    // Fallback sha256 derivation
    return crypto.createHash("sha256").update(envKey).digest();
  }

  return crypto.createHash("sha256").update("mediaos-dev-token-encryption-key-must-change-in-prod-32-chars!").digest();
}

/**
 * Encrypts an OAuth token (access or refresh) using AES-256-GCM.
 * Output format: iv:authTag:ciphertext (base64 encoded)
 */
export function encryptToken(plainToken: string, customKey?: Buffer): string {
  if (!plainToken || typeof plainToken !== "string") {
    throw new Error("Invalid plain token to encrypt");
  }

  const key = customKey || getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plainToken, "utf8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted token.
 * Validates integrity via the authentication tag. Throws if tampered or key is incorrect.
 */
export function decryptToken(encryptedData: string, customKey?: Buffer): string {
  if (!encryptedData || typeof encryptedData !== "string") {
    throw new Error("Invalid encrypted token string");
  }

  const parts = encryptedData.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted token payload: must contain iv:authTag:ciphertext");
  }

  const [ivBase64, authTagBase64, ciphertextBase64] = parts;
  const key = customKey || getEncryptionKey();

  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");

  if (iv.length !== IV_LENGTH) {
    throw new Error("Invalid IV length in encrypted token");
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Invalid authentication tag length in encrypted token");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  try {
    let decrypted = decipher.update(ciphertextBase64, "base64", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    throw new Error("Token decryption failed: authentication tag verification failed (tampered data or wrong key)");
  }
}

/**
 * Masks a secret token for safe visual representation (e.g. ya29.a0AfH6... -> ya29...H6).
 * Never exposes the full token.
 */
export function maskSecret(secret: string | null | undefined): string {
  if (!secret) return "";
  if (secret.length <= 8) return "********";
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

/**
 * Strips encrypted access and refresh tokens from any ConnectedAccount DTO or database record
 * before passing to API handlers, JSON serializers, or frontend components.
 */
export function sanitizeAccountDTO<T extends Record<string, any>>(
  account: T
): Omit<T, "encryptedAccessToken" | "encryptedRefreshToken"> {
  if (!account) return account;
  const { encryptedAccessToken, encryptedRefreshToken, ...safe } = account;
  return safe as Omit<T, "encryptedAccessToken" | "encryptedRefreshToken">;
}
