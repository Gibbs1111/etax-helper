/**
 * Wrapper lưu trữ cục bộ GM_getValue / GM_setValue kèm schemaVersion & khả năng giả lập khi chạy Unit Test.
 */

export const STORAGE_KEYS = {
  SETTINGS: 'etax_settings_v1',
  VAULT: 'etax_vault_v1',
  VAULT_BACKUP_PREV: 'etax_vault_backup_prev',
  TIMER_CONFIG: 'etax_timer_config_v1',
  LAST_ACTIVITY: 'etax_last_activity_v1',
};

const memoryFallback = new Map();
const memoryListeners = new Map();
let nextListenerId = 1;

function hasGMGet() {
  return typeof GM_getValue === 'function';
}

function hasGMSet() {
  return typeof GM_setValue === 'function';
}

function hasGMDelete() {
  return typeof GM_deleteValue === 'function';
}

export function getValue(key, defaultValue = null) {
  if (hasGMGet()) {
    return GM_getValue(key, defaultValue);
  }
  return memoryFallback.has(key) ? memoryFallback.get(key) : defaultValue;
}

export function setValue(key, value) {
  if (hasGMSet()) {
    GM_setValue(key, value);
    return;
  }
  const oldVal = memoryFallback.get(key);
  memoryFallback.set(key, value);
  const listeners = memoryListeners.get(key);
  if (listeners) {
    for (const cb of listeners.values()) {
      cb(key, oldVal, value, false);
    }
  }
}

export function deleteValue(key) {
  if (hasGMDelete()) {
    GM_deleteValue(key);
    return;
  }
  memoryFallback.delete(key);
}

export function addValueChangeListener(key, callback) {
  if (typeof GM_addValueChangeListener === 'function') {
    return GM_addValueChangeListener(key, callback);
  }
  const id = nextListenerId++;
  if (!memoryListeners.has(key)) {
    memoryListeners.set(key, new Map());
  }
  memoryListeners.get(key).set(id, callback);
  return id;
}

export function removeValueChangeListener(id) {
  if (typeof GM_removeValueChangeListener === 'function') {
    GM_removeValueChangeListener(id);
    return;
  }
  for (const map of memoryListeners.values()) {
    map.delete(id);
  }
}
