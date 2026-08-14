import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.CALENDAR_ENCRYPTION_KEY;

function getKey() {
  if (!ENCRYPTION_KEY) {
    throw new Error('CALENDAR_ENCRYPTION_KEY não configurada');
  }

  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  if (key.length !== 32) {
    throw new Error('CALENDAR_ENCRYPTION_KEY deve ter 64 caracteres hexadecimais (32 bytes)');
  }

  return key;
}

/**
 * Criptografa um texto com AES-256-GCM.
 * Retorna string no formato: iv:authTag:ciphertext (hex)
 */
export function encrypt(text) {
  if (!text) return null;

  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Descriptografa texto criptografado por `encrypt`.
 */
export function decrypt(encrypted) {
  if (!encrypted) return null;

  const key = getKey();
  const [ivHex, authTagHex, ciphertextHex] = encrypted.split(':');

  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error('Formato de criptografia inválido');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}
