/**
 * AES-256-GCM vault for the one secret AgentGlass stores: the API key the
 * assistant uses to answer open-ended questions. The key is generated on first
 * boot to `data/.vault-key` (0600) and never leaves the machine.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export class Vault {
  private key: Buffer;

  constructor(dataDir: string) {
    const keyPath = join(dataDir, ".vault-key");
    if (existsSync(keyPath)) {
      this.key = Buffer.from(readFileSync(keyPath, "utf8").trim(), "hex");
    } else {
      this.key = randomBytes(32);
      writeFileSync(keyPath, this.key.toString("hex"), { mode: 0o600 });
      try {
        chmodSync(keyPath, 0o600);
      } catch {
        /* chmod is a no-op on some platforms */
      }
    }
  }

  /** Encrypt → base64(iv ‖ tag ‖ ciphertext). */
  seal(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ct]).toString("base64");
  }

  /** Decrypt; returns null if the payload is tampered or the key changed. */
  open(sealed: string): string | null {
    try {
      const buf = Buffer.from(sealed, "base64");
      const iv = buf.subarray(0, 12);
      const tag = buf.subarray(12, 28);
      const ct = buf.subarray(28);
      const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    } catch {
      return null;
    }
  }
}
