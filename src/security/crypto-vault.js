/**
 * Lõi mã hóa cục bộ AES-256-GCM + dẫn xuất khóa PBKDF2-SHA256 sử dụng Web Crypto API chuẩn.
 * - Tuyệt đối không lưu mã PIN hay hash của PIN.
 * - Nhập sai PIN sẽ lập tức bị AES-GCM từ chối xác thực (OperationError).
 */

export const VAULT_SCHEMA_VERSION = 1;
export const DEFAULT_KDF_ITERATIONS = 310000;

function getSubtleCrypto() {
  const c = globalThis.crypto;
  if (!c || !c.subtle) {
    throw new Error('Trình duyệt không hỗ trợ Web Crypto API (yêu cầu kết nối HTTPS).');
  }
  return c;
}

export function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

export function base64ToBytes(b64) {
  if (typeof atob === 'function') {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

export function generateRandomBytes(length) {
  const c = getSubtleCrypto();
  const out = new Uint8Array(length);
  c.getRandomValues(out);
  return out;
}

export async function deriveAesKeyFromPin(pin, saltBytes, iterations = DEFAULT_KDF_ITERATIONS) {
  const c = getSubtleCrypto();
  const enc = new TextEncoder();
  const keyMaterial = await c.subtle.importKey(
    'raw',
    enc.encode(String(pin)),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );

  return c.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true, // extractable để giữ khóa phiên tạm thời trong sessionStorage (không lưu PIN gốc)
    ['encrypt', 'decrypt'],
  );
}

export async function exportAesKeyB64(cryptoKey) {
  const c = getSubtleCrypto();
  const raw = await c.subtle.exportKey('raw', cryptoKey);
  return bytesToBase64(new Uint8Array(raw));
}

export async function importAesKeyFromB64(keyB64) {
  const c = getSubtleCrypto();
  const raw = base64ToBytes(keyB64);
  return c.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptPayloadWithKey(dataObj, cryptoKey, saltBytes, iterations = DEFAULT_KDF_ITERATIONS) {
  const c = getSubtleCrypto();
  const iv = generateRandomBytes(12);
  const plaintext = new TextEncoder().encode(JSON.stringify(dataObj));
  const cipherBuffer = await c.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    plaintext,
  );

  return {
    schemaVersion: VAULT_SCHEMA_VERSION,
    kdf: 'PBKDF2-SHA256',
    iterations,
    saltB64: bytesToBase64(saltBytes),
    ivB64: bytesToBase64(iv),
    cipherB64: bytesToBase64(new Uint8Array(cipherBuffer)),
    updatedAt: new Date().toISOString(),
  };
}

export async function decryptPayloadWithKey(vaultRecord, cryptoKey) {
  if (!vaultRecord || !vaultRecord.ivB64 || !vaultRecord.cipherB64) {
    throw new Error('Dữ liệu kho mã hóa không hợp lệ.');
  }
  const c = getSubtleCrypto();
  const iv = base64ToBytes(vaultRecord.ivB64);
  const cipherBytes = base64ToBytes(vaultRecord.cipherB64);

  let plainBuffer;
  try {
    plainBuffer = await c.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      cipherBytes,
    );
  } catch {
    const err = new Error('Mã PIN không chính xác hoặc dữ liệu đã bị thay đổi.');
    err.code = 'INVALID_PIN';
    throw err;
  }

  const jsonStr = new TextDecoder().decode(plainBuffer);
  return JSON.parse(jsonStr);
}

export async function createEncryptedVault(pin, dataObj, iterations = DEFAULT_KDF_ITERATIONS) {
  const salt = generateRandomBytes(16);
  const key = await deriveAesKeyFromPin(pin, salt, iterations);
  const vaultRecord = await encryptPayloadWithKey(dataObj, key, salt, iterations);
  return { vaultRecord, key, saltBytes: salt, iterations };
}

export async function unlockEncryptedVault(pin, vaultRecord) {
  if (!vaultRecord || !vaultRecord.saltB64) {
    throw new Error('Chưa có kho dữ liệu MST nào được thiết lập.');
  }
  const saltBytes = base64ToBytes(vaultRecord.saltB64);
  const iterations = Number(vaultRecord.iterations) || DEFAULT_KDF_ITERATIONS;
  const key = await deriveAesKeyFromPin(pin, saltBytes, iterations);
  const data = await decryptPayloadWithKey(vaultRecord, key);
  return { data, key, saltBytes, iterations };
}
