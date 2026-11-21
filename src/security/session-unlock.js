import {
  bytesToBase64,
  base64ToBytes,
  exportAesKeyB64,
  importAesKeyFromB64,
} from './crypto-vault.js';

/**
 * Quản lý phiên mở khóa PIN 1 lần cho mỗi phiên mở trình duyệt:
 * - Chỉ giữ khóa AES phiên dẫn xuất (KHÔNG lưu PIN gốc, KHÔNG lưu mật khẩu plaintext) trong sessionStorage.
 * - Tự hủy 100% khi đóng trình duyệt hoặc khi bấm "Khóa ngay".
 * - Đồng bộ trạng thái mở khóa/khóa tức thì giữa các tab cùng origin qua BroadcastChannel.
 */

const SESSION_STORAGE_KEY = '__etax_helper_session_key_v1';
const CHANNEL_NAME = 'etax_helper_pin_sync_v1';

let memorySession = null; // { key: CryptoKey, keyB64, saltBytes, saltB64, iterations, unlockedAt }
let channel = null;
const lockListeners = new Set();

function getSessionStorageSafe() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function initChannel() {
  if (channel || typeof BroadcastChannel !== 'function') return;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = async (event) => {
      const msg = event.data;
      if (!msg || !msg.type) return;

      if (msg.type === 'LOCK_ALL') {
        clearLocalSessionOnly();
        for (const cb of lockListeners) cb();
      } else if (msg.type === 'REQUEST_KEY' && memorySession) {
        channel.postMessage({
          type: 'SHARE_KEY',
          payload: {
            keyB64: memorySession.keyB64,
            saltB64: memorySession.saltB64,
            iterations: memorySession.iterations,
            unlockedAt: memorySession.unlockedAt,
          },
        });
      } else if (msg.type === 'SHARE_KEY' && !memorySession && msg.payload) {
        await hydrateSessionFromSerialized(msg.payload, false);
        for (const cb of lockListeners) cb();
      }
    };
  } catch {
    channel = null;
  }
}

function clearLocalSessionOnly() {
  memorySession = null;
  const ss = getSessionStorageSafe();
  if (ss) {
    try {
      ss.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

async function hydrateSessionFromSerialized(serialized, persistToStorage = true) {
  if (!serialized || !serialized.keyB64 || !serialized.saltB64) return null;
  try {
    const key = await importAesKeyFromB64(serialized.keyB64);
    const saltBytes = base64ToBytes(serialized.saltB64);
    memorySession = {
      key,
      keyB64: serialized.keyB64,
      saltBytes,
      saltB64: serialized.saltB64,
      iterations: Number(serialized.iterations) || 310000,
      unlockedAt: serialized.unlockedAt || Date.now(),
    };
    if (persistToStorage) {
      const ss = getSessionStorageSafe();
      if (ss) {
        ss.setItem(SESSION_STORAGE_KEY, JSON.stringify(serialized));
      }
    }
    return memorySession;
  } catch {
    clearLocalSessionOnly();
    return null;
  }
}

export async function saveUnlockedSession({ key, saltBytes, iterations }) {
  initChannel();
  const keyB64 = await exportAesKeyB64(key);
  const saltB64 = bytesToBase64(saltBytes);
  const serialized = {
    keyB64,
    saltB64,
    iterations,
    unlockedAt: Date.now(),
  };
  await hydrateSessionFromSerialized(serialized, true);
  if (channel) {
    try {
      channel.postMessage({ type: 'SHARE_KEY', payload: serialized });
    } catch {
      // ignore
    }
  }
  return memorySession;
}

export async function getActiveSession() {
  initChannel();
  if (memorySession) return memorySession;

  const ss = getSessionStorageSafe();
  if (ss) {
    try {
      const raw = ss.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return await hydrateSessionFromSerialized(parsed, false);
      }
    } catch {
      clearLocalSessionOnly();
    }
  }

  // Hỏi nhanh các tab khác đang mở trên cùng origin xem đã mở khóa trong phiên này chưa
  if (channel) {
    try {
      channel.postMessage({ type: 'REQUEST_KEY' });
    } catch {
      // ignore
    }
  }
  return null;
}

export function lockSessionNow() {
  initChannel();
  clearLocalSessionOnly();
  if (channel) {
    try {
      channel.postMessage({ type: 'LOCK_ALL' });
    } catch {
      // ignore
    }
  }
  for (const cb of lockListeners) cb();
}

export function onSessionStateChange(callback) {
  initChannel();
  lockListeners.add(callback);
  return () => lockListeners.delete(callback);
}
