import {
  STORAGE_KEYS,
  getValue,
  setValue,
  addValueChangeListener,
} from './storage.js';

export const DEFAULT_SETTINGS = {
  schemaVersion: 1,
  features: {
    quickLogin: true,
    datePresets: true,
    tableEnhancer: true,
    sessionTimer: true,
  },
};

const FEATURE_MENU_ITEMS = [
  { key: 'quickLogin', label: '1. Chọn nhanh MST & Tự điền' },
  { key: 'datePresets', label: '2. Chọn nhanh khoảng thời gian' },
  { key: 'tableEnhancer', label: '3. Mở rộng bảng & Cố định tiêu đề' },
  { key: 'sessionTimer', label: '4. Đồng hồ phiên làm việc' },
];

let registeredMenuIds = [];

export function getSettings() {
  const saved = getValue(STORAGE_KEYS.SETTINGS, null);
  if (!saved || typeof saved !== 'object') {
    return structuredClone(DEFAULT_SETTINGS);
  }
  return {
    schemaVersion: 1,
    features: {
      ...DEFAULT_SETTINGS.features,
      ...(saved.features || {}),
    },
  };
}

export function saveSettings(nextSettings) {
  const normalized = {
    schemaVersion: 1,
    features: {
      ...DEFAULT_SETTINGS.features,
      ...(nextSettings.features || {}),
    },
  };
  setValue(STORAGE_KEYS.SETTINGS, normalized);
  return normalized;
}

export function toggleFeature(featureKey) {
  const current = getSettings();
  current.features[featureKey] = !current.features[featureKey];
  return saveSettings(current);
}

export function isFeatureEnabled(featureKey) {
  return Boolean(getSettings().features[featureKey]);
}

export function onSettingsChange(callback) {
  return addValueChangeListener(STORAGE_KEYS.SETTINGS, (_name, _oldVal, newVal) => {
    callback(
      newVal && typeof newVal === 'object'
        ? {
            schemaVersion: 1,
            features: { ...DEFAULT_SETTINGS.features, ...(newVal.features || {}) },
          }
        : structuredClone(DEFAULT_SETTINGS),
    );
  });
}

/**
 * Đăng ký menu popup của Tampermonkey — CHỈ gọi ở Top-Frame để tránh trùng menu trong iframe.
 */
export function registerTampermonkeyMenu({ onLockVaultNow, onSettingsToggled } = {}) {
  if (typeof GM_registerMenuCommand !== 'function') return;

  if (typeof GM_unregisterMenuCommand === 'function') {
    for (const id of registeredMenuIds) {
      try {
        GM_unregisterMenuCommand(id);
      } catch {
        // Bỏ qua nếu Tampermonkey đã giải phóng menu cũ
      }
    }
  }
  registeredMenuIds = [];

  const settings = getSettings();

  for (const item of FEATURE_MENU_ITEMS) {
    const enabled = Boolean(settings.features[item.key]);
    const title = `${enabled ? '✅' : '⬜'} ${item.label} [${enabled ? 'Đang bật' : 'Đang tắt'}]`;
    const id = GM_registerMenuCommand(title, () => {
      const updated = toggleFeature(item.key);
      registerTampermonkeyMenu({ onLockVaultNow, onSettingsToggled });
      if (typeof onSettingsToggled === 'function') {
        onSettingsToggled(updated, item.key);
      }
    });
    if (id !== undefined) registeredMenuIds.push(id);
  }

  if (typeof onLockVaultNow === 'function') {
    const lockId = GM_registerMenuCommand('🔒 Khóa ngay danh sách MST (Xóa phiên PIN)', () => {
      onLockVaultNow();
    });
    if (lockId !== undefined) registeredMenuIds.push(lockId);
  }
}
