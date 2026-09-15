const crypto = require('crypto');

const KEY_LENGTH_BYTES = 32;
const KEY_LENGTH_HEX = 64;

function getKey(keyName) {
  const envValue = process.env[keyName];

  if (!envValue) {
    throw new Error(`${keyName} não configurada`);
  }

  const key = Buffer.from(envValue, 'hex');
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(`${keyName} deve ter ${KEY_LENGTH_HEX} caracteres hexadecimais (${KEY_LENGTH_BYTES} bytes)`);
  }

  return key;
}

/**
 * Criptografa um texto com AES-256-GCM.
 * Retorna string no formato: iv:authTag:ciphertext (hex)
 *
 * @param {string} text - texto em claro.
 * @param {string} [keyName=CALENDAR_ENCRYPTION_KEY] - nome da variável de ambiente com a chave.
 */
function encrypt(text, keyName = 'CALENDAR_ENCRYPTION_KEY') {
  if (!text) return null;

  const key = getKey(keyName);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Descriptografa texto criptografado por `encrypt`.
 *
 * @param {string} encrypted - texto cifrado no formato iv:authTag:ciphertext.
 * @param {string} [keyName=CALENDAR_ENCRYPTION_KEY] - nome da variável de ambiente com a chave.
 */
function decrypt(encrypted, keyName = 'CALENDAR_ENCRYPTION_KEY') {
  if (!encrypted) return null;

  const key = getKey(keyName);
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

module.exports = { encrypt, decrypt };
module.exports.__esModule = true;
module.exports.default = module.exports;
