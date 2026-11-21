import { STORAGE_KEYS, getValue, setValue, deleteValue } from '../../core/storage.js';
import {
  createEncryptedVault,
  unlockEncryptedVault,
  encryptPayloadWithKey,
  decryptPayloadWithKey,
} from '../../security/crypto-vault.js';
import {
  saveUnlockedSession,
  getActiveSession,
  lockSessionNow,
} from '../../security/session-unlock.js';

export function hasVault() {
  const rec = getValue(STORAGE_KEYS.VAULT, null);
  return Boolean(rec && rec.cipherB64 && rec.ivB64 && rec.saltB64);
}

export function hasImportBackup() {
  const prev = getValue(STORAGE_KEYS.VAULT_BACKUP_PREV, null);
  return Boolean(prev && prev.cipherB64 && prev.ivB64 && prev.saltB64);
}

export function getRawVaultRecord() {
  return getValue(STORAGE_KEYS.VAULT, null);
}

export async function setupNewVault(pin, initialCompanies = []) {
  if (!pin || String(pin).length < 4) {
    throw new Error('Mã PIN cần ít nhất 4 ký tự (khuyến nghị từ 6 ký tự trở lên).');
  }
  const payload = { version: 1, companies: initialCompanies };
  const { vaultRecord, key, saltBytes, iterations } = await createEncryptedVault(pin, payload);
  setValue(STORAGE_KEYS.VAULT, vaultRecord);
  await saveUnlockedSession({ key, saltBytes, iterations });
  return initialCompanies;
}

export async function unlockVaultWithPin(pin) {
  const vaultRecord = getValue(STORAGE_KEYS.VAULT, null);
  if (!vaultRecord) {
    throw new Error('Chưa có danh sách MST nào được lưu trên máy này.');
  }
  const { data, key, saltBytes, iterations } = await unlockEncryptedVault(pin, vaultRecord);
  await saveUnlockedSession({ key, saltBytes, iterations });
  return Array.isArray(data.companies) ? data.companies : [];
}

export async function tryLoadUnlockedCompanies() {
  const vaultRecord = getValue(STORAGE_KEYS.VAULT, null);
  if (!vaultRecord) return { state: 'uninitialized', companies: [] };

  const session = await getActiveSession();
  if (!session) return { state: 'locked', companies: [] };

  try {
    const data = await decryptPayloadWithKey(vaultRecord, session.key);
    return {
      state: 'unlocked',
      companies: Array.isArray(data.companies) ? data.companies : [],
    };
  } catch {
    lockSessionNow();
    return { state: 'locked', companies: [] };
  }
}

export async function saveCompanies(companies, { createRollbackSnapshot = false } = {}) {
  const session = await getActiveSession();
  if (!session) {
    throw new Error('Phiên PIN đã bị khóa. Vui lòng nhập lại mã PIN.');
  }
  if (createRollbackSnapshot) {
    const currentRecord = getValue(STORAGE_KEYS.VAULT, null);
    if (currentRecord) {
      setValue(STORAGE_KEYS.VAULT_BACKUP_PREV, currentRecord);
    }
  }
  const payload = { version: 1, companies };
  const nextRecord = await encryptPayloadWithKey(
    payload,
    session.key,
    session.saltBytes,
    session.iterations,
  );
  setValue(STORAGE_KEYS.VAULT, nextRecord);
  return companies;
}

export async function rollbackPreviousImport() {
  const prev = getValue(STORAGE_KEYS.VAULT_BACKUP_PREV, null);
  if (!prev) {
    throw new Error('Không có bản sao lưu trước lần Import gần nhất.');
  }
  const session = await getActiveSession();
  if (!session) {
    throw new Error('Vui lòng mở khóa PIN trước khi hoàn tác.');
  }
  // Xác minh bản sao lưu giải mã hợp lệ với khóa hiện tại trước khi khôi phục
  const data = await decryptPayloadWithKey(prev, session.key);
  setValue(STORAGE_KEYS.VAULT, prev);
  deleteValue(STORAGE_KEYS.VAULT_BACKUP_PREV);
  return Array.isArray(data.companies) ? data.companies : [];
}

export async function changeVaultPin(oldPin, newPin) {
  if (!newPin || String(newPin).length < 4) {
    throw new Error('Mã PIN mới cần ít nhất 4 ký tự.');
  }
  const currentRecord = getValue(STORAGE_KEYS.VAULT, null);
  const { data } = await unlockEncryptedVault(oldPin, currentRecord);
  const { vaultRecord, key, saltBytes, iterations } = await createEncryptedVault(newPin, data);
  setValue(STORAGE_KEYS.VAULT, vaultRecord);
  // Xóa rollback cũ vì đã đổi khóa PIN mới
  deleteValue(STORAGE_KEYS.VAULT_BACKUP_PREV);
  await saveUnlockedSession({ key, saltBytes, iterations });
  return Array.isArray(data.companies) ? data.companies : [];
}

export async function importEncryptedVaultBackup(jsonText, backupPin) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('File sao lưu không đúng định dạng JSON mã hóa.');
  }
  const { data, key, saltBytes, iterations } = await unlockEncryptedVault(backupPin, parsed);
  if (!Array.isArray(data.companies)) {
    throw new Error('Nội dung file sao lưu không chứa danh sách công ty hợp lệ.');
  }
  const currentRecord = getValue(STORAGE_KEYS.VAULT, null);
  if (currentRecord) {
    setValue(STORAGE_KEYS.VAULT_BACKUP_PREV, currentRecord);
  }
  setValue(STORAGE_KEYS.VAULT, parsed);
  await saveUnlockedSession({ key, saltBytes, iterations });
  return data.companies;
}

export function resetVaultCompletely() {
  deleteValue(STORAGE_KEYS.VAULT);
  deleteValue(STORAGE_KEYS.VAULT_BACKUP_PREV);
  lockSessionNow();
}
