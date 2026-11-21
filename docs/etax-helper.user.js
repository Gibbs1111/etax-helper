// ==UserScript==
// @name         eTax Helper Internal
// @namespace    https://etax-helper.internal/userscript
// @version      1.0.0
// @description  Hỗ trợ thao tác nội bộ trên Cổng Dịch vụ công Thuế & eTax (Chọn nhanh MST mã hóa PIN, Chọn ngày 2 cấp, Mở rộng bảng, Đồng hồ giữ phiên)
// @author       Internal Accounting Tech Team
// @match        https://dichvucong.gdt.gov.vn/*
// @match        https://thuedientu.gdt.gov.vn/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_addStyle
// @grant        unsafeWindow
// @connect      none
// @updateURL    https://gibbs1111.github.io/etax-helper/etax-helper.meta.js
// @downloadURL  https://gibbs1111.github.io/etax-helper/etax-helper.user.js
// ==/UserScript==

(function () {
  'use strict';

  const __modules = {
  "core/storage.js": function(__require, __exports) {
/**
 * Wrapper lưu trữ cục bộ GM_getValue / GM_setValue kèm schemaVersion & khả năng giả lập khi chạy Unit Test.
 */

const STORAGE_KEYS = {
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

function getValue(key, defaultValue = null) {
  if (hasGMGet()) {
    return GM_getValue(key, defaultValue);
  }
  return memoryFallback.has(key) ? memoryFallback.get(key) : defaultValue;
}

function setValue(key, value) {
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

function deleteValue(key) {
  if (hasGMDelete()) {
    GM_deleteValue(key);
    return;
  }
  memoryFallback.delete(key);
}

function addValueChangeListener(key, callback) {
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

function removeValueChangeListener(id) {
  if (typeof GM_removeValueChangeListener === 'function') {
    GM_removeValueChangeListener(id);
    return;
  }
  for (const map of memoryListeners.values()) {
    map.delete(id);
  }
}

  __exports.getValue = getValue;
  __exports.setValue = setValue;
  __exports.deleteValue = deleteValue;
  __exports.addValueChangeListener = addValueChangeListener;
  __exports.removeValueChangeListener = removeValueChangeListener;
  __exports.STORAGE_KEYS = STORAGE_KEYS;
  },

  "core/settings.js": function(__require, __exports) {
const { STORAGE_KEYS, getValue, setValue, addValueChangeListener } = __require("core/storage.js");

const DEFAULT_SETTINGS = {
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

function getSettings() {
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

function saveSettings(nextSettings) {
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

function toggleFeature(featureKey) {
  const current = getSettings();
  current.features[featureKey] = !current.features[featureKey];
  return saveSettings(current);
}

function isFeatureEnabled(featureKey) {
  return Boolean(getSettings().features[featureKey]);
}

function onSettingsChange(callback) {
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
function registerTampermonkeyMenu({ onLockVaultNow, onSettingsToggled } = {}) {
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

  __exports.getSettings = getSettings;
  __exports.saveSettings = saveSettings;
  __exports.toggleFeature = toggleFeature;
  __exports.isFeatureEnabled = isFeatureEnabled;
  __exports.onSettingsChange = onSettingsChange;
  __exports.registerTampermonkeyMenu = registerTampermonkeyMenu;
  __exports.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
  },

  "adapters/etax-adapter.js": function(__require, __exports) {
/**
 * eTax Adapter — Toàn bộ selector DOM & pattern mạng đã được xác minh trực tiếp qua F12 (Giai đoạn 1).
 * Khi Tổng cục Thuế cập nhật giao diện, chỉ cần điều chỉnh duy nhất tệp này rồi build tăng PATCH version.
 */

const DVC_ORIGIN = 'https://dichvucong.gdt.gov.vn';
const ETAX_ORIGIN = 'https://thuedientu.gdt.gov.vn';
const ALLOWED_ORIGINS = new Set([DVC_ORIGIN, ETAX_ORIGIN]);

const KEEP_ALIVE_URL = `${DVC_ORIGIN}/tthc/home`;
const DATE_FORMAT = 'DD/MM/YYYY';

const STATIC_ASSET_RE = /\.(?:css|js|mjs|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot|map|bmp)(?:\?|#|$)/i;
const IGNORED_PATH_PATTERNS = [
  /\/tthc\/login\/getCaptcha/i,
  /\/etaxnnt\/static\//i,
  /longpooling/i,
  /abn\.statInfo/i,
  /\/init\?data=/i,
];

/**
 * Chuẩn hóa chuỗi tiếng Việt không dấu, chữ thường để so khớp nhãn an toàn.
 */
function normalizeVietnamese(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isDvcOrigin(origin = location.origin) {
  return origin === DVC_ORIGIN;
}

function isEtaxOrigin(origin = location.origin) {
  return origin === ETAX_ORIGIN;
}

function isLoginPage(loc = location) {
  return loc.origin === DVC_ORIGIN && loc.pathname.includes('/tthc/login');
}

/**
 * Xác định trạng thái đã đăng nhập trên cổng chính dichvucong.gdt.gov.vn
 * (dựa trên F12 Bước 2: nút Đăng xuất `dangXuat()` và `.user-name` trong `.dropdown-menu`).
 */
function isLoggedIn(doc = document, loc = location) {
  if (loc.origin !== DVC_ORIGIN || loc.pathname.includes('/login')) {
    return false;
  }
  return Boolean(
    doc.querySelector('a[hx-on\\:click*="dangXuat"], .dropdown-menu .user-name'),
  );
}

/**
 * Tìm khung Form Đăng nhập Doanh nghiệp trên dichvucong.gdt.gov.vn/tthc/login (F12 Bước 1).
 */
function findLoginFormContext(doc = document) {
  const modalBodies = doc.querySelectorAll('.modal-body');
  for (const body of modalBodies) {
    const usernameInput = body.querySelector('input[name="tenDN"]');
    const passwordInput = body.querySelector('input[name="matKhau"]');
    if (!usernameInput || !passwordInput) continue;

    const ldapInput = body.querySelector('input[name="ldap"]');
    // Ưu tiên đúng modal Doanh nghiệp (ldap === "DN") nếu trường ldap tồn tại
    if (ldapInput && ldapInput.value && ldapInput.value.toUpperCase() !== 'DN') {
      continue;
    }

    const captchaInput = body.querySelector('input[name="captcha"]');
    return {
      container: body,
      ldapInput,
      usernameInput,
      passwordInput,
      captchaInput,
    };
  }
  return null;
}

function isInputVisible(el) {
  if (!el || el.disabled || el.type === 'hidden') return false;
  const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  return true;
}

/**
 * Quét toàn bộ cặp ô "Từ ngày – Đến ngày" trên màn hình hiện tại.
 * Hỗ trợ đầy đủ:
 *  - Mẫu A (dichvucong /tthc/tchs): `.row` chứa cặp `input.one-calendar` (`tuNgay`, `denNgay`)
 *  - Mẫu B (thuedientu iframe): `tr` chứa cặp `input.dateMSB` / `input.hasDatepicker` (kể cả nhiều hàng xếp chồng như Giấy nộp tiền)
 *  - Mẫu C (dự phòng): hàng `tr` / `.row` có cặp nhãn "Từ ngày" & "Đến ngày"
 */
function findDateInputPairs(root = document) {
  const pairs = [];
  const seenFrom = new Set();

  const registerPair = (fromInput, toInput, rowEl, kind) => {
    if (!fromInput || !toInput || fromInput === toInput) return;
    if (seenFrom.has(fromInput)) return;
    if (!isInputVisible(fromInput) || !isInputVisible(toInput)) return;
    seenFrom.add(fromInput);
    pairs.push({ fromInput, toInput, rowEl, kind });
  };

  // Mẫu A: Cổng mới dichvucong (Bootstrap 5 + input.one-calendar)
  const dvcRows = root.querySelectorAll('.row');
  for (const row of dvcRows) {
    const calInputs = Array.from(row.querySelectorAll('input.one-calendar')).filter(isInputVisible);
    if (calInputs.length === 2) {
      registerPair(calInputs[0], calInputs[1], row, 'dvc-one-calendar');
    }
  }

  // Mẫu B: Iframe eTax thuedientu (table tr + input.dateMSB / hasDatepicker)
  const etaxRows = root.querySelectorAll('tr');
  for (const tr of etaxRows) {
    // Bỏ qua hàng đang bị ẩn hoàn toàn (style="display: none")
    const trStyle = window.getComputedStyle ? window.getComputedStyle(tr) : null;
    if (trStyle && trStyle.display === 'none') continue;

    const dateInputs = Array.from(
      tr.querySelectorAll('input.dateMSB, input.hasDatepicker'),
    ).filter(isInputVisible);
    if (dateInputs.length === 2) {
      registerPair(dateInputs[0], dateInputs[1], tr, 'etax-datepicker');
    }
  }

  // Mẫu C: Dự phòng theo nhãn "Từ ngày" & "Đến ngày" trên cùng một hàng
  const candidateRows = root.querySelectorAll('tr, .row');
  for (const row of candidateRows) {
    const textInputs = Array.from(
      row.querySelectorAll('input[type="text"], input:not([type])'),
    ).filter((el) => isInputVisible(el) && !seenFrom.has(el));
    if (textInputs.length !== 2) continue;

    const rowText = normalizeVietnamese(row.textContent);
    if (rowText.includes('tu ngay') && rowText.includes('den ngay')) {
      registerPair(textInputs[0], textInputs[1], row, 'heuristic-row');
    }
  }

  return pairs;
}

/**
 * Ghi giá trị vào ô input một cách chuẩn xác để cả Bootstrap/Parsley (`changeDate`)
 * lẫn jQuery UI Datepicker (`thuedientu`) đều nhận diện mà không kích hoạt vòng lặp `onblur -> focus()` của eTax cũ.
 */
function setNativeInputValue(input, value, options = {}) {
  const { triggerInput = true, triggerChange = true, triggerBlur = false } = options;
  if (!input) return;

  const proto = window.HTMLInputElement ? window.HTMLInputElement.prototype : null;
  const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
  if (descriptor && typeof descriptor.set === 'function') {
    descriptor.set.call(input, value);
  } else {
    input.value = value;
  }

  if (triggerInput) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (triggerChange) {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (triggerBlur) {
    // Theo chuẩn DOM, sự kiện blur không bubble (bubbles: false)
    input.dispatchEvent(new Event('blur', { bubbles: false }));
  }

  // Xóa trạng thái lỗi đỏ Parsley cũ nếu có sau khi đã điền giá trị hợp lệ
  if (value && input.classList && input.classList.contains('is-invalid')) {
    input.classList.remove('is-invalid');
  }
}

/**
 * Kiểm tra một URL request XHR/Fetch có phải giao tiếp thực tế với máy chủ thuế hay không.
 * ĐÃ KHÓA CHẶT dựa trên F12 Bước 5 để loại bỏ hoàn toàn XHR nền của Kaspersky
 * (`longpooling`, `abn.statInfo`, `init?data=`) và mọi tài nguyên tĩnh.
 */
function isRealTaxServerRequest(rawUrl, baseHref = 'https://dichvucong.gdt.gov.vn/') {
  if (!rawUrl || typeof rawUrl !== 'string') return false;

  let parsed;
  try {
    parsed = new URL(rawUrl, baseHref);
  } catch {
    return false;
  }

  if (!ALLOWED_ORIGINS.has(parsed.origin)) {
    return false;
  }

  const fullPath = `${parsed.pathname}${parsed.search}`;
  if (STATIC_ASSET_RE.test(parsed.pathname)) {
    return false;
  }
  for (const ignored of IGNORED_PATH_PATTERNS) {
    if (ignored.test(fullPath)) {
      return false;
    }
  }

  if (parsed.origin === DVC_ORIGIN) {
    return parsed.pathname.startsWith('/tthc/');
  }
  if (parsed.origin === ETAX_ORIGIN) {
    return parsed.pathname.startsWith('/etaxnnt/');
  }
  return false;
}

/**
 * Kiểm tra phản hồi HTML của Keep-Alive `GET /tthc/home` có xác nhận phiên còn sống hay không.
 */
function isKeepAliveResponseAlive(status, finalUrl, bodyText) {
  if (status < 200 || status >= 300) return false;
  if (!finalUrl || finalUrl.includes('/login')) return false;
  const text = String(bodyText || '');
  if (text.includes('name="matKhau"') && !text.includes('dangXuat(')) {
    return false;
  }
  return text.includes('dangXuat(') || text.includes('user-name');
}

  __exports.normalizeVietnamese = normalizeVietnamese;
  __exports.isDvcOrigin = isDvcOrigin;
  __exports.isEtaxOrigin = isEtaxOrigin;
  __exports.isLoginPage = isLoginPage;
  __exports.isLoggedIn = isLoggedIn;
  __exports.findLoginFormContext = findLoginFormContext;
  __exports.findDateInputPairs = findDateInputPairs;
  __exports.setNativeInputValue = setNativeInputValue;
  __exports.isRealTaxServerRequest = isRealTaxServerRequest;
  __exports.isKeepAliveResponseAlive = isKeepAliveResponseAlive;
  __exports.DVC_ORIGIN = DVC_ORIGIN;
  __exports.ETAX_ORIGIN = ETAX_ORIGIN;
  __exports.ALLOWED_ORIGINS = ALLOWED_ORIGINS;
  __exports.KEEP_ALIVE_URL = KEEP_ALIVE_URL;
  __exports.DATE_FORMAT = DATE_FORMAT;
  },

  "core/frame-bus.js": function(__require, __exports) {
const { ALLOWED_ORIGINS, DVC_ORIGIN } = __require("adapters/etax-adapter.js");
const { STORAGE_KEYS, setValue, addValueChangeListener } = __require("core/storage.js");

const MSG_TYPE_ACTIVITY = 'ETAX_HELPER_SERVER_ACTIVITY';

function isTopFrame() {
  try {
    return window.self === window.top;
  } catch {
    return false;
  }
}

/**
 * Báo tín hiệu giao tiếp thực với máy chủ thuế từ bất kỳ frame nào (kể cả iframe thuedientu.gdt.gov.vn)
 * về đồng hồ trung tâm ở Top-Frame (dichvucong.gdt.gov.vn).
 */
function notifyServerActivity(source, detail = '') {
  const payload = {
    type: MSG_TYPE_ACTIVITY,
    source,
    detail,
    origin: location.origin,
    timestamp: Date.now(),
  };

  // Kênh 1: postMessage trực tiếp lên Top-Frame (khóa đúng origin dichvucong)
  if (!isTopFrame()) {
    try {
      window.top.postMessage(payload, DVC_ORIGIN);
    } catch {
      // Dự phòng đã có Kênh 2 qua GM_setValue bên dưới
    }
  }

  // Kênh 2: Đồng bộ xuyên origin & xuyên tab qua GM_setValue
  setValue(STORAGE_KEYS.LAST_ACTIVITY, payload);
}

/**
 * Lắng nghe tín hiệu giao tiếp máy chủ tại Top-Frame.
 */
function subscribeServerActivity(handler) {
  const onMessage = (event) => {
    if (!ALLOWED_ORIGINS.has(event.origin)) return;
    const data = event.data;
    if (!data || data.type !== MSG_TYPE_ACTIVITY) return;
    handler(data);
  };

  window.addEventListener('message', onMessage);

  const gmId = addValueChangeListener(STORAGE_KEYS.LAST_ACTIVITY, (_k, _oldVal, newVal) => {
    if (!newVal || newVal.type !== MSG_TYPE_ACTIVITY) return;
    handler(newVal);
  });

  return () => {
    window.removeEventListener('message', onMessage);
    void gmId;
  };
}

  __exports.isTopFrame = isTopFrame;
  __exports.notifyServerActivity = notifyServerActivity;
  __exports.subscribeServerActivity = subscribeServerActivity;
  },

  "security/crypto-vault.js": function(__require, __exports) {
/**
 * Lõi mã hóa cục bộ AES-256-GCM + dẫn xuất khóa PBKDF2-SHA256 sử dụng Web Crypto API chuẩn.
 * - Tuyệt đối không lưu mã PIN hay hash của PIN.
 * - Nhập sai PIN sẽ lập tức bị AES-GCM từ chối xác thực (OperationError).
 */

const VAULT_SCHEMA_VERSION = 1;
const DEFAULT_KDF_ITERATIONS = 310000;

function getSubtleCrypto() {
  const c = globalThis.crypto;
  if (!c || !c.subtle) {
    throw new Error('Trình duyệt không hỗ trợ Web Crypto API (yêu cầu kết nối HTTPS).');
  }
  return c;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(b64) {
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

function generateRandomBytes(length) {
  const c = getSubtleCrypto();
  const out = new Uint8Array(length);
  c.getRandomValues(out);
  return out;
}

async function deriveAesKeyFromPin(pin, saltBytes, iterations = DEFAULT_KDF_ITERATIONS) {
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

async function exportAesKeyB64(cryptoKey) {
  const c = getSubtleCrypto();
  const raw = await c.subtle.exportKey('raw', cryptoKey);
  return bytesToBase64(new Uint8Array(raw));
}

async function importAesKeyFromB64(keyB64) {
  const c = getSubtleCrypto();
  const raw = base64ToBytes(keyB64);
  return c.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

async function encryptPayloadWithKey(dataObj, cryptoKey, saltBytes, iterations = DEFAULT_KDF_ITERATIONS) {
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

async function decryptPayloadWithKey(vaultRecord, cryptoKey) {
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

async function createEncryptedVault(pin, dataObj, iterations = DEFAULT_KDF_ITERATIONS) {
  const salt = generateRandomBytes(16);
  const key = await deriveAesKeyFromPin(pin, salt, iterations);
  const vaultRecord = await encryptPayloadWithKey(dataObj, key, salt, iterations);
  return { vaultRecord, key, saltBytes: salt, iterations };
}

async function unlockEncryptedVault(pin, vaultRecord) {
  if (!vaultRecord || !vaultRecord.saltB64) {
    throw new Error('Chưa có kho dữ liệu MST nào được thiết lập.');
  }
  const saltBytes = base64ToBytes(vaultRecord.saltB64);
  const iterations = Number(vaultRecord.iterations) || DEFAULT_KDF_ITERATIONS;
  const key = await deriveAesKeyFromPin(pin, saltBytes, iterations);
  const data = await decryptPayloadWithKey(vaultRecord, key);
  return { data, key, saltBytes, iterations };
}

  __exports.deriveAesKeyFromPin = deriveAesKeyFromPin;
  __exports.exportAesKeyB64 = exportAesKeyB64;
  __exports.importAesKeyFromB64 = importAesKeyFromB64;
  __exports.encryptPayloadWithKey = encryptPayloadWithKey;
  __exports.decryptPayloadWithKey = decryptPayloadWithKey;
  __exports.createEncryptedVault = createEncryptedVault;
  __exports.unlockEncryptedVault = unlockEncryptedVault;
  __exports.bytesToBase64 = bytesToBase64;
  __exports.base64ToBytes = base64ToBytes;
  __exports.generateRandomBytes = generateRandomBytes;
  __exports.VAULT_SCHEMA_VERSION = VAULT_SCHEMA_VERSION;
  __exports.DEFAULT_KDF_ITERATIONS = DEFAULT_KDF_ITERATIONS;
  },

  "security/session-unlock.js": function(__require, __exports) {
const { bytesToBase64, base64ToBytes, exportAesKeyB64, importAesKeyFromB64 } = __require("security/crypto-vault.js");

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

async function saveUnlockedSession({ key, saltBytes, iterations }) {
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

async function getActiveSession() {
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

function lockSessionNow() {
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

function onSessionStateChange(callback) {
  initChannel();
  lockListeners.add(callback);
  return () => lockListeners.delete(callback);
}

  __exports.saveUnlockedSession = saveUnlockedSession;
  __exports.getActiveSession = getActiveSession;
  __exports.lockSessionNow = lockSessionNow;
  __exports.onSessionStateChange = onSessionStateChange;
  },

  "features/session-timer/network-probe.js": function(__require, __exports) {
const { isRealTaxServerRequest } = __require("adapters/etax-adapter.js");
const { notifyServerActivity } = __require("core/frame-bus.js");

/**
 * Cảm biến giao tiếp máy chủ (chạy ở document-start trên cả dichvucong.gdt.gov.vn & iframe thuedientu.gdt.gov.vn):
 * - Chỉ báo reset đồng hồ khi có giao tiếp THỰC TẾ với máy chủ thuế:
 *   1. Tải trang / tải iframe mới.
 *   2. XHR (bao gồm HTMX) hoặc Fetch gửi tới endpoint thật của cổng thuế (đã chặn XHR nền của Kaspersky!).
 *   3. Submit form truyền thống.
 * - KHÔNG báo reset theo thao tác click chuột, di chuột hay gõ phím thuần túy.
 */

let installed = false;
let capturedNativeFetch = null;

function getPageWindow() {
  try {
    return typeof unsafeWindow !== 'undefined' && unsafeWindow ? unsafeWindow : window;
  } catch {
    return window;
  }
}

/**
 * Trả về hàm fetch gốc (chưa qua hook) để `keep-alive.js` tự kiểm chứng phản hồi sống/chết
 * mà không tự kích hoạt reset đồng hồ sớm trước khi biết phiên còn hiệu lực hay không.
 */
function getRawFetch() {
  if (capturedNativeFetch) return capturedNativeFetch;
  return window.fetch.bind(window);
}

function installNetworkProbe() {
  if (installed) return;
  installed = true;

  const pageWin = getPageWindow();
  try {
    capturedNativeFetch = (window.fetch || pageWin.fetch).bind(window);
  } catch {
    capturedNativeFetch = null;
  }

  // 1. Báo hiệu mỗi khi một trang/iframe thật của cổng thuế được tải mới
  if (isRealTaxServerRequest(location.href, location.href)) {
    notifyServerActivity('navigation', location.pathname);
  }

  // 2. Hook XMLHttpRequest trên page context (bắt mọi lệnh HTMX & AJAX eTax)
  try {
    const XHR = pageWin.XMLHttpRequest;
    if (XHR && XHR.prototype && !XHR.prototype.__etaxHelperHooked) {
      const origOpen = XHR.prototype.open;
      const origSend = XHR.prototype.send;

      XHR.prototype.open = function patchedOpen(method, url, ...rest) {
        this.__etaxHelperUrl = typeof url === 'string' ? url : String(url || '');
        this.__etaxHelperMethod = method || 'GET';
        return origOpen.call(this, method, url, ...rest);
      };

      XHR.prototype.send = function patchedSend(...args) {
        const targetUrl = this.__etaxHelperUrl || '';
        if (isRealTaxServerRequest(targetUrl, location.href)) {
          notifyServerActivity('xhr', `${this.__etaxHelperMethod} ${targetUrl}`);
        }
        return origSend.apply(this, args);
      };

      XHR.prototype.__etaxHelperHooked = true;
    }
  } catch {
    // Bỏ qua an toàn nếu trình duyệt không cho bọc XHR
  }

  // 3. Hook window.fetch trên page context
  try {
    if (typeof pageWin.fetch === 'function' && !pageWin.fetch.__etaxHelperHooked) {
      const origFetch = pageWin.fetch.bind(pageWin);
      const wrappedFetch = function patchedFetch(input, init) {
        const rawUrl =
          typeof input === 'string'
            ? input
            : input && typeof input.url === 'string'
              ? input.url
              : '';
        if (isRealTaxServerRequest(rawUrl, location.href)) {
          notifyServerActivity('fetch', rawUrl);
        }
        return origFetch(input, init);
      };
      wrappedFetch.__etaxHelperHooked = true;
      pageWin.fetch = wrappedFetch;
    }
  } catch {
    // ignore
  }

  // 4. Bắt Submit Form truyền thống (đặc biệt trên iframe thuedientu.gdt.gov.vn)
  document.addEventListener(
    'submit',
    (event) => {
      if (event.defaultPrevented) return;
      const form = event.target;
      const action = (form && form.getAttribute && form.getAttribute('action')) || location.href;
      if (isRealTaxServerRequest(action, location.href)) {
        notifyServerActivity('form-submit', action);
      }
    },
    false,
  );
}

  __exports.getRawFetch = getRawFetch;
  __exports.installNetworkProbe = installNetworkProbe;
  },

  "core/dom-observer.js": function(__require, __exports) {
/**
 * Bộ quan sát DOM tối ưu cho trang nặng (nhiều nghìn thẻ <option>/<li> ẩn trong bootstrap-select).
 * Dùng debounce + hỗ trợ cả sự kiện HTMX (`htmx:afterSwap`, `htmx:afterSettle`) để không gây lag trình duyệt.
 */

function createDomWatcher(onScan, { debounceMs = 180 } = {}) {
  let timer = null;
  let observer = null;
  let active = false;

  const scheduleScan = () => {
    if (!active) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (active) {
        try {
          onScan();
        } catch (err) {
          console.warn('[eTax Helper] Lỗi khi quét DOM:', err);
        }
      }
    }, debounceMs);
  };

  const onHtmxSwap = () => scheduleScan();

  return {
    start() {
      if (active) return;
      active = true;
      scheduleScan();

      if (typeof MutationObserver === 'function' && document.body) {
        observer = new MutationObserver((mutations) => {
          for (const m of mutations) {
            if (m.type === 'childList' && m.addedNodes && m.addedNodes.length > 0) {
              scheduleScan();
              return;
            }
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }

      document.addEventListener('htmx:afterSwap', onHtmxSwap);
      document.addEventListener('htmx:afterSettle', onHtmxSwap);
    },

    triggerNow() {
      if (!active) return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      onScan();
    },

    stop() {
      active = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      document.removeEventListener('htmx:afterSwap', onHtmxSwap);
      document.removeEventListener('htmx:afterSettle', onHtmxSwap);
    },
  };
}

  __exports.createDomWatcher = createDomWatcher;
  },

  "ui/shadow-host.js": function(__require, __exports) {
/**
 * Shadow DOM Host — Cô lập hoàn toàn CSS giao diện của eTax Helper khỏi Bootstrap 5 & CSS cũ của eTax.
 * Dùng tông màu xanh thương hiệu gốc của Cổng Dịch vụ công Thuế (#006FBC).
 */

const SHARED_SHADOW_CSS = `
:host {
  all: initial;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  font-size: 13px;
  color: #1f2937;
  box-sizing: border-box;
}
*, *::before, *::after {
  box-sizing: border-box;
  font-family: inherit;
}
.eh-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #1f2937;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  line-height: 1.3;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.eh-btn:hover {
  background: #f1f5f9;
  border-color: #94a3b8;
}
.eh-btn-primary {
  background: #006FBC;
  border-color: #006FBC;
  color: #ffffff;
}
.eh-btn-primary:hover {
  background: #005a99;
  border-color: #005a99;
  color: #ffffff;
}
.eh-btn-danger {
  background: #fff1f2;
  border-color: #fecdd3;
  color: #be123c;
}
.eh-btn-danger:hover {
  background: #ffe4e6;
  border-color: #fda4af;
}
.eh-btn-sm {
  padding: 3px 8px;
  font-size: 12px;
}
.eh-input, .eh-select {
  width: 100%;
  padding: 6px 9px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #ffffff;
  color: #111827;
  font-size: 13px;
  outline: none;
}
.eh-input:focus, .eh-select:focus {
  border-color: #006FBC;
  box-shadow: 0 0 0 2px rgba(0, 111, 188, 0.16);
}
.eh-muted {
  color: #64748b;
  font-size: 12px;
}
.eh-error {
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
  padding: 6px 9px;
  border-radius: 6px;
  font-size: 12px;
}
.eh-success {
  color: #166534;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  padding: 6px 9px;
  border-radius: 6px;
  font-size: 12px;
}
.eh-warning {
  color: #9a3412;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  padding: 6px 9px;
  border-radius: 6px;
  font-size: 12px;
}
`;

function createShadowMount(tagName = 'div', extraCss = '', hostAttributes = {}, options = {}) {
  const { guardBootstrapFocusTrap = false } = options;
  const host = document.createElement(tagName);
  host.setAttribute('data-etax-helper', '1');
  for (const [k, v] of Object.entries(hostAttributes)) {
    host.setAttribute(k, v);
  }
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `${SHARED_SHADOW_CSS}\n${extraCss}`;
  shadow.appendChild(style);
  const root = document.createElement('div');
  shadow.appendChild(root);

  let cleanup = () => {};

  if (guardBootstrapFocusTrap) {
    // Bootstrap 5 Modal (.modal.show) gắn FocusTrap trên `document` (sự kiện `focusin` & `keydown` Tab/Esc)
    // nên khi mở hộp thoại của eTax Helper đè lên trên modal đăng nhập, Bootstrap sẽ cướp lại con trỏ chuột.
    // Chặn sự kiện `focusin` ở pha capture trên `window` (chỉ khi target nằm trong Shadow host của chúng ta)
    // và chặn bubble `keydown` trên `host` để mọi ô nhập & phím Tab/Esc hoạt động bình thường 100%.
    const isInsideHost = (event) => {
      if (event.target === host || (event.target instanceof Node && host.contains(event.target))) {
        return true;
      }
      if (typeof event.composedPath === 'function') {
        return event.composedPath().includes(host);
      }
      return false;
    };

    const pageWin = typeof unsafeWindow !== 'undefined' && unsafeWindow ? unsafeWindow : window;

    const onWindowFocusIn = (event) => {
      if (isInsideHost(event)) {
        event.stopImmediatePropagation();
      }
    };

    const onHostFocusInBubble = (event) => {
      event.stopPropagation();
    };

    const onHostKeyDown = (event) => {
      if (event.key === 'Tab' || event.key === 'Escape') {
        event.stopPropagation();
      }
    };

    pageWin.addEventListener('focusin', onWindowFocusIn, true);
    host.addEventListener('focusin', onHostFocusInBubble, false);
    host.addEventListener('keydown', onHostKeyDown, false);

    cleanup = () => {
      pageWin.removeEventListener('focusin', onWindowFocusIn, true);
      host.removeEventListener('focusin', onHostFocusInBubble, false);
      host.removeEventListener('keydown', onHostKeyDown, false);
    };
  }

  return { host, shadow, root, cleanup };
}

function triggerFileDownload(bytes, fileName, mimeType) {
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 500);
}

  __exports.createShadowMount = createShadowMount;
  __exports.triggerFileDownload = triggerFileDownload;
  __exports.SHARED_SHADOW_CSS = SHARED_SHADOW_CSS;
  },

  "features/quick-login/company-store.js": function(__require, __exports) {
const { STORAGE_KEYS, getValue, setValue, deleteValue } = __require("core/storage.js");
const { createEncryptedVault, unlockEncryptedVault, encryptPayloadWithKey, decryptPayloadWithKey } = __require("security/crypto-vault.js");
const { saveUnlockedSession, getActiveSession, lockSessionNow } = __require("security/session-unlock.js");

function hasVault() {
  const rec = getValue(STORAGE_KEYS.VAULT, null);
  return Boolean(rec && rec.cipherB64 && rec.ivB64 && rec.saltB64);
}

function hasImportBackup() {
  const prev = getValue(STORAGE_KEYS.VAULT_BACKUP_PREV, null);
  return Boolean(prev && prev.cipherB64 && prev.ivB64 && prev.saltB64);
}

function getRawVaultRecord() {
  return getValue(STORAGE_KEYS.VAULT, null);
}

async function setupNewVault(pin, initialCompanies = []) {
  if (!pin || String(pin).length < 4) {
    throw new Error('Mã PIN cần ít nhất 4 ký tự (khuyến nghị từ 6 ký tự trở lên).');
  }
  const payload = { version: 1, companies: initialCompanies };
  const { vaultRecord, key, saltBytes, iterations } = await createEncryptedVault(pin, payload);
  setValue(STORAGE_KEYS.VAULT, vaultRecord);
  await saveUnlockedSession({ key, saltBytes, iterations });
  return initialCompanies;
}

async function unlockVaultWithPin(pin) {
  const vaultRecord = getValue(STORAGE_KEYS.VAULT, null);
  if (!vaultRecord) {
    throw new Error('Chưa có danh sách MST nào được lưu trên máy này.');
  }
  const { data, key, saltBytes, iterations } = await unlockEncryptedVault(pin, vaultRecord);
  await saveUnlockedSession({ key, saltBytes, iterations });
  return Array.isArray(data.companies) ? data.companies : [];
}

async function tryLoadUnlockedCompanies() {
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

async function saveCompanies(companies, { createRollbackSnapshot = false } = {}) {
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

async function rollbackPreviousImport() {
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

async function changeVaultPin(oldPin, newPin) {
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

async function importEncryptedVaultBackup(jsonText, backupPin) {
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

function resetVaultCompletely() {
  deleteValue(STORAGE_KEYS.VAULT);
  deleteValue(STORAGE_KEYS.VAULT_BACKUP_PREV);
  lockSessionNow();
}

  __exports.setupNewVault = setupNewVault;
  __exports.unlockVaultWithPin = unlockVaultWithPin;
  __exports.tryLoadUnlockedCompanies = tryLoadUnlockedCompanies;
  __exports.saveCompanies = saveCompanies;
  __exports.rollbackPreviousImport = rollbackPreviousImport;
  __exports.changeVaultPin = changeVaultPin;
  __exports.importEncryptedVaultBackup = importEncryptedVaultBackup;
  __exports.hasVault = hasVault;
  __exports.hasImportBackup = hasImportBackup;
  __exports.getRawVaultRecord = getRawVaultRecord;
  __exports.resetVaultCompletely = resetVaultCompletely;
  },

  "features/quick-login/xlsx-codec.js": function(__require, __exports) {
/**
 * Bộ đọc/ghi Excel (.xlsx) & CSV thuần JavaScript (Zero Dependencies, 100% Client-Side):
 * - Đọc .xlsx chuẩn OOXML bằng ZIP Central Directory + DecompressionStream('deflate-raw') (Chrome/Edge) hoặc zlib (Node test).
 * - Ghi .xlsx chuẩn OOXML định dạng sẵn kiểu Text (@) cho cả 5 cột để Excel KHÔNG tự cắt số 0 đầu của MST.
 * - Đọc .csv (hỗ trợ UTF-8 BOM, dấu phẩy/chấm phẩy, ô có dấu ngoặc kép) và file .xls dạng HTML/TSV.
 */

// ==================== CRC32 (cho tạo file ZIP/.xlsx chuẩn) ====================
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c >>> 0;
}

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ==================== XML Helpers ====================
function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(str) {
  return String(str ?? '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function colLettersToIndex(letters) {
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function indexToColLetters(index) {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

// ==================== Decompression (Browser + Node) ====================
async function inflateRawBytes(compressedBytes) {
  if (typeof DecompressionStream === 'function') {
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    writer.write(compressedBytes);
    writer.close();
    const chunks = [];
    const reader = ds.readable.getReader();
    let totalLen = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLen += value.length;
    }
    const merged = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return merged;
  }

  // Fallback môi trường Node.js (khi chạy Unit Test)
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    const zlib = null;
    return new Uint8Array(zlib.inflateRawSync(compressedBytes));
  }
  throw new Error('Trình duyệt không hỗ trợ giải nén file .xlsx (DecompressionStream).');
}

// ==================== ZIP Reader (Central Directory) ====================
async function readZipEntries(uint8) {
  const view = new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength);

  // Tìm End of Central Directory (0x06054b50) từ cuối file
  let eocdOffset = -1;
  const minOffset = Math.max(0, uint8.length - 65557);
  for (let i = uint8.length - 22; i >= minOffset; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('File .xlsx không đúng định dạng nén ZIP hợp lệ.');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder('utf-8');
  const entries = new Map();

  let ptr = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) {
      throw new Error('Cấu trúc thư mục tệp .xlsx bị lỗi.');
    }
    const method = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);

    const fileName = decoder.decode(uint8.subarray(ptr + 46, ptr + 46 + nameLen));
    ptr += 46 + nameLen + extraLen + commentLen;

    // Đọc Local File Header để lấy đúng offset bắt đầu dữ liệu nén
    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) continue;
    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const rawSlice = uint8.subarray(dataStart, dataStart + compSize);

    entries.set(fileName, { method, rawSlice });
  }

  const readText = async (name) => {
    const entry = entries.get(name);
    if (!entry) return null;
    let bytes;
    if (entry.method === 0) {
      bytes = entry.rawSlice;
    } else if (entry.method === 8) {
      bytes = await inflateRawBytes(entry.rawSlice);
    } else {
      throw new Error(`Không hỗ trợ phương thức nén ZIP (${entry.method}) trong file .xlsx.`);
    }
    return decoder.decode(bytes);
  };

  return { entries, readText };
}

function parseSharedStringsXml(xml) {
  if (!xml) return [];
  const strings = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let siMatch;
  while ((siMatch = siRe.exec(xml)) !== null) {
    const inner = siMatch[1];
    let combined = '';
    let tMatch;
    tRe.lastIndex = 0;
    while ((tMatch = tRe.exec(inner)) !== null) {
      combined += unescapeXml(tMatch[1]);
    }
    strings.push(combined);
  }
  return strings;
}

function resolveFirstSheetPath(workbookXml, relsXml) {
  if (workbookXml && relsXml) {
    const sheetMatch = workbookXml.match(/<sheet\b[^>]*r:id="([^"]+)"/i);
    if (sheetMatch) {
      const rId = sheetMatch[1];
      const relRe = new RegExp(`<Relationship\\b[^>]*Id="${rId}"[^>]*Target="([^"]+)"`, 'i');
      const relReAlt = new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rId}"`, 'i');
      const relMatch = relsXml.match(relRe) || relsXml.match(relReAlt);
      if (relMatch) {
        const target = relMatch[1].replace(/^\/+/, '');
        return target.startsWith('xl/') ? target : `xl/${target}`;
      }
    }
  }
  return 'xl/worksheets/sheet1.xml';
}

function parseSheetXml(sheetXml, sharedStrings) {
  const rows = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;

  let rowMatch;
  while ((rowMatch = rowRe.exec(sheetXml)) !== null) {
    const rowBody = rowMatch[1];
    const rowValues = [];
    let cellMatch;
    cellRe.lastIndex = 0;
    let fallbackCol = 0;

    while ((cellMatch = cellRe.exec(rowBody)) !== null) {
      const attrs = cellMatch[1];
      const cellInner = cellMatch[2];

      const refMatch = attrs.match(/\br="([A-Z]+)\d+"/i);
      const colIdx = refMatch ? colLettersToIndex(refMatch[1].toUpperCase()) : fallbackCol;
      fallbackCol = colIdx + 1;

      const typeMatch = attrs.match(/\bt="([^"]+)"/i);
      const cellType = typeMatch ? typeMatch[1] : '';

      let val = '';
      if (cellType === 's') {
        const vMatch = cellInner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
        const sIdx = vMatch ? parseInt(vMatch[1].trim(), 10) : -1;
        val = sIdx >= 0 && sIdx < sharedStrings.length ? sharedStrings[sIdx] : '';
      } else if (cellType === 'inlineStr') {
        const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
        let tMatch;
        while ((tMatch = tRe.exec(cellInner)) !== null) {
          val += unescapeXml(tMatch[1]);
        }
      } else if (cellType === 'b') {
        const vMatch = cellInner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
        val = vMatch && vMatch[1].trim() === '1' ? 'TRUE' : 'FALSE';
      } else {
        const vMatch = cellInner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
        val = vMatch ? unescapeXml(vMatch[1]) : '';
      }

      while (rowValues.length < colIdx) rowValues.push('');
      rowValues[colIdx] = val;
    }

    if (rowValues.some((cell) => String(cell || '').trim() !== '')) {
      rows.push(rowValues);
    }
  }
  return rows;
}

async function parseXlsxBytes(uint8) {
  const zip = await readZipEntries(uint8);
  const workbookXml = await zip.readText('xl/workbook.xml');
  const relsXml = await zip.readText('xl/_rels/workbook.xml.rels');
  const sharedStringsXml = await zip.readText('xl/sharedStrings.xml');
  const sheetPath = resolveFirstSheetPath(workbookXml, relsXml);
  const sheetXml = (await zip.readText(sheetPath)) || (await zip.readText('xl/worksheets/sheet1.xml'));
  if (!sheetXml) {
    throw new Error('Không tìm thấy trang tính (Sheet 1) trong file .xlsx.');
  }
  const sharedStrings = parseSharedStringsXml(sharedStringsXml);
  return parseSheetXml(sheetXml, sharedStrings);
}

// ==================== CSV / HTML-Table Parser ====================
function detectCsvDelimiter(text) {
  const firstLine = text.split(/\r?\n/)[0] || '';
  const commas = (firstLine.match(/,/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  const tabs = (firstLine.match(/\t/g) || []).length;
  if (tabs >= 4 && tabs >= commas && tabs >= semis) return '\t';
  if (semis > commas && semis >= 3) return ';';
  return ',';
}

function parseCsvText(rawText) {
  const text = String(rawText || '').replace(/^\uFEFF/, '');
  const delimiter = detectCsvDelimiter(text);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.some((c) => c.trim() !== '')) rows.push(row);
  }
  return rows;
}

function parseHtmlTableText(htmlText) {
  const rows = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let trMatch;
  while ((trMatch = trRe.exec(htmlText)) !== null) {
    const cols = [];
    let cellMatch;
    cellRe.lastIndex = 0;
    while ((cellMatch = cellRe.exec(trMatch[1])) !== null) {
      const stripped = cellMatch[1].replace(/<[^>]+>/g, '');
      cols.push(unescapeXml(stripped).trim());
    }
    if (cols.some((c) => c !== '')) rows.push(cols);
  }
  return rows;
}

/**
 * Đọc thống nhất file .xlsx, .csv (hoặc .xls dạng HTML/TSV) từ Uint8Array + tên file.
 */
async function parseSpreadsheetFileBytes(uint8, fileName = '') {
  const lower = String(fileName || '').toLowerCase();

  // Kiểm tra magic bytes ZIP ("PK\x03\x04") → .xlsx
  const isZip =
    uint8.length >= 4 &&
    uint8[0] === 0x50 &&
    uint8[1] === 0x4b &&
    uint8[2] === 0x03 &&
    uint8[3] === 0x04;

  // Kiểm tra magic bytes OLE2 nhị phân cũ (Excel 97-2003 .xls: D0 CF 11 E0)
  const isLegacyBinaryXls =
    uint8.length >= 4 &&
    uint8[0] === 0xd0 &&
    uint8[1] === 0xcf &&
    uint8[2] === 0x11 &&
    uint8[3] === 0xe0;

  if (isZip || lower.endsWith('.xlsx')) {
    if (!isZip) {
      throw new Error('File có đuôi .xlsx nhưng nội dung không phải tệp Excel hợp lệ.');
    }
    return { format: 'xlsx', rows: await parseXlsxBytes(uint8) };
  }

  if (isLegacyBinaryXls) {
    throw new Error(
      'File đang ở định dạng Excel 97–2003 cũ (.xls nhị phân). Bạn vui lòng mở bằng Excel → chọn Lưu thành (Save As) → chọn "Excel Workbook (*.xlsx)" hoặc "CSV UTF-8" rồi nhập lại nhé!',
    );
  }

  const text = new TextDecoder('utf-8', { fatal: false }).decode(uint8);
  if (/<table\b/i.test(text) && /<tr\b/i.test(text)) {
    return { format: 'html-xls', rows: parseHtmlTableText(text) };
  }
  return { format: 'csv', rows: parseCsvText(text) };
}

// ==================== ZIP / XLSX Writer (Tạo file mẫu & xuất sao lưu chuẩn Text @) ====================
function createStoredZipBytes(files) {
  const encoder = new TextEncoder();
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const dataBytes =
      typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
    const checksum = crc32(dataBytes);

    // Local File Header (30 bytes + name)
    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // Stored (no compression)
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x5421, true);
    lv.setUint32(14, checksum, true);
    lv.setUint32(18, dataBytes.length, true);
    lv.setUint32(22, dataBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    lh.set(nameBytes, 30);

    // Central Directory Header (46 bytes + name)
    const ch = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x5421, true);
    cv.setUint32(16, checksum, true);
    cv.setUint32(20, dataBytes.length, true);
    cv.setUint32(24, dataBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    ch.set(nameBytes, 46);

    localChunks.push(lh, dataBytes);
    centralChunks.push(ch);
    offset += lh.length + dataBytes.length;
  }

  let cdSize = 0;
  for (const ch of centralChunks) cdSize += ch.length;

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalLen = offset + cdSize + eocd.length;
  const result = new Uint8Array(totalLen);
  let pos = 0;
  for (const part of localChunks) {
    result.set(part, pos);
    pos += part.length;
  }
  for (const part of centralChunks) {
    result.set(part, pos);
    pos += part.length;
  }
  result.set(eocd, pos);
  return result;
}

/**
 * Tạo file .xlsx chuẩn 5 cột với định dạng Text (@ - numFmtId=49) cho toàn bộ cột A..E
 * để kế toán gõ MST bắt đầu bằng số 0 không bao giờ bị Excel tự cắt mất số 0 đầu.
 */
function buildXlsxBytes(rows, { sheetName = 'DanhSachMST', preformatBlankRows = 0 } = {}) {
  const xmlRows = [];
  for (let r = 0; r < rows.length; r++) {
    const rowNum = r + 1;
    const styleId = r === 0 ? 1 : 2; // 1 = Header xanh #006FBC chữ trắng đậm; 2 = Text (@)
    const cols = rows[r] || [];
    const cellXml = [];
    for (let c = 0; c < Math.max(5, cols.length); c++) {
      const ref = `${indexToColLetters(c)}${rowNum}`;
      const val = cols[c] ?? '';
      cellXml.push(`<c r="${ref}" t="inlineStr" s="${styleId}"><is><t>${escapeXml(val)}</t></is></c>`);
    }
    xmlRows.push(`<row r="${rowNum}">${cellXml.join('')}</row>`);
  }

  // Tạo sẵn các dòng trống đã gán style Text (@) trong file mẫu để kế toán nhập tay giữ nguyên số 0 đầu
  for (let k = 0; k < preformatBlankRows; k++) {
    const rowNum = rows.length + 1 + k;
    const cellXml = [];
    for (let c = 0; c < 5; c++) {
      const ref = `${indexToColLetters(c)}${rowNum}`;
      cellXml.push(`<c r="${ref}" s="2"/>`);
    }
    xmlRows.push(`<row r="${rowNum}">${cellXml.join('')}</row>`);
  }

  const sheetXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<cols>' +
    '<col min="1" max="1" width="18" customWidth="1" style="2"/>' +
    '<col min="2" max="2" width="38" customWidth="1" style="2"/>' +
    '<col min="3" max="3" width="22" customWidth="1" style="2"/>' +
    '<col min="4" max="4" width="20" customWidth="1" style="2"/>' +
    '<col min="5" max="5" width="30" customWidth="1" style="2"/>' +
    '</cols>' +
    `<sheetData>${xmlRows.join('')}</sheetData>` +
    '</worksheet>';

  const stylesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2">' +
    '<font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="3">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF006FBC"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="3">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '</cellXfs>' +
    '</styleSheet>';

  const contentTypesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '</Types>';

  const rootRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  const workbookXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
    '</workbook>';

  const wbRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';

  return createStoredZipBytes([
    { name: '[Content_Types].xml', content: contentTypesXml },
    { name: '_rels/.rels', content: rootRelsXml },
    { name: 'xl/workbook.xml', content: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', content: wbRelsXml },
    { name: 'xl/styles.xml', content: stylesXml },
    { name: 'xl/worksheets/sheet1.xml', content: sheetXml },
  ]);
}

function buildCsvBytes(rows) {
  const escapeCell = (val) => {
    const s = String(val ?? '');
    if (/[",\r\n]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const body = rows.map((r) => r.map(escapeCell).join(',')).join('\r\n');
  return new TextEncoder().encode(`\uFEFF${body}`);
}

  __exports.parseXlsxBytes = parseXlsxBytes;
  __exports.parseSpreadsheetFileBytes = parseSpreadsheetFileBytes;
  __exports.parseCsvText = parseCsvText;
  __exports.buildXlsxBytes = buildXlsxBytes;
  __exports.buildCsvBytes = buildCsvBytes;
  },

  "features/quick-login/importer.js": function(__require, __exports) {
const { normalizeVietnamese } = __require("adapters/etax-adapter.js");
const { parseSpreadsheetFileBytes, buildXlsxBytes, buildCsvBytes } = __require("features/quick-login/xlsx-codec.js");

/**
 * Thứ tự 5 cột bắt buộc theo đặc tả:
 * Cột 1: Mã số thuế | Cột 2: Tên công ty | Cột 3: Tài khoản | Cột 4: Mật khẩu | Cột 5: Ghi chú
 */
const TEMPLATE_HEADERS = [
  'Mã số thuế',
  'Tên công ty',
  'Tài khoản',
  'Mật khẩu',
  'Ghi chú',
];

function isHeaderRow(row) {
  const c0 = normalizeVietnamese(row[0]);
  const c1 = normalizeVietnamese(row[1]);
  const c2 = normalizeVietnamese(row[2]);
  return (
    (c0.includes('ma so thue') || c0 === 'mst') &&
    (c1.includes('ten cong ty') || c1.includes('doanh nghiep') || c1.includes('ten') || c2.includes('tai khoan'))
  );
}

function normalizeTaxCode(raw, { autoPadZero9 = false } = {}) {
  let s = String(raw ?? '').trim().replace(/\s+/g, '');
  const warnings = [];
  const errors = [];

  if (!s) {
    errors.push('Thiếu Mã số thuế');
    return { mst: '', warnings, errors };
  }

  // Chặn định dạng khoa học Excel (VD: 1.01234E+09)
  if (/e\+/i.test(s)) {
    errors.push('MST bị Excel đổi sang dạng khoa học (E+). Hãy định dạng cột MST kiểu Text (@) trong Excel.');
    return { mst: s, warnings, errors };
  }

  // Phát hiện MST 9 chữ số (rất hay gặp do Excel tự cắt số 0 đầu của MST 10 số)
  if (/^\d{9}$/.test(s)) {
    if (autoPadZero9) {
      s = `0${s}`;
      warnings.push('Đã tự bổ sung số 0 đầu cho MST 9 số');
    } else {
      warnings.push('MST chỉ có 9 chữ số (nghi bị Excel cắt mất số 0 đầu)');
    }
  } else if (/^\d{12}$/.test(s)) {
    if (autoPadZero9) {
      s = `0${s}`;
      warnings.push('Đã tự bổ sung số 0 đầu cho MST 12 số');
    } else {
      warnings.push('MST chỉ có 12 chữ số (nghi thiếu số 0 đầu)');
    }
  } else if (!/^\d{10}(-\d{3})?$/.test(s)) {
    warnings.push('MST không khớp mẫu chuẩn 10 số hoặc 10-3 số');
  }

  return { mst: s, warnings, errors };
}

function normalizeAccount(rawAccount, mst) {
  const trimmed = String(rawAccount ?? '').trim();
  if (trimmed) {
    return { account: trimmed, autoGenerated: false };
  }
  if (mst) {
    return { account: `${mst}-QL`, autoGenerated: true };
  }
  return { account: '', autoGenerated: false };
}

function makeCompanyKey(item) {
  return String(item.account || item.mst || '').trim().toUpperCase();
}

/**
 * Phân tích & kiểm lỗi toàn bộ dòng Import để hiển thị màn hình Xem trước (Preview Guard) trước khi ghi.
 */
function analyzeImportRows(rawRows, existingList = [], options = {}) {
  const { autoPadZero9 = false } = options;
  const existingMap = new Map(existingList.map((item) => [makeCompanyKey(item), item]));

  let startIndex = 0;
  if (rawRows.length > 0 && isHeaderRow(rawRows[0])) {
    startIndex = 1;
  }

  const parsedItems = [];
  const validItems = [];
  const errorRows = [];
  const warningRows = [];
  let updateCount = 0;
  let newCount = 0;
  let autoAccountCount = 0;

  for (let i = startIndex; i < rawRows.length; i++) {
    const row = rawRows[i] || [];
    const excelRowNum = i + 1;
    const rawMst = row[0] ?? '';
    const companyName = String(row[1] ?? '').trim();
    const rawAccount = row[2] ?? '';
    const password = String(row[3] ?? '').trim();
    const note = String(row[4] ?? '').trim();

    if (!String(rawMst).trim() && !companyName && !String(rawAccount).trim() && !password) {
      continue;
    }

    const { mst, warnings, errors } = normalizeTaxCode(rawMst, { autoPadZero9 });
    const { account, autoGenerated } = normalizeAccount(rawAccount, mst);

    if (!companyName) errors.push('Thiếu Tên công ty');
    if (!password) errors.push('Thiếu Mật khẩu');
    if (!account) errors.push('Thiếu Tài khoản đăng nhập');

    if (companyName.includes('\uFFFD') || note.includes('\uFFFD')) {
      warnings.push('Phát hiện ký tự lỗi font tiếng Việt (nên lưu file CSV ở chuẩn UTF-8 hoặc dùng .xlsx)');
    }
    if (autoGenerated) {
      warnings.push(`Cột Tài khoản trống → tự ghép "${account}"`);
      autoAccountCount++;
    }

    const item = {
      id: `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
      mst,
      companyName,
      account,
      password,
      note,
    };

    const key = makeCompanyKey(item);
    const isUpdate = existingMap.has(key);

    const reportRow = {
      rowNumber: excelRowNum,
      item,
      errors,
      warnings,
      status: errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ok',
      action: isUpdate ? 'update' : 'new',
    };

    parsedItems.push(reportRow);

    if (errors.length > 0) {
      errorRows.push(reportRow);
    } else {
      validItems.push(item);
      if (warnings.length > 0) warningRows.push(reportRow);
      if (isUpdate) updateCount++;
      else newCount++;
    }
  }

  return {
    rows: parsedItems,
    validItems,
    summary: {
      totalRows: parsedItems.length,
      validCount: validItems.length,
      errorCount: errorRows.length,
      warningCount: warningRows.length,
      newCount,
      updateCount,
      autoAccountCount,
    },
  };
}

function mergeCompanies(existingList, incomingList, mode = 'merge') {
  if (mode === 'replace') {
    const map = new Map();
    for (const item of incomingList) {
      map.set(makeCompanyKey(item), item);
    }
    return Array.from(map.values());
  }

  const map = new Map();
  for (const item of existingList) {
    map.set(makeCompanyKey(item), item);
  }
  for (const item of incomingList) {
    const key = makeCompanyKey(item);
    const prev = map.get(key);
    map.set(key, prev ? { ...prev, ...item, id: prev.id } : item);
  }
  return Array.from(map.values());
}

async function parseAndAnalyzeFile(uint8, fileName, existingList = [], options = {}) {
  const { format, rows } = await parseSpreadsheetFileBytes(uint8, fileName);
  const analysis = analyzeImportRows(rows, existingList, options);
  return { format, rawRows: rows, ...analysis };
}

function buildTemplateXlsxBytes() {
  const sampleRows = [
    TEMPLATE_HEADERS,
    ['0101234567', 'Công ty TNHH Mẫu Minh Họa (Xóa dòng này khi nhập thật)', '0101234567-QL', 'MatKhauMau@123', 'Kê khai theo Quý'],
  ];
  return buildXlsxBytes(sampleRows, { sheetName: 'DanhSachMST', preformatBlankRows: 100 });
}

function exportCompaniesToXlsxBytes(companies) {
  const rows = [
    TEMPLATE_HEADERS,
    ...companies.map((c) => [c.mst || '', c.companyName || '', c.account || '', c.password || '', c.note || '']),
  ];
  return buildXlsxBytes(rows, { sheetName: 'DanhSachMST', preformatBlankRows: 20 });
}

function exportCompaniesToCsvBytes(companies) {
  const rows = [
    TEMPLATE_HEADERS,
    ...companies.map((c) => [c.mst || '', c.companyName || '', c.account || '', c.password || '', c.note || '']),
  ];
  return buildCsvBytes(rows);
}

  __exports.parseAndAnalyzeFile = parseAndAnalyzeFile;
  __exports.normalizeTaxCode = normalizeTaxCode;
  __exports.normalizeAccount = normalizeAccount;
  __exports.makeCompanyKey = makeCompanyKey;
  __exports.analyzeImportRows = analyzeImportRows;
  __exports.mergeCompanies = mergeCompanies;
  __exports.buildTemplateXlsxBytes = buildTemplateXlsxBytes;
  __exports.exportCompaniesToXlsxBytes = exportCompaniesToXlsxBytes;
  __exports.exportCompaniesToCsvBytes = exportCompaniesToCsvBytes;
  __exports.TEMPLATE_HEADERS = TEMPLATE_HEADERS;
  },

  "features/quick-login/manager-modal.js": function(__require, __exports) {
const { createShadowMount, triggerFileDownload } = __require("ui/shadow-host.js");
const { normalizeVietnamese } = __require("adapters/etax-adapter.js");
const { hasVault, hasImportBackup, getRawVaultRecord, setupNewVault, saveCompanies, rollbackPreviousImport, changeVaultPin, importEncryptedVaultBackup, resetVaultCompletely } = __require("features/quick-login/company-store.js");
const { parseAndAnalyzeFile, mergeCompanies, buildTemplateXlsxBytes, exportCompaniesToXlsxBytes, exportCompaniesToCsvBytes, normalizeAccount } = __require("features/quick-login/importer.js");

const MODAL_CSS = `
.eh-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.52);
  z-index: 2147483640;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.eh-modal {
  width: min(860px, 96vw);
  max-height: 90vh;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.eh-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #006FBC;
  color: #ffffff;
}
.eh-modal-title {
  font-size: 15px;
  font-weight: 600;
}
.eh-close-btn {
  background: rgba(255, 255, 255, 0.16);
  border: none;
  color: #ffffff;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  font-size: 16px;
  cursor: pointer;
}
.eh-close-btn:hover { background: rgba(255, 255, 255, 0.28); }
.eh-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 16px 0;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}
.eh-tab {
  padding: 8px 14px;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  background: transparent;
  color: #475569;
  font-weight: 500;
  cursor: pointer;
}
.eh-tab.active {
  background: #ffffff;
  color: #006FBC;
  border-color: #e2e8f0;
  margin-bottom: -1px;
}
.eh-modal-body {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.eh-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.eh-field label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 4px;
}
.eh-card {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px;
  background: #f8fafc;
}
.eh-table-wrap {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: auto;
  max-height: 280px;
}
.eh-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.eh-table th {
  position: sticky;
  top: 0;
  background: #eef6fc;
  color: #0f172a;
  text-align: left;
  padding: 7px 8px;
  border-bottom: 1px solid #cbd5e1;
  font-weight: 600;
}
.eh-table td {
  padding: 6px 8px;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: top;
}
.eh-row-error { background: #fef2f2; }
.eh-row-warning { background: #fffbeb; }
.eh-pill {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}
.eh-pill-ok { background: #dcfce7; color: #166534; }
.eh-pill-warn { background: #fef3c7; color: #92400e; }
.eh-pill-err { background: #fee2e2; color: #991b1b; }
.eh-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}
.eh-flex {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
`;

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function openCompanyManagerModal({
  mode = 'manage', // 'setup' | 'manage' | 'forgot-pin'
  companies = [],
  onUpdated,
}) {
  const { host, root, cleanup } = createShadowMount(
    'div',
    MODAL_CSS,
    { 'data-etax-role': 'company-manager-modal' },
    { guardBootstrapFocusTrap: true },
  );
  document.body.appendChild(host);

  let currentCompanies = [...companies];
  let activeTab = mode === 'setup' ? 'setup' : mode === 'forgot-pin' ? 'security' : 'list';
  let searchQuery = '';
  let editingId = null;
  let showPasswords = false;
  let statusMsg = null; // { type: 'success' | 'error' | 'warning', text }
  let importPreview = null; // { format, rawRows, fileName, rows, validItems, summary }
  let importAutoPad = true;
  let importMode = 'merge';
  let rawFileBytes = null;
  let rawFileName = '';

  const close = () => {
    cleanup();
    host.remove();
  };

  const notifyParent = () => {
    if (typeof onUpdated === 'function') {
      onUpdated([...currentCompanies]);
    }
  };

  const setStatus = (type, text) => {
    statusMsg = text ? { type, text } : null;
    render();
  };

  const renderStatusBanner = () => {
    if (!statusMsg) return '';
    const cls =
      statusMsg.type === 'error'
        ? 'eh-error'
        : statusMsg.type === 'warning'
          ? 'eh-warning'
          : 'eh-success';
    return `<div class="${cls}">${esc(statusMsg.text)}</div>`;
  };

  const renderSetupView = () => `
    <div class="eh-card">
      <h3 style="margin:0 0 6px; font-size:14px; color:#006FBC;">🔐 Thiết lập mã PIN bảo vệ dữ liệu cục bộ</h3>
      <p class="eh-muted" style="margin:0 0 12px; line-height:1.5;">
        Toàn bộ Mã số thuế, Tài khoản và Mật khẩu khách hàng được <strong>mã hóa AES-256-GCM ngay trên trình duyệt của bạn</strong>, tuyệt đối không gửi ra ngoài.<br/>
        Bạn chỉ cần nhập mã PIN này <strong>1 lần mỗi phiên mở trình duyệt</strong> để dùng cả ngày.
      </p>
      <div class="eh-grid-2">
        <div class="eh-field">
          <label>Tạo mã PIN cá nhân (tối thiểu 4 ký tự, khuyến nghị ≥ 6)</label>
          <input type="password" class="eh-input" id="eh-setup-pin" placeholder="VD: 246810 hoặc mật khẩu ngắn dễ nhớ" autocomplete="new-password"/>
        </div>
        <div class="eh-field">
          <label>Nhập lại mã PIN xác nhận</label>
          <input type="password" class="eh-input" id="eh-setup-pin2" placeholder="Nhập lại giống ô bên trái" autocomplete="new-password"/>
        </div>
      </div>
      <div style="margin-top:12px;" class="eh-flex">
        <button type="button" class="eh-btn eh-btn-primary" id="eh-btn-create-pin">Tạo kho mã hóa &amp; Bắt đầu nhập MST</button>
      </div>
    </div>
  `;

  const renderListTab = () => {
    const editingItem = editingId
      ? currentCompanies.find((c) => c.id === editingId)
      : null;

    const q = normalizeVietnamese(searchQuery);
    const filtered = currentCompanies.filter((c) => {
      if (!q) return true;
      return (
        normalizeVietnamese(c.companyName).includes(q) ||
        normalizeVietnamese(c.mst).includes(q) ||
        normalizeVietnamese(c.account).includes(q) ||
        normalizeVietnamese(c.note).includes(q)
      );
    });

    return `
      <div class="eh-card">
        <div style="font-weight:600; margin-bottom:8px; color:#006FBC;">
          ${editingItem ? '✏️ Chỉnh sửa thông tin công ty' : '➕ Thêm mới công ty'}
        </div>
        <div class="eh-grid-2">
          <div class="eh-field">
            <label>1. Mã số thuế *</label>
            <input class="eh-input" id="eh-f-mst" value="${esc(editingItem?.mst || '')}" placeholder="VD: 0101234567"/>
          </div>
          <div class="eh-field">
            <label>2. Tên công ty *</label>
            <input class="eh-input" id="eh-f-name" value="${esc(editingItem?.companyName || '')}" placeholder="VD: Công ty TNHH ABC"/>
          </div>
          <div class="eh-field">
            <label>3. Tài khoản đăng nhập (để trống tự ghép MST-QL)</label>
            <input class="eh-input" id="eh-f-account" value="${esc(editingItem?.account || '')}" placeholder="VD: 0101234567-QL"/>
          </div>
          <div class="eh-field">
            <label>4. Mật khẩu *</label>
            <input type="${showPasswords ? 'text' : 'password'}" class="eh-input" id="eh-f-pass" value="${esc(editingItem?.password || '')}" placeholder="Mật khẩu đăng nhập"/>
          </div>
        </div>
        <div class="eh-field" style="margin-top:8px;">
          <label>5. Ghi chú (tùy chọn)</label>
          <input class="eh-input" id="eh-f-note" value="${esc(editingItem?.note || '')}" placeholder="VD: Kê khai Quý, người phụ trách..."/>
        </div>
        <div class="eh-flex" style="margin-top:10px;">
          <button type="button" class="eh-btn eh-btn-primary" id="eh-btn-save-item">
            ${editingItem ? 'Lưu thay đổi' : 'Thêm công ty'}
          </button>
          ${editingItem ? '<button type="button" class="eh-btn" id="eh-btn-cancel-edit">Hủy sửa</button>' : ''}
        </div>
      </div>

      <div class="eh-toolbar">
        <input class="eh-input" id="eh-list-search" style="max-width:340px;" value="${esc(searchQuery)}" placeholder="🔍 Lọc theo tên công ty, MST, tài khoản..."/>
        <div class="eh-flex">
          <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:12px;">
            <input type="checkbox" id="eh-toggle-show-pass" ${showPasswords ? 'checked' : ''}/> Hiện mật khẩu
          </label>
          <span class="eh-muted">Tổng: <strong>${currentCompanies.length}</strong> công ty</span>
        </div>
      </div>

      <div class="eh-table-wrap">
        <table class="eh-table">
          <thead>
            <tr>
              <th style="width:115px;">MST</th>
              <th>Tên công ty</th>
              <th style="width:140px;">Tài khoản</th>
              <th style="width:115px;">Mật khẩu</th>
              <th>Ghi chú</th>
              <th style="width:110px;">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${
              filtered.length === 0
                ? '<tr><td colspan="6" style="text-align:center; padding:18px; color:#64748b;">Chưa có công ty nào khớp tìm kiếm. Bạn có thể thêm tay phía trên hoặc chuyển sang tab <strong>Import Excel / CSV</strong>.</td></tr>'
                : filtered
                    .map(
                      (c) => `
              <tr>
                <td><strong>${esc(c.mst)}</strong></td>
                <td>${esc(c.companyName)}</td>
                <td><code>${esc(c.account)}</code></td>
                <td>${showPasswords ? esc(c.password) : '••••••••'}</td>
                <td class="eh-muted">${esc(c.note)}</td>
                <td>
                  <div class="eh-flex" style="gap:4px;">
                    <button type="button" class="eh-btn eh-btn-sm eh-act-edit" data-id="${esc(c.id)}">Sửa</button>
                    <button type="button" class="eh-btn eh-btn-sm eh-btn-danger eh-act-del" data-id="${esc(c.id)}">Xóa</button>
                  </div>
                </td>
              </tr>`,
                    )
                    .join('')
            }
          </tbody>
        </table>
      </div>
    `;
  };

  const renderImportTab = () => {
    const hasBackup = hasImportBackup();
    let previewHtml = '';

    if (importPreview) {
      const s = importPreview.summary;
      previewHtml = `
        <div class="eh-card" style="background:#ffffff;">
          <div class="eh-toolbar" style="margin-bottom:8px;">
            <div class="eh-flex">
              <span class="eh-pill eh-pill-ok">Hợp lệ: ${s.validCount}</span>
              <span class="eh-pill eh-pill-ok">Thêm mới: ${s.newCount}</span>
              <span class="eh-pill eh-pill-warn">Cập nhật: ${s.updateCount}</span>
              ${s.warningCount > 0 ? `<span class="eh-pill eh-pill-warn">Cảnh báo: ${s.warningCount}</span>` : ''}
              ${s.errorCount > 0 ? `<span class="eh-pill eh-pill-err">Lỗi (bỏ qua): ${s.errorCount}</span>` : ''}
            </div>
            <label style="display:flex; align-items:center; gap:5px; font-size:12px; cursor:pointer;">
              <input type="checkbox" id="eh-imp-autopad" ${importAutoPad ? 'checked' : ''}/>
              Tự thêm số <code>0</code> đầu cho MST 9 / 12 số
            </label>
          </div>

          <div class="eh-table-wrap" style="max-height:220px;">
            <table class="eh-table">
              <thead>
                <tr>
                  <th style="width:48px;">Dòng</th>
                  <th>MST</th>
                  <th>Tên công ty</th>
                  <th>Tài khoản</th>
                  <th>Trạng thái &amp; Ghi chú kiểm lỗi</th>
                </tr>
              </thead>
              <tbody>
                ${importPreview.rows
                  .map((r) => {
                    const rowCls =
                      r.status === 'error'
                        ? 'eh-row-error'
                        : r.status === 'warning'
                          ? 'eh-row-warning'
                          : '';
                    const notes = [...r.errors, ...r.warnings].join('; ');
                    return `
                      <tr class="${rowCls}">
                        <td>${r.rowNumber}</td>
                        <td>${esc(r.item.mst)}</td>
                        <td>${esc(r.item.companyName)}</td>
                        <td><code>${esc(r.item.account)}</code></td>
                        <td>
                          ${
                            r.status === 'error'
                              ? `<span class="eh-pill eh-pill-err">Lỗi</span> ${esc(notes)}`
                              : r.status === 'warning'
                                ? `<span class="eh-pill eh-pill-warn">Chú ý</span> ${esc(notes)}`
                                : `<span class="eh-pill eh-pill-ok">${r.action === 'update' ? 'Cập nhật' : 'Thêm mới'}</span>`
                          }
                        </td>
                      </tr>`;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>

          <div class="eh-toolbar" style="margin-top:10px;">
            <div class="eh-flex">
              <label style="cursor:pointer; font-size:12.5px;">
                <input type="radio" name="eh-imp-mode" value="merge" ${importMode === 'merge' ? 'checked' : ''}/>
                <strong>Gộp &amp; Cập nhật</strong> (An toàn — giữ lại công ty cũ không có trong file)
              </label>
              <label style="cursor:pointer; font-size:12.5px; color:#b91c1c;">
                <input type="radio" name="eh-imp-mode" value="replace" ${importMode === 'replace' ? 'checked' : ''}/>
                <strong>Ghi đè toàn bộ</strong>
              </label>
            </div>
            <button type="button" class="eh-btn eh-btn-primary" id="eh-btn-commit-import" ${s.validCount === 0 ? 'disabled' : ''}>
              Lưu ${s.validCount} công ty vào kho mã hóa
            </button>
          </div>
        </div>
      `;
    }

    return `
      <div class="eh-card">
        <div class="eh-toolbar">
          <div>
            <div style="font-weight:600; color:#006FBC;">📥 Nhập từ file Excel (.xlsx) hoặc CSV chuẩn 5 cột</div>
            <div class="eh-muted" style="margin-top:3px;">
              Đúng thứ tự 5 cột: <strong>Mã số thuế | Tên công ty | Tài khoản | Mật khẩu | Ghi chú</strong>.<br/>
              Xử lý 100% ngay trên máy bạn, không gửi dữ liệu lên mạng.
            </div>
          </div>
          <div class="eh-flex">
            <button type="button" class="eh-btn" id="eh-btn-dl-template">📄 Tải file Excel mẫu (.xlsx)</button>
            ${hasBackup ? '<button type="button" class="eh-btn" id="eh-btn-rollback">↩️ Hoàn tác lần Import trước</button>' : ''}
          </div>
        </div>
        <div style="margin-top:10px;" class="eh-flex">
          <input type="file" id="eh-file-input" accept=".xlsx,.csv,.xls" class="eh-input" style="max-width:420px;"/>
        </div>
      </div>
      ${previewHtml}
    `;
  };

  const renderSecurityTab = () => {
    const unlocked = mode !== 'forgot-pin' && hasVault();
    return `
      ${
        unlocked
          ? `
        <div class="eh-card">
          <div style="font-weight:600; color:#006FBC; margin-bottom:8px;">💾 Xuất bản sao lưu cá nhân</div>
          <p class="eh-muted" style="margin:0 0 10px;">
            Khuyến nghị giữ 1 file dự phòng trong thư mục cá nhân để phòng trường hợp đổi máy tính hoặc quên mã PIN.
          </p>
          <div class="eh-flex">
            <button type="button" class="eh-btn" id="eh-btn-export-xlsx">Xuất Excel (.xlsx)</button>
            <button type="button" class="eh-btn" id="eh-btn-export-csv">Xuất CSV UTF-8 (.csv)</button>
            <button type="button" class="eh-btn eh-btn-primary" id="eh-btn-export-enc">Xuất bản mã hóa (.etaxvault.json)</button>
          </div>
        </div>

        <div class="eh-card">
          <div style="font-weight:600; color:#006FBC; margin-bottom:8px;">🔑 Đổi mã PIN</div>
          <div class="eh-grid-2">
            <div class="eh-field">
              <label>Mã PIN hiện tại</label>
              <input type="password" class="eh-input" id="eh-old-pin"/>
            </div>
            <div class="eh-field">
              <label>Mã PIN mới (≥ 4 ký tự)</label>
              <input type="password" class="eh-input" id="eh-new-pin"/>
            </div>
          </div>
          <button type="button" class="eh-btn eh-btn-primary" style="margin-top:10px;" id="eh-btn-change-pin">Cập nhật mã PIN</button>
        </div>
      `
          : ''
      }

      <div class="eh-card">
        <div style="font-weight:600; color:#006FBC; margin-bottom:6px;">📂 Khôi phục từ file sao lưu mã hóa (.etaxvault.json)</div>
        <div class="eh-grid-2">
          <div class="eh-field">
            <label>Chọn file .etaxvault.json</label>
            <input type="file" accept=".json" class="eh-input" id="eh-enc-file"/>
          </div>
          <div class="eh-field">
            <label>Mã PIN của file sao lưu đó</label>
            <input type="password" class="eh-input" id="eh-enc-pin" placeholder="Nhập PIN của file backup"/>
          </div>
        </div>
        <button type="button" class="eh-btn" style="margin-top:8px;" id="eh-btn-restore-enc">Khôi phục bản sao lưu mã hóa</button>
      </div>

      <div class="eh-card" style="border-color:#fecaca; background:#fef2f2;">
        <div style="font-weight:600; color:#b91c1c; margin-bottom:6px;">⚠️ Quên mã PIN — Đặt lại kho dữ liệu (Reset Vault)</div>
        <p class="eh-muted" style="margin:0 0 10px; color:#7f1d1d;">
          Vì dữ liệu được mã hóa AES-256 cục bộ bằng mã PIN cá nhân, nếu quên PIN sẽ không thể giải mã danh sách cũ.
          Bạn có thể xóa kho cũ để tạo PIN mới và Import lại từ file Excel dự phòng trong vài giây.
        </p>
        <button type="button" class="eh-btn eh-btn-danger" id="eh-btn-reset-vault">Xóa kho cũ &amp; Tạo mã PIN mới</button>
      </div>
    `;
  };

  const reanalyzeFile = async () => {
    if (!rawFileBytes) return;
    try {
      const res = await parseAndAnalyzeFile(rawFileBytes, rawFileName, currentCompanies, {
        autoPadZero9: importAutoPad,
      });
      importPreview = { ...res, fileName: rawFileName };
      statusMsg = null;
      render();
    } catch (err) {
      importPreview = null;
      setStatus('error', err.message || 'Không đọc được file.');
    }
  };

  const bindEvents = () => {
    root.querySelector('#eh-close-modal')?.addEventListener('click', close);
    root.querySelector('.eh-backdrop')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) close();
    });

    root.querySelectorAll('.eh-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        statusMsg = null;
        render();
      });
    });

    // Setup PIN
    const handleCreatePin = async () => {
      const p1 = root.querySelector('#eh-setup-pin')?.value || '';
      const p2 = root.querySelector('#eh-setup-pin2')?.value || '';
      if (p1.length < 4) return setStatus('error', 'Mã PIN phải từ 4 ký tự trở lên.');
      if (p1 !== p2) return setStatus('error', 'Hai lần nhập mã PIN chưa khớp nhau.');
      try {
        currentCompanies = await setupNewVault(p1, []);
        mode = 'manage';
        activeTab = 'import';
        notifyParent();
        setStatus('success', 'Đã tạo kho mã hóa AES-256 thành công! Bạn có thể Import Excel hoặc thêm tay từng công ty.');
      } catch (err) {
        setStatus('error', err.message);
      }
    };
    root.querySelector('#eh-btn-create-pin')?.addEventListener('click', handleCreatePin);
    root.querySelector('#eh-setup-pin2')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCreatePin();
      }
    });
    if (activeTab === 'setup') {
      setTimeout(() => root.querySelector('#eh-setup-pin')?.focus(), 40);
    }

    // List tab — auto-suggest MST-QL when typing MST
    const mstInput = root.querySelector('#eh-f-mst');
    const accInput = root.querySelector('#eh-f-account');
    if (mstInput && accInput && !editingId) {
      mstInput.addEventListener('blur', () => {
        const m = mstInput.value.trim();
        if (m && !accInput.value.trim()) {
          accInput.value = `${m}-QL`;
        }
      });
    }

    root.querySelector('#eh-btn-save-item')?.addEventListener('click', async () => {
      const mst = (root.querySelector('#eh-f-mst')?.value || '').trim();
      const companyName = (root.querySelector('#eh-f-name')?.value || '').trim();
      const rawAccount = (root.querySelector('#eh-f-account')?.value || '').trim();
      const password = (root.querySelector('#eh-f-pass')?.value || '').trim();
      const note = (root.querySelector('#eh-f-note')?.value || '').trim();

      if (!mst || !companyName || !password) {
        return setStatus('error', 'Vui lòng điền đủ Mã số thuế, Tên công ty và Mật khẩu.');
      }
      const { account } = normalizeAccount(rawAccount, mst);

      let next;
      if (editingId) {
        next = currentCompanies.map((c) =>
          c.id === editingId ? { ...c, mst, companyName, account, password, note } : c,
        );
      } else {
        const item = {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          mst,
          companyName,
          account,
          password,
          note,
        };
        next = mergeCompanies(currentCompanies, [item], 'merge');
      }

      try {
        currentCompanies = await saveCompanies(next);
        editingId = null;
        notifyParent();
        setStatus('success', 'Đã mã hóa và lưu thông tin công ty thành công.');
      } catch (err) {
        setStatus('error', err.message);
      }
    });

    root.querySelector('#eh-btn-cancel-edit')?.addEventListener('click', () => {
      editingId = null;
      statusMsg = null;
      render();
    });

    root.querySelector('#eh-list-search')?.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      render();
      const el = root.querySelector('#eh-list-search');
      if (el) {
        el.focus();
        el.setSelectionRange(searchQuery.length, searchQuery.length);
      }
    });

    root.querySelector('#eh-toggle-show-pass')?.addEventListener('change', (e) => {
      showPasswords = e.target.checked;
      render();
    });

    root.querySelectorAll('.eh-act-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        editingId = btn.dataset.id;
        statusMsg = null;
        render();
      });
    });

    root.querySelectorAll('.eh-act-del').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const target = currentCompanies.find((c) => c.id === btn.dataset.id);
        if (!target) return;
        if (!window.confirm(`Xóa công ty "${target.companyName}" (${target.account})?`)) return;
        try {
          const next = currentCompanies.filter((c) => c.id !== target.id);
          currentCompanies = await saveCompanies(next);
          if (editingId === target.id) editingId = null;
          notifyParent();
          setStatus('success', `Đã xóa "${target.companyName}".`);
        } catch (err) {
          setStatus('error', err.message);
        }
      });
    });

    // Import tab
    root.querySelector('#eh-btn-dl-template')?.addEventListener('click', () => {
      const bytes = buildTemplateXlsxBytes();
      triggerFileDownload(
        bytes,
        'mau-import-mst-etax.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    });

    root.querySelector('#eh-file-input')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      rawFileName = file.name;
      const buf = await file.arrayBuffer();
      rawFileBytes = new Uint8Array(buf);
      await reanalyzeFile();
    });

    root.querySelector('#eh-imp-autopad')?.addEventListener('change', async (e) => {
      importAutoPad = e.target.checked;
      await reanalyzeFile();
    });

    root.querySelectorAll('input[name="eh-imp-mode"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        importMode = e.target.value;
      });
    });

    root.querySelector('#eh-btn-commit-import')?.addEventListener('click', async () => {
      if (!importPreview || importPreview.validItems.length === 0) return;
      if (importMode === 'replace') {
        const ok1 = window.confirm(
          'CẢNH BÁO: Chế độ "Ghi đè toàn bộ" sẽ thay thế danh sách công ty hiện tại bằng file mới. Bạn chắc chắn muốn tiếp tục?',
        );
        if (!ok1) return;
      }
      try {
        const merged = mergeCompanies(currentCompanies, importPreview.validItems, importMode);
        currentCompanies = await saveCompanies(merged, { createRollbackSnapshot: true });
        const count = importPreview.validItems.length;
        importPreview = null;
        rawFileBytes = null;
        notifyParent();
        setStatus(
          'success',
          `Đã nhập thành công ${count} công ty (tổng hiện có ${currentCompanies.length} công ty). Bản sao lưu trước khi nhập đã được lưu để hoàn tác nếu cần.`,
        );
      } catch (err) {
        setStatus('error', err.message);
      }
    });

    root.querySelector('#eh-btn-rollback')?.addEventListener('click', async () => {
      if (!window.confirm('Khôi phục lại đúng danh sách trước lần Import gần nhất?')) return;
      try {
        currentCompanies = await rollbackPreviousImport();
        notifyParent();
        setStatus('success', `Đã hoàn tác về danh sách trước đó (${currentCompanies.length} công ty).`);
      } catch (err) {
        setStatus('error', err.message);
      }
    });

    // Security tab
    root.querySelector('#eh-btn-export-xlsx')?.addEventListener('click', () => {
      const bytes = exportCompaniesToXlsxBytes(currentCompanies);
      triggerFileDownload(
        bytes,
        `etax-danh-sach-mst-${new Date().toISOString().slice(0, 10)}.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    });

    root.querySelector('#eh-btn-export-csv')?.addEventListener('click', () => {
      const bytes = exportCompaniesToCsvBytes(currentCompanies);
      triggerFileDownload(
        bytes,
        `etax-danh-sach-mst-${new Date().toISOString().slice(0, 10)}.csv`,
        'text/csv;charset=utf-8',
      );
    });

    root.querySelector('#eh-btn-export-enc')?.addEventListener('click', () => {
      const rec = getRawVaultRecord();
      if (!rec) return setStatus('error', 'Chưa có dữ liệu kho để xuất.');
      const bytes = new TextEncoder().encode(JSON.stringify(rec, null, 2));
      triggerFileDownload(
        bytes,
        `etax-backup-encrypted-${new Date().toISOString().slice(0, 10)}.etaxvault.json`,
        'application/json',
      );
    });

    root.querySelector('#eh-btn-change-pin')?.addEventListener('click', async () => {
      const oldPin = root.querySelector('#eh-old-pin')?.value || '';
      const newPin = root.querySelector('#eh-new-pin')?.value || '';
      if (!oldPin || newPin.length < 4) {
        return setStatus('error', 'Nhập mã PIN hiện tại và mã PIN mới (≥ 4 ký tự).');
      }
      try {
        currentCompanies = await changeVaultPin(oldPin, newPin);
        notifyParent();
        setStatus('success', 'Đã đổi mã PIN và mã hóa lại toàn bộ danh sách thành công.');
      } catch (err) {
        setStatus('error', err.message);
      }
    });

    root.querySelector('#eh-btn-restore-enc')?.addEventListener('click', async () => {
      const file = root.querySelector('#eh-enc-file')?.files?.[0];
      const pin = root.querySelector('#eh-enc-pin')?.value || '';
      if (!file || !pin) {
        return setStatus('error', 'Vui lòng chọn file .etaxvault.json và nhập mã PIN của file đó.');
      }
      try {
        const text = await file.text();
        currentCompanies = await importEncryptedVaultBackup(text, pin);
        mode = 'manage';
        activeTab = 'list';
        notifyParent();
        setStatus('success', `Khôi phục thành công ${currentCompanies.length} công ty từ bản sao lưu mã hóa!`);
      } catch (err) {
        setStatus('error', err.message);
      }
    });

    root.querySelector('#eh-btn-reset-vault')?.addEventListener('click', () => {
      const ok1 = window.confirm(
        'Bước 1/2: Xóa toàn bộ kho mã hóa cũ trên máy này? (Hành động không thể hoàn tác nếu bạn chưa có file Excel/Backup dự phòng.)',
      );
      if (!ok1) return;
      const typed = window.prompt('Bước 2/2: Gõ chữ XOA để xác nhận đặt lại mã PIN mới:');
      if (!typed || typed.trim().toUpperCase() !== 'XOA') return;
      resetVaultCompletely();
      currentCompanies = [];
      mode = 'setup';
      activeTab = 'setup';
      notifyParent();
      setStatus('warning', 'Đã xóa kho cũ. Vui lòng tạo mã PIN mới phía dưới rồi Import lại file Excel.');
    });
  };

  const render = () => {
    const showTabs = activeTab !== 'setup' && mode !== 'forgot-pin';
    root.innerHTML = `
      <div class="eh-backdrop">
        <div class="eh-modal">
          <div class="eh-modal-header">
            <div class="eh-modal-title">eTax Helper — Quản lý danh sách MST &amp; Bảo mật PIN</div>
            <button type="button" class="eh-close-btn" id="eh-close-modal" title="Đóng">×</button>
          </div>
          ${
            showTabs
              ? `
            <div class="eh-tabs">
              <button type="button" class="eh-tab ${activeTab === 'list' ? 'active' : ''}" data-tab="list">📋 Danh sách (${currentCompanies.length})</button>
              <button type="button" class="eh-tab ${activeTab === 'import' ? 'active' : ''}" data-tab="import">📥 Import Excel / CSV</button>
              <button type="button" class="eh-tab ${activeTab === 'security' ? 'active' : ''}" data-tab="security">🔐 Bảo mật &amp; Sao lưu</button>
            </div>
          `
              : ''
          }
          <div class="eh-modal-body">
            ${renderStatusBanner()}
            ${
              activeTab === 'setup'
                ? renderSetupView()
                : activeTab === 'import'
                  ? renderImportTab()
                  : activeTab === 'security'
                    ? renderSecurityTab()
                    : renderListTab()
            }
          </div>
        </div>
      </div>
    `;
    bindEvents();
  };

  render();
}

  __exports.openCompanyManagerModal = openCompanyManagerModal;
  },

  "features/quick-login/index.js": function(__require, __exports) {
const { isLoginPage, findLoginFormContext, setNativeInputValue, normalizeVietnamese } = __require("adapters/etax-adapter.js");
const { createDomWatcher } = __require("core/dom-observer.js");
const { createShadowMount } = __require("ui/shadow-host.js");
const { tryLoadUnlockedCompanies, unlockVaultWithPin } = __require("features/quick-login/company-store.js");
const { lockSessionNow, onSessionStateChange } = __require("security/session-unlock.js");
const { openCompanyManagerModal } = __require("features/quick-login/manager-modal.js");

const BAR_CSS = `
.eh-login-box {
  margin-bottom: 14px;
  padding: 10px 12px;
  border: 1px solid #bae0ff;
  border-radius: 8px;
  background: #f0f8ff;
}
.eh-login-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.eh-login-title {
  font-size: 12.5px;
  font-weight: 700;
  color: #006FBC;
  display: flex;
  align-items: center;
  gap: 6px;
}
.eh-actions {
  display: flex;
  gap: 5px;
  align-items: center;
}
.eh-search-wrap {
  position: relative;
}
.eh-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 240px;
  overflow-y: auto;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
  z-index: 9999;
}
.eh-dd-item {
  padding: 8px 10px;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
}
.eh-dd-item:last-child { border-bottom: none; }
.eh-dd-item:hover { background: #eff6ff; }
.eh-dd-name { font-weight: 600; color: #0f172a; font-size: 13px; }
.eh-dd-sub { font-size: 11.5px; color: #475569; margin-top: 2px; }
.eh-dd-note {
  margin-top: 4px;
  padding: 3px 6px;
  border-radius: 4px;
  background: #f8fafc;
  color: #334155;
  font-size: 11.5px;
  border-left: 2px solid #006FBC;
}
.eh-pin-row {
  display: flex;
  gap: 6px;
  align-items: center;
}
.eh-link-btn {
  background: none;
  border: none;
  color: #006FBC;
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
}
`;

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createQuickLoginFeature() {
  let watcher = null;
  let unsubscribeSession = null;
  let mountedHost = null;
  let activeContext = null;

  let vaultState = 'uninitialized'; // 'uninitialized' | 'locked' | 'unlocked'
  let companies = [];
  let searchText = '';
  let dropdownOpen = false;
  let showNotes = false; // Mặc định TẮT theo yêu cầu để gọn giao diện
  let feedbackMsg = null; // { type: 'success' | 'error', text }

  const refreshState = async () => {
    const res = await tryLoadUnlockedCompanies();
    vaultState = res.state;
    companies = res.companies;
    renderBar();
  };

  const applyCompanyToForm = (company) => {
    const ctx = activeContext || findLoginFormContext(document);
    if (!ctx) return;

    const loginUsername = company.account || `${company.mst}-QL`;
    setNativeInputValue(ctx.usernameInput, loginUsername);
    setNativeInputValue(ctx.passwordInput, company.password);

    dropdownOpen = false;
    searchText = company.companyName;
    feedbackMsg = {
      type: 'success',
      text: `Đã điền ${company.companyName} (${loginUsername}) — Nhập mã Captcha để đăng nhập.`,
    };
    renderBar();

    if (ctx.captchaInput) {
      setTimeout(() => {
        ctx.captchaInput.focus();
        ctx.captchaInput.select?.();
      }, 30);
    }
  };

  let barRoot = null;

  const renderBar = () => {
    if (!barRoot) return;

    const filtered =
      vaultState === 'unlocked'
        ? companies.filter((c) => {
            const q = normalizeVietnamese(searchText);
            if (!q) return true;
            return (
              normalizeVietnamese(c.companyName).includes(q) ||
              normalizeVietnamese(c.mst).includes(q) ||
              normalizeVietnamese(c.account).includes(q)
            );
          })
        : [];

    let bodyHtml = '';
    if (vaultState === 'uninitialized') {
      bodyHtml = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
          <span class="eh-muted">Chưa có danh sách MST trên máy này (mã hóa AES cục bộ bằng mã PIN).</span>
          <button type="button" class="eh-btn eh-btn-primary eh-btn-sm" id="eh-ql-setup">🔐 Thiết lập PIN &amp; Nhập MST</button>
        </div>
      `;
    } else if (vaultState === 'locked') {
      bodyHtml = `
        <div class="eh-pin-row">
          <input type="password" class="eh-input" id="eh-ql-pin-input" placeholder="Nhập mã PIN mở khóa (1 lần dùng cả ngày)..." autocomplete="current-password"/>
          <button type="button" class="eh-btn eh-btn-primary" id="eh-ql-pin-unlock" style="white-space:nowrap;">Mở khóa</button>
        </div>
        <div style="margin-top:6px; display:flex; justify-content:space-between; align-items:center;">
          <span class="eh-muted">Dữ liệu lưu cục bộ trên trình duyệt của bạn.</span>
          <button type="button" class="eh-link-btn" id="eh-ql-forgot">Quên mã PIN?</button>
        </div>
      `;
    } else {
      bodyHtml = `
        <div class="eh-search-wrap">
          <input type="text" class="eh-input" id="eh-ql-search" value="${esc(searchText)}" placeholder="🔍 Gõ tên công ty hoặc MST để chọn nhanh (${companies.length} công ty)..." autocomplete="off"/>
          ${
            dropdownOpen
              ? `
            <div class="eh-dropdown" id="eh-ql-dropdown">
              ${
                filtered.length === 0
                  ? `<div style="padding:10px; text-align:center;" class="eh-muted">${
                      companies.length === 0
                        ? 'Danh sách đang trống — bấm nút <strong>Quản lý</strong> để thêm hoặc Import Excel.'
                        : 'Không tìm thấy công ty phù hợp.'
                    }</div>`
                  : filtered
                      .slice(0, 60)
                      .map(
                        (c) => `
                  <div class="eh-dd-item" data-id="${esc(c.id)}">
                    <div class="eh-dd-name">${esc(c.companyName)}</div>
                    <div class="eh-dd-sub">Tài khoản: <strong>${esc(c.account || `${c.mst}-QL`)}</strong> · MST: ${esc(c.mst)}</div>
                    ${showNotes && c.note ? `<div class="eh-dd-note">${esc(c.note)}</div>` : ''}
                  </div>`,
                      )
                      .join('')
              }
            </div>
          `
              : ''
          }
        </div>
      `;
    }

    barRoot.innerHTML = `
      <div class="eh-login-box">
        <div class="eh-login-head">
          <div class="eh-login-title">⚡ Chọn nhanh MST (Doanh nghiệp)</div>
          <div class="eh-actions">
            ${
              vaultState === 'unlocked'
                ? `
              <button type="button" class="eh-btn eh-btn-sm" id="eh-ql-toggle-notes" title="Bật/tắt hiển thị cột Ghi chú trong danh sách">
                ${showNotes ? '📝 Ẩn ghi chú' : '📝 Ghi chú'}
              </button>
              <button type="button" class="eh-btn eh-btn-sm" id="eh-ql-manage">⚙️ Quản lý</button>
              <button type="button" class="eh-btn eh-btn-sm" id="eh-ql-lock" title="Khóa ngay danh sách MST">🔒</button>
            `
                : ''
            }
          </div>
        </div>
        ${bodyHtml}
        ${
          feedbackMsg
            ? `<div class="${feedbackMsg.type === 'error' ? 'eh-error' : 'eh-success'}" style="margin-top:8px;">${esc(feedbackMsg.text)}</div>`
            : ''
        }
      </div>
    `;

    // Bind events
    barRoot.querySelector('#eh-ql-setup')?.addEventListener('click', () => {
      openCompanyManagerModal({
        mode: 'setup',
        companies: [],
        onUpdated: () => refreshState(),
      });
    });

    const handleUnlock = async () => {
      const pin = barRoot.querySelector('#eh-ql-pin-input')?.value || '';
      if (!pin) return;
      try {
        companies = await unlockVaultWithPin(pin);
        vaultState = 'unlocked';
        feedbackMsg = null;
        dropdownOpen = true;
        renderBar();
        barRoot.querySelector('#eh-ql-search')?.focus();
      } catch (err) {
        feedbackMsg = { type: 'error', text: err.message || 'Mã PIN không đúng.' };
        renderBar();
      }
    };

    barRoot.querySelector('#eh-ql-pin-unlock')?.addEventListener('click', handleUnlock);
    barRoot.querySelector('#eh-ql-pin-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleUnlock();
      }
    });

    barRoot.querySelector('#eh-ql-forgot')?.addEventListener('click', () => {
      openCompanyManagerModal({
        mode: 'forgot-pin',
        companies: [],
        onUpdated: () => refreshState(),
      });
    });

    barRoot.querySelector('#eh-ql-toggle-notes')?.addEventListener('click', () => {
      showNotes = !showNotes;
      renderBar();
    });

    barRoot.querySelector('#eh-ql-manage')?.addEventListener('click', () => {
      dropdownOpen = false;
      openCompanyManagerModal({
        mode: 'manage',
        companies,
        onUpdated: () => refreshState(),
      });
    });

    barRoot.querySelector('#eh-ql-lock')?.addEventListener('click', () => {
      lockSessionNow();
      feedbackMsg = null;
      dropdownOpen = false;
      refreshState();
    });

    const searchInput = barRoot.querySelector('#eh-ql-search');
    if (searchInput) {
      searchInput.addEventListener('focus', () => {
        if (!dropdownOpen) {
          dropdownOpen = true;
          renderBar();
          const el = barRoot.querySelector('#eh-ql-search');
          el?.focus();
          el?.setSelectionRange(searchText.length, searchText.length);
        }
      });
      searchInput.addEventListener('input', (e) => {
        searchText = e.target.value;
        dropdownOpen = true;
        feedbackMsg = null;
        renderBar();
        const el = barRoot.querySelector('#eh-ql-search');
        el?.focus();
        el?.setSelectionRange(searchText.length, searchText.length);
      });
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          dropdownOpen = false;
          renderBar();
        }
      });
    }

    barRoot.querySelectorAll('.eh-dd-item').forEach((itemEl) => {
      itemEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const target = companies.find((c) => c.id === itemEl.dataset.id);
        if (target) applyCompanyToForm(target);
      });
    });
  };

  const onDocumentClick = (e) => {
    if (!dropdownOpen || !mountedHost) return;
    if (!mountedHost.contains(e.target)) {
      dropdownOpen = false;
      renderBar();
    }
  };

  const mountIfPresent = () => {
    if (!isLoginPage(location)) return;
    const ctx = findLoginFormContext(document);
    if (!ctx) return;
    activeContext = ctx;

    if (mountedHost && ctx.container.contains(mountedHost)) return;
    if (mountedHost) mountedHost.remove();

    const { host, root } = createShadowMount('div', BAR_CSS, {
      'data-etax-role': 'quick-login-bar',
    });
    mountedHost = host;
    barRoot = root;

    // Chèn ngay đầu .modal-body (phía trên dòng "Tên đăng nhập") để không đụng badge Kaspersky
    ctx.container.insertBefore(host, ctx.container.firstChild);
    refreshState();
  };

  return {
    start() {
      if (!isLoginPage(location)) return;
      document.addEventListener('click', onDocumentClick);
      unsubscribeSession = onSessionStateChange(() => refreshState());
      watcher = createDomWatcher(mountIfPresent, { debounceMs: 150 });
      watcher.start();
    },

    stop() {
      document.removeEventListener('click', onDocumentClick);
      if (watcher) {
        watcher.stop();
        watcher = null;
      }
      if (unsubscribeSession) {
        unsubscribeSession();
        unsubscribeSession = null;
      }
      if (mountedHost) {
        mountedHost.remove();
        mountedHost = null;
        barRoot = null;
      }
    },
  };
}

  __exports.createQuickLoginFeature = createQuickLoginFeature;
  },

  "features/date-presets/date-engine.js": function(__require, __exports) {
/**
 * Máy trạng thái thuần túy (Pure Functions) cho Tính năng 2 — Chọn nhanh khoảng thời gian.
 * Đáp ứng đầy đủ 2 chế độ:
 *  - 'range': Tự điền cả "Từ ngày" (ngày đầu kỳ) và "Đến ngày" (ngày cuối kỳ).
 *  - 'end_only': Giữ nguyên "Từ ngày" hiện có, chỉ cập nhật "Đến ngày" thành ngày cuối của Năm/Quý/Tháng/Chọn nhanh.
 */

const QUICK_PRESETS = [
  { id: 'today', label: 'Hôm nay' },
  { id: 'yesterday', label: 'Hôm qua' },
  { id: 'last7Days', label: '7 ngày qua' },
  { id: 'last30Days', label: '30 ngày qua' },
  { id: 'thisMonth', label: 'Tháng này' },
  { id: 'lastMonth', label: 'Tháng trước' },
  { id: 'thisQuarter', label: 'Quý này' },
  { id: 'lastQuarter', label: 'Quý trước' },
  { id: 'thisYear', label: 'Năm nay' },
  { id: 'lastYear', label: 'Năm trước' },
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function lastDayOfMonth(year, month1To12) {
  return new Date(year, month1To12, 0).getDate();
}

function formatDateDDMMYYYY(date) {
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function parseDateDDMMYYYY(str) {
  const m = String(str || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const y = parseInt(m[3], 10);
  if (mo < 1 || mo > 12) return null;
  const maxD = lastDayOfMonth(y, mo);
  if (d < 1 || d > maxD) return null;
  return new Date(y, mo - 1, d);
}

/**
 * Trả về danh sách tháng hiển thị trong ô Tháng:
 * - Nếu đã chọn Quý (1..4) → CHỈ trả về đúng 3 tháng thuộc Quý đó.
 * - Nếu chưa chọn Quý → trả về đủ 12 tháng [1..12].
 */
function getAvailableMonths(quarter) {
  if (quarter === 1) return [1, 2, 3];
  if (quarter === 2) return [4, 5, 6];
  if (quarter === 3) return [7, 8, 9];
  if (quarter === 4) return [10, 11, 12];
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
}

function getQuarterRange(year, quarter) {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = quarter * 3;
  return {
    fromDate: new Date(year, startMonth - 1, 1),
    toDate: new Date(year, endMonth - 1, lastDayOfMonth(year, endMonth)),
  };
}

function getMonthRange(year, month) {
  return {
    fromDate: new Date(year, month - 1, 1),
    toDate: new Date(year, month - 1, lastDayOfMonth(year, month)),
  };
}

function getYearRange(year) {
  return {
    fromDate: new Date(year, 0, 1),
    toDate: new Date(year, 11, 31),
  };
}

function computeQuickPresetRange(presetId, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const today = new Date(y, m - 1, d);

  switch (presetId) {
    case 'today':
      return { fromDate: today, toDate: today };
    case 'yesterday': {
      const yest = new Date(y, m - 1, d - 1);
      return { fromDate: yest, toDate: yest };
    }
    case 'last7Days':
      return { fromDate: new Date(y, m - 1, d - 6), toDate: today };
    case 'last30Days':
      return { fromDate: new Date(y, m - 1, d - 29), toDate: today };
    case 'thisMonth':
      return getMonthRange(y, m);
    case 'lastMonth': {
      const prevY = m === 1 ? y - 1 : y;
      const prevM = m === 1 ? 12 : m - 1;
      return getMonthRange(prevY, prevM);
    }
    case 'thisQuarter': {
      const q = Math.floor((m - 1) / 3) + 1;
      return getQuarterRange(y, q);
    }
    case 'lastQuarter': {
      const q = Math.floor((m - 1) / 3) + 1;
      const prevQ = q === 1 ? 4 : q - 1;
      const prevY = q === 1 ? y - 1 : y;
      return getQuarterRange(prevY, prevQ);
    }
    case 'thisYear':
      return getYearRange(y);
    case 'lastYear':
      return getYearRange(y - 1);
    default:
      return null;
  }
}

function createInitialDateState() {
  return {
    year: null,
    quarter: null,
    month: null,
    quickPreset: null,
  };
}

/**
 * Cập nhật trạng thái theo quy tắc liên hoàn:
 *  - Chọn Tháng hoặc Quý khi chưa chọn Năm → tự gán Năm hiện tại.
 *  - Chọn Quý mới → xóa lựa chọn Tháng cũ (hoặc nếu Tháng không nằm trong Quý mới).
 *  - Chọn Tháng trong lúc đang chọn Quý → giữ Quý nếu Tháng thuộc Quý đó.
 *  - Chọn Chọn nhanh → lưu quickPreset và xóa 3 dropdown cấp lớn để tránh mâu thuẫn hiển thị.
 */
function reduceDateState(prevState, action, now = new Date()) {
  const currentYear = now.getFullYear();
  const next = { ...prevState };

  if (action.type === 'RESET') {
    return createInitialDateState();
  }

  if (action.type === 'SET_YEAR') {
    const val = action.value ? Number(action.value) : null;
    next.year = val;
    next.quickPreset = null;
    if (!val) {
      next.quarter = null;
      next.month = null;
    }
    return next;
  }

  if (action.type === 'SET_QUARTER') {
    const val = action.value ? Number(action.value) : null;
    next.quarter = val;
    next.quickPreset = null;
    if (val) {
      if (!next.year) next.year = currentYear;
      // Khi người dùng chủ động chọn (hoặc đổi) Quý, xóa Tháng cũ để áp dụng trọn Quý
      next.month = null;
    }
    return next;
  }

  if (action.type === 'SET_MONTH') {
    const val = action.value ? Number(action.value) : null;
    next.month = val;
    next.quickPreset = null;
    if (val) {
      if (!next.year) next.year = currentYear;
      if (next.quarter && !getAvailableMonths(next.quarter).includes(val)) {
        next.quarter = null;
      }
    }
    return next;
  }

  if (action.type === 'SET_QUICK_PRESET') {
    const presetId = action.value || null;
    return {
      year: null,
      quarter: null,
      month: null,
      quickPreset: presetId,
    };
  }

  return next;
}

/**
 * Tính cặp ngày (fromDate, toDate) từ trạng thái hiện tại.
 */
function resolveDateRange(state, now = new Date()) {
  if (state.quickPreset) {
    return computeQuickPresetRange(state.quickPreset, now);
  }
  const y = state.year;
  if (!y) return null;

  if (state.month) {
    return getMonthRange(y, state.month);
  }
  if (state.quarter) {
    return getQuarterRange(y, state.quarter);
  }
  return getYearRange(y);
}

/**
 * Tính kết quả cần điền vào 2 ô input theo chế độ ('range' hoặc 'end_only').
 */
function computeFieldApplication(state, { mode = 'range', existingFromStr = '', now = new Date() } = {}) {
  const range = resolveDateRange(state, now);
  if (!range) return null;

  const computedFromStr = formatDateDDMMYYYY(range.fromDate);
  const computedToStr = formatDateDDMMYYYY(range.toDate);

  if (mode === 'end_only') {
    const existingFromDate = parseDateDDMMYYYY(existingFromStr);
    const isEndBeforeStart = Boolean(
      existingFromDate && range.toDate.getTime() < existingFromDate.getTime(),
    );
    return {
      mode: 'end_only',
      shouldUpdateFrom: false,
      shouldUpdateTo: true,
      fromStr: existingFromStr,
      toStr: computedToStr,
      isEndBeforeStart,
    };
  }

  return {
    mode: 'range',
    shouldUpdateFrom: true,
    shouldUpdateTo: true,
    fromStr: computedFromStr,
    toStr: computedToStr,
    isEndBeforeStart: false,
  };
}

  __exports.pad2 = pad2;
  __exports.lastDayOfMonth = lastDayOfMonth;
  __exports.formatDateDDMMYYYY = formatDateDDMMYYYY;
  __exports.parseDateDDMMYYYY = parseDateDDMMYYYY;
  __exports.getAvailableMonths = getAvailableMonths;
  __exports.getQuarterRange = getQuarterRange;
  __exports.getMonthRange = getMonthRange;
  __exports.getYearRange = getYearRange;
  __exports.computeQuickPresetRange = computeQuickPresetRange;
  __exports.createInitialDateState = createInitialDateState;
  __exports.reduceDateState = reduceDateState;
  __exports.resolveDateRange = resolveDateRange;
  __exports.computeFieldApplication = computeFieldApplication;
  __exports.QUICK_PRESETS = QUICK_PRESETS;
  },

  "features/date-presets/popover-ui.js": function(__require, __exports) {
const { createShadowMount } = __require("ui/shadow-host.js");
const { QUICK_PRESETS, getAvailableMonths, createInitialDateState, reduceDateState, computeFieldApplication } = __require("features/date-presets/date-engine.js");

const POPOVER_CSS = `
.eh-pop {
  position: fixed;
  z-index: 2147483635;
  width: 332px;
  background: #ffffff;
  border: 1px solid #d4dbe5;
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
  padding: 12px;
  color: #1e293b;
}
.eh-pop-mode {
  font-size: 11.5px;
  font-weight: 600;
  color: #006FBC;
  background: #eff8ff;
  border: 1px solid #bae0ff;
  border-radius: 6px;
  padding: 5px 8px;
  margin-bottom: 10px;
}
.eh-pop-mode.end-only {
  color: #0f766e;
  background: #f0fdfa;
  border-color: #99f6e4;
}
.eh-row-3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  margin-bottom: 10px;
}
.eh-line {
  display: grid;
  grid-template-columns: 88px 1fr;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.eh-line label {
  font-size: 12.5px;
  color: #334155;
  font-weight: 500;
}
.eh-preview-val {
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  padding: 5px 8px;
  border-radius: 6px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.eh-preview-val.locked {
  color: #64748b;
  font-weight: 500;
}
.eh-lock-tag {
  font-size: 10.5px;
  padding: 1px 6px;
  border-radius: 999px;
  background: #e2e8f0;
  color: #475569;
}
.eh-pop-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f1f5f9;
}
`;

function createDatePopoverController() {
  let host = null;
  let root = null;
  let cleanupMount = null;
  let activeSession = null; // { anchorEl, mode, state, getFromVal, getToVal, onApply }

  const close = () => {
    activeSession = null;
    if (cleanupMount) {
      cleanupMount();
      cleanupMount = null;
    }
    if (host) {
      host.remove();
      host = null;
      root = null;
    }
    document.removeEventListener('mousedown', onOutsideClick, true);
    document.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('scroll', positionPopover, true);
    window.removeEventListener('resize', positionPopover);
  };

  const onOutsideClick = (e) => {
    if (!host) return;
    if (host.contains(e.target)) return;
    if (activeSession?.anchorEl && activeSession.anchorEl.contains(e.target)) return;
    close();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') close();
  };

  const positionPopover = () => {
    if (!root || !activeSession?.anchorEl) return;
    const pop = root.querySelector('.eh-pop');
    if (!pop) return;

    const rect = activeSession.anchorEl.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;

    let top = rect.bottom + 6;
    if (top + popRect.height > vh - margin && rect.top - popRect.height - 6 >= margin) {
      top = rect.top - popRect.height - 6;
    }
    top = Math.max(margin, Math.min(top, vh - popRect.height - margin));

    let left = rect.left;
    if (left + popRect.width > vw - margin) {
      left = vw - popRect.width - margin;
    }
    left = Math.max(margin, left);

    pop.style.top = `${Math.round(top)}px`;
    pop.style.left = `${Math.round(left)}px`;
  };

  const render = () => {
    if (!root || !activeSession) return;
    const { mode, state, getFromVal, getToVal } = activeSession;
    const now = new Date();
    const currentYear = now.getFullYear();
    const years = [];
    for (let y = currentYear + 1; y >= currentYear - 10; y--) {
      years.push(y);
    }

    const availableMonths = getAvailableMonths(state.quarter);
    const existingFrom = getFromVal() || '';
    const existingTo = getToVal() || '';
    const applied = computeFieldApplication(state, {
      mode,
      existingFromStr: existingFrom,
      now,
    });

    const previewFrom = mode === 'end_only' ? existingFrom || 'dd/mm/yyyy' : applied?.fromStr || existingFrom || 'dd/mm/yyyy';
    const previewTo = applied?.toStr || existingTo || 'dd/mm/yyyy';

    root.innerHTML = `
      <div class="eh-pop">
        <div class="eh-pop-mode ${mode === 'end_only' ? 'end-only' : ''}">
          ${
            mode === 'end_only'
              ? '🎯 Chọn nhanh riêng "Đến ngày" (giữ nguyên "Từ ngày")'
              : '📅 Chọn nhanh khoảng thời gian (Từ ngày → Đến ngày)'
          }
        </div>

        <div class="eh-row-3">
          <select class="eh-select" id="eh-dp-year" aria-label="Năm">
            <option value="">Năm</option>
            ${years.map((y) => `<option value="${y}" ${state.year === y ? 'selected' : ''}>${y}</option>`).join('')}
          </select>

          <select class="eh-select" id="eh-dp-quarter" aria-label="Quý">
            <option value="">Quý</option>
            ${[1, 2, 3, 4]
              .map((q) => `<option value="${q}" ${state.quarter === q ? 'selected' : ''}>Quý ${q}</option>`)
              .join('')}
          </select>

          <select class="eh-select" id="eh-dp-month" aria-label="Tháng">
            <option value="">Tháng</option>
            ${availableMonths
              .map((m) => `<option value="${m}" ${state.month === m ? 'selected' : ''}>Tháng ${m}</option>`)
              .join('')}
          </select>
        </div>

        <div class="eh-line">
          <label for="eh-dp-quick">Chọn nhanh</label>
          <select class="eh-select" id="eh-dp-quick">
            <option value="">Chọn nhanh</option>
            ${QUICK_PRESETS.map(
              (p) =>
                `<option value="${p.id}" ${state.quickPreset === p.id ? 'selected' : ''}>${p.label}</option>`,
            ).join('')}
          </select>
        </div>

        <div class="eh-line">
          <label>Từ ngày</label>
          <div class="eh-preview-val ${mode === 'end_only' ? 'locked' : ''}">
            <span>${previewFrom}</span>
            ${mode === 'end_only' ? '<span class="eh-lock-tag">Giữ nguyên</span>' : ''}
          </div>
        </div>

        <div class="eh-line">
          <label>Đến ngày</label>
          <div class="eh-preview-val">
            <span>${previewTo}</span>
          </div>
        </div>

        ${
          applied?.isEndBeforeStart
            ? '<div class="eh-warning" style="margin-top:4px;">⚠️ Lưu ý: "Đến ngày" vừa chọn đang nhỏ hơn "Từ ngày" hiện tại.</div>'
            : ''
        }

        <div class="eh-pop-foot">
          <button type="button" class="eh-btn eh-btn-sm" id="eh-dp-reset">Xóa chọn</button>
          <span class="eh-muted" style="font-size:11px;">Chỉ điền ngày, không tự tra cứu</span>
          <button type="button" class="eh-btn eh-btn-sm eh-btn-primary" id="eh-dp-close">Xong</button>
        </div>
      </div>
    `;

    const dispatchAction = (action) => {
      activeSession.state = reduceDateState(activeSession.state, action, new Date());
      const res = computeFieldApplication(activeSession.state, {
        mode: activeSession.mode,
        existingFromStr: activeSession.getFromVal() || '',
        now: new Date(),
      });
      if (res) {
        activeSession.onApply(res);
      }
      render();
    };

    root.querySelector('#eh-dp-year')?.addEventListener('change', (e) => {
      dispatchAction({ type: 'SET_YEAR', value: e.target.value });
    });
    root.querySelector('#eh-dp-quarter')?.addEventListener('change', (e) => {
      dispatchAction({ type: 'SET_QUARTER', value: e.target.value });
    });
    root.querySelector('#eh-dp-month')?.addEventListener('change', (e) => {
      dispatchAction({ type: 'SET_MONTH', value: e.target.value });
    });
    root.querySelector('#eh-dp-quick')?.addEventListener('change', (e) => {
      dispatchAction({ type: 'SET_QUICK_PRESET', value: e.target.value });
    });
    root.querySelector('#eh-dp-reset')?.addEventListener('click', () => {
      activeSession.state = createInitialDateState();
      render();
    });
    root.querySelector('#eh-dp-close')?.addEventListener('click', close);

    requestAnimationFrame(positionPopover);
  };

  return {
    open({ anchorEl, mode = 'range', getFromVal, getToVal, onApply }) {
      // Nếu bấm lại đúng nút đang mở thì đóng lại cho tiện tay
      if (activeSession && activeSession.anchorEl === anchorEl) {
        close();
        return;
      }
      close();

      activeSession = {
        anchorEl,
        mode,
        state: createInitialDateState(),
        getFromVal,
        getToVal,
        onApply,
      };

      const mount = createShadowMount(
        'div',
        POPOVER_CSS,
        { 'data-etax-role': 'date-presets-popover' },
        { guardBootstrapFocusTrap: true },
      );
      host = mount.host;
      root = mount.root;
      cleanupMount = mount.cleanup;
      document.body.appendChild(host);

      render();
      document.addEventListener('mousedown', onOutsideClick, true);
      document.addEventListener('keydown', onKeyDown);
      window.addEventListener('scroll', positionPopover, true);
      window.addEventListener('resize', positionPopover);
    },

    close,
  };
}

  __exports.createDatePopoverController = createDatePopoverController;
  },

  "features/date-presets/index.js": function(__require, __exports) {
const { findDateInputPairs, setNativeInputValue } = __require("adapters/etax-adapter.js");
const { createDomWatcher } = __require("core/dom-observer.js");
const { createDatePopoverController } = __require("features/date-presets/popover-ui.js");

const STYLE_ID = 'etax-helper-date-trigger-css';

const TRIGGER_CSS = `
.etax-helper-date-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: 4px;
  padding: 2px 7px;
  height: 24px;
  border: 1px solid #006FBC;
  border-radius: 5px;
  background: #eff8ff;
  color: #006FBC;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  vertical-align: middle;
  line-height: 1;
  transition: background 0.15s, color 0.15s;
}
.etax-helper-date-btn:hover {
  background: #006FBC;
  color: #ffffff;
}
.etax-helper-date-btn.end-only {
  border-color: #0f766e;
  background: #f0fdfa;
  color: #0f766e;
}
.etax-helper-date-btn.end-only:hover {
  background: #0f766e;
  color: #ffffff;
}
.etax-helper-dvc-label-bar {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
`;

function createDatePresetsFeature() {
  let watcher = null;
  let styleEl = null;
  const popover = createDatePopoverController();
  const injectedButtons = new Set();

  const ensureStyle = () => {
    if (styleEl && document.head?.contains(styleEl)) return;
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = TRIGGER_CSS;
    (document.head || document.documentElement).appendChild(styleEl);
  };

  const makeTriggerButton = (label, title, mode, onClick) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `etax-helper-date-btn${mode === 'end_only' ? ' end-only' : ''}`;
    btn.textContent = label;
    btn.title = title;
    btn.setAttribute('data-etax-date-trigger', mode);
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick(btn);
    });
    injectedButtons.add(btn);
    return btn;
  };

  const attachTriggerForInput = (input, button, kind) => {
    if (kind === 'dvc-one-calendar') {
      // Trên dichvucong (Bootstrap 5), input có label phía trên: đặt nút gọn ngay cạnh <label>
      const col = input.closest('.col-md-6, .col, .form-group') || input.parentElement;
      const label = col?.querySelector(`label[for="${input.id}"], label`);
      if (label && label.parentElement) {
        label.appendChild(button);
        return;
      }
    }

    // Trên iframe thuedientu (table td + img.ui-datepicker-trigger): đặt ngay sau icon lịch (nếu có) hoặc sau input
    const nextSibling = input.nextElementSibling;
    if (nextSibling && nextSibling.classList.contains('ui-datepicker-trigger')) {
      nextSibling.insertAdjacentElement('afterend', button);
    } else {
      input.insertAdjacentElement('afterend', button);
    }
  };

  const bindPair = (pair) => {
    const { fromInput, toInput, kind } = pair;
    if (fromInput.getAttribute('data-etax-date-bound') === '1') return;

    fromInput.setAttribute('data-etax-date-bound', '1');
    toInput.setAttribute('data-etax-date-bound', '1');

    const applyResult = (res) => {
      // Ghi đồng thời cả 2 giá trị trước khi bắn sự kiện input/change để tránh trạng thái trung gian Từ ngày > Đến ngày.
      // Tuyệt đối KHÔNG bắn sự kiện `blur` giả trên iframe eTax (tránh vòng lặp onblur CheckDate/_checkDate -> focus() làm nhấp nháy 2 ô).
      if (res.shouldUpdateFrom && res.fromStr) {
        setNativeInputValue(fromInput, res.fromStr, {
          triggerInput: false,
          triggerChange: false,
          triggerBlur: false,
        });
      }
      if (res.shouldUpdateTo && res.toStr) {
        setNativeInputValue(toInput, res.toStr, {
          triggerInput: false,
          triggerChange: false,
          triggerBlur: false,
        });
      }

      if (res.shouldUpdateFrom && res.fromStr) {
        fromInput.dispatchEvent(new Event('input', { bubbles: true }));
        fromInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (res.shouldUpdateTo && res.toStr) {
        toInput.dispatchEvent(new Event('input', { bubbles: true }));
        toInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };

    const rangeBtn = makeTriggerButton(
      '📅 Kỳ',
      'Chọn nhanh khoảng thời gian (tự điền cả Từ ngày và Đến ngày)',
      'range',
      (anchorEl) => {
        popover.open({
          anchorEl,
          mode: 'range',
          getFromVal: () => fromInput.value,
          getToVal: () => toInput.value,
          onApply: applyResult,
        });
      },
    );

    const endBtn = makeTriggerButton(
      '📅 Đến',
      'Chỉ chọn nhanh "Đến ngày" (giữ nguyên "Từ ngày" đang có)',
      'end_only',
      (anchorEl) => {
        popover.open({
          anchorEl,
          mode: 'end_only',
          getFromVal: () => fromInput.value,
          getToVal: () => toInput.value,
          onApply: applyResult,
        });
      },
    );

    attachTriggerForInput(fromInput, rangeBtn, kind);
    attachTriggerForInput(toInput, endBtn, kind);
  };

  const scanAndBind = () => {
    ensureStyle();
    const pairs = findDateInputPairs(document);
    for (const pair of pairs) {
      bindPair(pair);
    }
  };

  return {
    start() {
      watcher = createDomWatcher(scanAndBind, { debounceMs: 180 });
      watcher.start();
    },

    stop() {
      popover.close();
      if (watcher) {
        watcher.stop();
        watcher = null;
      }
      for (const btn of injectedButtons) {
        btn.remove();
      }
      injectedButtons.clear();
      document.querySelectorAll('[data-etax-date-bound="1"]').forEach((el) => {
        el.removeAttribute('data-etax-date-bound');
      });
      if (styleEl) {
        styleEl.remove();
        styleEl = null;
      }
    },
  };
}

  __exports.createDatePresetsFeature = createDatePresetsFeature;
  },

  "features/table-enhancer/index.js": function(__require, __exports) {
const { isDvcOrigin, isEtaxOrigin } = __require("adapters/etax-adapter.js");
const { createDomWatcher } = __require("core/dom-observer.js");

const STYLE_ID = 'etax-helper-table-enhancer-css';

/**
 * CSS cho Cổng mới (dichvucong.gdt.gov.vn — F12 Mẫu 1):
 * - Giữ nguyên độ rộng gọn gàng của form lọc `form#form-search-advanced.container`.
 * - Mở rộng tối đa chiều ngang khung bảng kết quả `#table-container` bên dưới.
 * - Nén các cột `min-width` quá khổ (600px/250px/200px) + bật word-wrap chống kéo thanh cuộn ngang.
 * - Chỉ cố định dòng tiêu đề `thead` (KHÔNG cố định cột trái).
 */
const DVC_TABLE_CSS = `
html, body {
  overflow-x: hidden;
}
#table-container {
  width: min(96vw, calc(100vw - 32px)) !important;
  max-width: none !important;
  margin-left: calc(50% - min(48vw, calc(50vw - 16px))) !important;
  margin-right: 0 !important;
  padding-left: 8px;
  padding-right: 8px;
  box-sizing: border-box;
}
#table-container .main-section {
  width: 100% !important;
  max-width: none !important;
}
#table-container .table-responsive {
  width: 100% !important;
  max-height: 72vh !important;
  overflow: auto !important;
  border: 1px solid #dee2e6;
  border-radius: 6px;
}
#table-container table.table {
  width: 100% !important;
  margin-bottom: 0 !important;
  border-collapse: separate;
  border-spacing: 0;
}
#table-container table.table thead {
  position: sticky !important;
  top: 0 !important;
  z-index: 6 !important;
}
#table-container table.table thead th {
  position: sticky !important;
  top: 0 !important;
  z-index: 6 !important;
  background-color: #cfe2ff !important;
  white-space: normal !important;
  word-wrap: break-word !important;
  overflow-wrap: break-word !important;
  box-shadow: inset 0 -1px 0 #9ec5fe;
}
#table-container table.table td {
  white-space: normal !important;
  word-wrap: break-word !important;
  overflow-wrap: break-word !important;
  vertical-align: middle;
}
`;

/**
 * CSS cho Iframe eTax cổ điển (thuedientu.gdt.gov.vn/etaxnnt/* — F12 Mẫu 2):
 * - Giữ nguyên phần form lọc phía trên ở bố cục gọn gàng.
 * - Mở rộng tối đa `.tab-content` / `.tbody_scroll` bên dưới và gỡ bỏ thuộc tính `width="230%"` trên `table.result_table`.
 * - Hỗ trợ sticky header cho CẢ `thead th` VÀ `thead td` (vì eTax dùng `<thead><tr class="result_head"><td>`).
 * - KHÔNG cố định cột bên trái (an toàn tuyệt đối với bảng có dòng tổng hợp `colspan="5"` / `colspan="13"`).
 */
const ETAX_TABLE_CSS = `
.tab-content,
.tbody_scroll,
#onday_layer_all {
  width: 100% !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
}
.tbody_scroll,
#onday_layer_all {
  max-height: 74vh !important;
  overflow: auto !important;
}
table.result_table,
table.table_format {
  width: 100% !important;
  margin-left: 0 !important;
  border-collapse: separate !important;
  border-spacing: 0 !important;
}
table.result_table thead,
table.table_format thead {
  position: sticky !important;
  top: 0 !important;
  z-index: 6 !important;
}
table.result_table thead th,
table.result_table thead td,
table.table_format thead th,
table.table_format thead td {
  position: sticky !important;
  top: 0 !important;
  z-index: 6 !important;
  white-space: normal !important;
  word-wrap: break-word !important;
  overflow-wrap: break-word !important;
  background-clip: padding-box;
}
table.result_table tbody td,
table.table_format tbody td {
  white-space: normal !important;
  word-wrap: break-word !important;
  overflow-wrap: break-word !important;
}
`;

function createTableEnhancerFeature() {
  let watcher = null;
  let styleEl = null;
  const patchedElements = [];

  const ensureStyle = () => {
    if (styleEl && document.head?.contains(styleEl)) return;
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = isDvcOrigin(location.origin)
      ? DVC_TABLE_CSS
      : isEtaxOrigin(location.origin)
        ? ETAX_TABLE_CSS
        : '';
    (document.head || document.documentElement).appendChild(styleEl);
  };

  const rememberInlineStyle = (el, prop) => {
    if (el.getAttribute(`data-etax-orig-${prop}`) === null) {
      el.setAttribute(`data-etax-orig-${prop}`, el.style.getPropertyValue(prop) || '');
      patchedElements.push({ el, prop });
    }
  };

  const enhanceDvcTables = () => {
    const container = document.getElementById('table-container');
    if (!container) return;

    // Điều chỉnh các cột th có inline style min-width quá khổ (VD: 600px ở cột Tên TTHC)
    const headers = container.querySelectorAll('table.table thead th');
    for (const th of headers) {
      const currentMin = parseInt(th.style.minWidth || '0', 10);
      if (currentMin >= 400) {
        rememberInlineStyle(th, 'min-width');
        rememberInlineStyle(th, 'max-width');
        th.style.minWidth = '200px';
        th.style.maxWidth = '320px';
      } else if (currentMin >= 200) {
        rememberInlineStyle(th, 'min-width');
        rememberInlineStyle(th, 'max-width');
        th.style.minWidth = '135px';
        th.style.maxWidth = '220px';
      } else if (currentMin >= 140) {
        rememberInlineStyle(th, 'min-width');
        th.style.minWidth = '105px';
      }
    }
  };

  const enhanceEtaxTables = () => {
    const tables = document.querySelectorAll('table.result_table, table.table_format');
    for (const table of tables) {
      // Đếm số cột ở dòng tiêu đề để tránh ép bảng 20 cột quá chật dẫn đến vỡ chữ dọc
      const headerCells = table.querySelectorAll('thead tr:first-child th, thead tr:first-child td');
      const colCount = headerCells.length;
      if (colCount >= 14) {
        rememberInlineStyle(table, 'min-width');
        table.style.minWidth = `${Math.min(colCount * 82, 1650)}px`;
      }

      // Đảm bảo nền đặc cho các ô tiêu đề sticky (lấy đúng màu nền gốc của dòng .result_head)
      const headRow = table.querySelector('thead tr');
      if (headRow) {
        const computedBg = window.getComputedStyle(headRow).backgroundColor;
        const solidBg =
          computedBg && computedBg !== 'rgba(0, 0, 0, 0)' && computedBg !== 'transparent'
            ? computedBg
            : '#d9eaf7';

        const allHeadCells = table.querySelectorAll('thead th, thead td');
        for (const cell of allHeadCells) {
          const cellBg = window.getComputedStyle(cell).backgroundColor;
          if (!cellBg || cellBg === 'rgba(0, 0, 0, 0)' || cellBg === 'transparent') {
            rememberInlineStyle(cell, 'background-color');
            cell.style.backgroundColor = solidBg;
          }
        }
      }
    }
  };

  const scan = () => {
    ensureStyle();
    if (isDvcOrigin(location.origin)) {
      enhanceDvcTables();
    } else if (isEtaxOrigin(location.origin)) {
      enhanceEtaxTables();
    }
  };

  return {
    start() {
      watcher = createDomWatcher(scan, { debounceMs: 200 });
      watcher.start();
    },

    stop() {
      if (watcher) {
        watcher.stop();
        watcher = null;
      }
      if (styleEl) {
        styleEl.remove();
        styleEl = null;
      }
      for (const { el, prop } of patchedElements) {
        const orig = el.getAttribute(`data-etax-orig-${prop}`);
        if (orig !== null) {
          if (orig) el.style.setProperty(prop, orig);
          else el.style.removeProperty(prop);
          el.removeAttribute(`data-etax-orig-${prop}`);
        }
      }
      patchedElements.length = 0;
    },
  };
}

  __exports.createTableEnhancerFeature = createTableEnhancerFeature;
  },

  "features/session-timer/keep-alive.js": function(__require, __exports) {
const { KEEP_ALIVE_URL, isKeepAliveResponseAlive } = __require("adapters/etax-adapter.js");
const { getRawFetch } = __require("features/session-timer/network-probe.js");

/**
 * Gửi yêu cầu giữ phiên ngầm (Silent Keep-Alive) chỉ đọc tới `GET /tthc/home`:
 * - Dùng hàm `fetch` gốc trước khi hook (không đụng `_csrf`, không đụng `dse_pageId`, không tự gây reset ảo).
 * - Trả về kết quả kiểm chứng phiên sống/hết hạn để Circuit Breaker ngắt ngay nếu server báo lỗi/redirect login.
 */
async function sendSilentKeepAlive() {
  try {
    const rawFetch = getRawFetch();
    const response = await rawFetch(KEEP_ALIVE_URL, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      redirect: 'follow',
    });

    if ([401, 403, 429].includes(response.status) || response.status >= 500) {
      return {
        ok: false,
        reason: `HTTP ${response.status}`,
        expired: response.status === 401 || response.status === 403,
      };
    }

    const html = await response.text();
    const alive = isKeepAliveResponseAlive(response.status, response.url, html);

    if (!alive) {
      return {
        ok: false,
        reason: 'Máy chủ chuyển về trang đăng nhập hoặc hết phiên',
        expired: true,
      };
    }

    return {
      ok: true,
      timestamp: Date.now(),
    };
  } catch (err) {
    return {
      ok: false,
      reason: err?.message || 'Lỗi kết nối mạng',
      expired: false,
    };
  }
}

  __exports.sendSilentKeepAlive = sendSilentKeepAlive;
  },

  "features/session-timer/timer-widget.js": function(__require, __exports) {
const { createShadowMount } = __require("ui/shadow-host.js");

const WIDGET_CSS = `
@keyframes eh-pulse-red {
  0%, 100% {
    background: #dc2626;
    box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.55);
  }
  50% {
    background: #b91c1c;
    box-shadow: 0 0 0 8px rgba(220, 38, 38, 0);
  }
}
.eh-timer-wrap {
  position: fixed;
  bottom: 14px;
  left: 14px;
  z-index: 2147483620;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}
.eh-timer-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1.5px solid #006FBC;
  background: rgba(255, 255, 255, 0.96);
  color: #006FBC;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.16);
  user-select: none;
  transition: transform 0.12s;
}
.eh-timer-pill:hover {
  transform: translateY(-1px);
}
.eh-timer-pill.warning {
  border-color: #991b1b;
  color: #ffffff;
  animation: eh-pulse-red 1.1s infinite;
}
.eh-timer-pill.expired {
  border-color: #7f1d1d;
  background: #450a0a;
  color: #fecaca;
}
.eh-timer-pill.idle-paused {
  border-color: #b45309;
  background: #fffbeb;
  color: #92400e;
}
.eh-timer-pop {
  width: 248px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 10px 12px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.2);
}
.eh-timer-pop-title {
  font-size: 12.5px;
  font-weight: 700;
  color: #006FBC;
  margin-bottom: 8px;
}
.eh-timer-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.eh-timer-meta {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid #f1f5f9;
  font-size: 11.5px;
  color: #64748b;
  line-height: 1.45;
}
`;

function formatMMSS(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function createTimerWidget({ onChangeMinutes, onManualResume }) {
  let host = null;
  let root = null;
  let cleanupMount = null;
  let editorOpen = false;
  let latestView = {
    remainingSeconds: 15 * 60,
    timeoutMinutes: 15,
    status: 'normal', // 'normal' | 'warning' | 'keeping-alive' | 'idle-paused' | 'expired'
    lastKeepAliveText: '',
    lastResetText: '',
  };

  const render = () => {
    if (!root) return;
    const { remainingSeconds, timeoutMinutes, status, lastKeepAliveText, lastResetText } = latestView;

    let pillCls = 'eh-timer-pill';
    let label = `⏱ ${formatMMSS(remainingSeconds)}`;
    if (status === 'warning') {
      pillCls += ' warning';
      label = `⚠️ ${formatMMSS(remainingSeconds)}`;
    } else if (status === 'keeping-alive') {
      pillCls += ' warning';
      label = `🔄 Đang giữ phiên...`;
    } else if (status === 'expired') {
      pillCls += ' expired';
      label = `⛔ Phiên đã hết hạn`;
    } else if (status === 'idle-paused') {
      pillCls += ' idle-paused';
      label = `⏸ ${formatMMSS(remainingSeconds)} (Tạm dừng giữ phiên)`;
    }

    root.innerHTML = `
      <div class="eh-timer-wrap">
        ${
          editorOpen
            ? `
          <div class="eh-timer-pop">
            <div class="eh-timer-pop-title">⏱ Cài đặt đồng hồ phiên (máy này)</div>
            <div class="eh-timer-row">
              <input type="number" min="1" max="120" class="eh-input" id="eh-tm-input" value="${timeoutMinutes}" style="width:76px;"/>
              <span style="font-size:12.5px;">phút</span>
              <button type="button" class="eh-btn eh-btn-primary eh-btn-sm" id="eh-tm-save">Lưu</button>
              <button type="button" class="eh-btn eh-btn-sm" id="eh-tm-close">Đóng</button>
            </div>
            <div class="eh-timer-meta">
              • Chỉ reset khi có giao tiếp thật với máy chủ thuế.<br/>
              • Đỏ nhấp nháy &lt; 2 phút · Tự giữ phiên ngầm &lt; 15 giây.<br/>
              ${lastResetText ? `• Reset gần nhất: ${lastResetText}<br/>` : ''}
              ${lastKeepAliveText ? `• Giữ phiên ngầm: ${lastKeepAliveText}` : ''}
            </div>
          </div>
        `
            : ''
        }
        <button type="button" class="${pillCls}" id="eh-tm-pill" title="Bấm để chỉnh số phút đếm ngược phiên làm việc">
          ${label}
        </button>
      </div>
    `;

    root.querySelector('#eh-tm-pill')?.addEventListener('click', () => {
      editorOpen = !editorOpen;
      if (status === 'idle-paused' && typeof onManualResume === 'function') {
        onManualResume();
      }
      render();
      if (editorOpen) {
        root.querySelector('#eh-tm-input')?.focus();
      }
    });

    const save = () => {
      const val = parseInt(root.querySelector('#eh-tm-input')?.value || '', 10);
      if (Number.isFinite(val) && val >= 1 && val <= 120) {
        editorOpen = false;
        onChangeMinutes(val);
      }
    };

    root.querySelector('#eh-tm-save')?.addEventListener('click', save);
    root.querySelector('#eh-tm-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') save();
      if (e.key === 'Escape') {
        editorOpen = false;
        render();
      }
    });
    root.querySelector('#eh-tm-close')?.addEventListener('click', () => {
      editorOpen = false;
      render();
    });
  };

  return {
    mount() {
      if (host && document.body?.contains(host)) return;
      const m = createShadowMount(
        'div',
        WIDGET_CSS,
        { 'data-etax-role': 'session-timer-widget' },
        { guardBootstrapFocusTrap: true },
      );
      host = m.host;
      root = m.root;
      cleanupMount = m.cleanup;
      document.body.appendChild(host);
      render();
    },

    update(nextView) {
      latestView = { ...latestView, ...nextView };
      if (!editorOpen) {
        render();
      } else if (root) {
        const pill = root.querySelector('#eh-tm-pill');
        if (pill) {
          const { remainingSeconds, status } = latestView;
          pill.textContent =
            status === 'expired'
              ? '⛔ Phiên đã hết hạn'
              : status === 'keeping-alive'
                ? '🔄 Đang giữ phiên...'
                : status === 'warning'
                  ? `⚠️ ${formatMMSS(remainingSeconds)}`
                  : `⏱ ${formatMMSS(remainingSeconds)}`;
        }
      }
    },

    unmount() {
      editorOpen = false;
      if (cleanupMount) {
        cleanupMount();
        cleanupMount = null;
      }
      if (host) {
        host.remove();
        host = null;
        root = null;
      }
    },
  };
}

  __exports.createTimerWidget = createTimerWidget;
  },

  "features/session-timer/index.js": function(__require, __exports) {
const { isLoggedIn } = __require("adapters/etax-adapter.js");
const { STORAGE_KEYS, getValue, setValue } = __require("core/storage.js");
const { isTopFrame, subscribeServerActivity } = __require("core/frame-bus.js");
const { createDomWatcher } = __require("core/dom-observer.js");
const { sendSilentKeepAlive } = __require("features/session-timer/keep-alive.js");
const { createTimerWidget } = __require("features/session-timer/timer-widget.js");

const DEFAULT_CONFIG = {
  schemaVersion: 1,
  timeoutMinutes: 15,
  maxSilentKeepAlives: 3, // Tối đa 3 lần giữ phiên ngầm liên tiếp nếu hoàn toàn không có tương tác con người
};

const WARNING_THRESHOLD_SEC = 120; // Dưới 2 phút → đỏ nhấp nháy
const KEEP_ALIVE_THRESHOLD_SEC = 15; // Dưới 15 giây → gửi giữ phiên ngầm

function loadTimerConfig() {
  const saved = getValue(STORAGE_KEYS.TIMER_CONFIG, null);
  if (!saved || typeof saved !== 'object') return { ...DEFAULT_CONFIG };
  const mins = Number(saved.timeoutMinutes);
  return {
    schemaVersion: 1,
    timeoutMinutes: Number.isFinite(mins) && mins >= 1 && mins <= 120 ? mins : 15,
    maxSilentKeepAlives: Number(saved.maxSilentKeepAlives) || 3,
  };
}

function saveTimerConfig(cfg) {
  setValue(STORAGE_KEYS.TIMER_CONFIG, {
    schemaVersion: 1,
    timeoutMinutes: cfg.timeoutMinutes,
    maxSilentKeepAlives: cfg.maxSilentKeepAlives,
  });
}

function formatClockTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function createSessionTimerFeature() {
  let config = loadTimerConfig();
  let lastServerActivityAt = Date.now();
  let lastHumanInputAt = Date.now(); // CHỈ dùng cho Idle Cap (KHÔNG bao giờ reset đồng hồ!)
  let consecutiveUnattendedKeepAlives = 0;

  let keepAliveInFlight = false;
  let circuitOpenExpired = false;
  let idlePaused = false;
  let lastKeepAliveText = '';
  let lastResetText = formatClockTime(Date.now());

  let intervalId = null;
  let unsubBus = null;
  let loginWatcher = null;
  let widgetVisible = false;

  const onHumanInteraction = () => {
    lastHumanInputAt = Date.now();
    if (idlePaused) {
      idlePaused = false;
      consecutiveUnattendedKeepAlives = 0;
    }
  };

  const widget = createTimerWidget({
    onChangeMinutes(newMinutes) {
      config.timeoutMinutes = newMinutes;
      saveTimerConfig(config);
      lastServerActivityAt = Date.now();
      circuitOpenExpired = false;
      idlePaused = false;
      consecutiveUnattendedKeepAlives = 0;
      lastResetText = `${formatClockTime(Date.now())} (Đổi thành ${newMinutes}p)`;
      tick();
    },
    onManualResume() {
      idlePaused = false;
      consecutiveUnattendedKeepAlives = 0;
      tick();
    },
  });

  const handleServerActivity = (payload) => {
    const ts = payload?.timestamp || Date.now();
    if (ts < lastServerActivityAt) return;
    lastServerActivityAt = ts;
    circuitOpenExpired = false;
    idlePaused = false;
    consecutiveUnattendedKeepAlives = 0;
    lastResetText = `${formatClockTime(ts)} (${payload?.source || 'server'})`;
    tick();
  };

  const triggerSilentKeepAlive = async () => {
    if (keepAliveInFlight || circuitOpenExpired || idlePaused) return;

    // Kiểm tra Idle Cap: có tương tác con người từ lần keep-alive trước không?
    const hadHumanActivitySinceLastServer = lastHumanInputAt > lastServerActivityAt;
    if (!hadHumanActivitySinceLastServer) {
      if (consecutiveUnattendedKeepAlives >= config.maxSilentKeepAlives) {
        idlePaused = true;
        tick();
        return;
      }
      consecutiveUnattendedKeepAlives += 1;
    } else {
      consecutiveUnattendedKeepAlives = 0;
    }

    keepAliveInFlight = true;
    widget.update({ status: 'keeping-alive' });

    const res = await sendSilentKeepAlive();
    keepAliveInFlight = false;

    if (res.ok) {
      lastServerActivityAt = res.timestamp || Date.now();
      lastKeepAliveText = `Thành công lúc ${formatClockTime(lastServerActivityAt)}`;
      lastResetText = `${formatClockTime(lastServerActivityAt)} (keep-alive)`;
      tick();
    } else {
      lastKeepAliveText = `Dừng (${res.reason})`;
      if (res.expired) {
        circuitOpenExpired = true;
      } else {
        // Lỗi mạng/HTTP 429/5xx: ngắt Circuit Breaker tránh spam máy chủ thuế
        circuitOpenExpired = true;
      }
      tick();
    }
  };

  const tick = () => {
    if (!widgetVisible) return;

    const totalSec = config.timeoutMinutes * 60;
    const elapsedSec = Math.floor((Date.now() - lastServerActivityAt) / 1000);
    const remainingSeconds = Math.max(0, totalSec - elapsedSec);

    if (circuitOpenExpired) {
      widget.update({
        remainingSeconds: 0,
        timeoutMinutes: config.timeoutMinutes,
        status: 'expired',
        lastKeepAliveText,
        lastResetText,
      });
      return;
    }

    if (idlePaused) {
      widget.update({
        remainingSeconds,
        timeoutMinutes: config.timeoutMinutes,
        status: 'idle-paused',
        lastKeepAliveText,
        lastResetText,
      });
      return;
    }

    if (remainingSeconds <= KEEP_ALIVE_THRESHOLD_SEC && !keepAliveInFlight) {
      void triggerSilentKeepAlive();
    }

    const status = keepAliveInFlight
      ? 'keeping-alive'
      : remainingSeconds <= WARNING_THRESHOLD_SEC
        ? 'warning'
        : 'normal';

    widget.update({
      remainingSeconds,
      timeoutMinutes: config.timeoutMinutes,
      status,
      lastKeepAliveText,
      lastResetText,
    });
  };

  const syncLoginVisibility = () => {
    const loggedIn = isLoggedIn(document, location);
    if (loggedIn && !widgetVisible) {
      widgetVisible = true;
      widget.mount();
      tick();
    } else if (!loggedIn && widgetVisible) {
      widgetVisible = false;
      widget.unmount();
    }
  };

  return {
    start() {
      // Đồng hồ chỉ chạy & hiển thị duy nhất ở Top-Frame (dichvucong.gdt.gov.vn)
      if (!isTopFrame()) return;

      config = loadTimerConfig();
      unsubBus = subscribeServerActivity(handleServerActivity);

      window.addEventListener('pointerdown', onHumanInteraction, { passive: true });
      window.addEventListener('keydown', onHumanInteraction, { passive: true });
      window.addEventListener('scroll', onHumanInteraction, { passive: true });

      loginWatcher = createDomWatcher(syncLoginVisibility, { debounceMs: 250 });
      loginWatcher.start();

      intervalId = setInterval(tick, 1000);
    },

    stop() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (unsubBus) {
        unsubBus();
        unsubBus = null;
      }
      if (loginWatcher) {
        loginWatcher.stop();
        loginWatcher = null;
      }
      window.removeEventListener('pointerdown', onHumanInteraction);
      window.removeEventListener('keydown', onHumanInteraction);
      window.removeEventListener('scroll', onHumanInteraction);
      widgetVisible = false;
      widget.unmount();
    },
  };
}

  __exports.createSessionTimerFeature = createSessionTimerFeature;
  },

  "main.js": function(__require, __exports) {
const { getSettings, onSettingsChange, registerTampermonkeyMenu } = __require("core/settings.js");
const { isTopFrame } = __require("core/frame-bus.js");
const { lockSessionNow } = __require("security/session-unlock.js");
const { installNetworkProbe } = __require("features/session-timer/network-probe.js");
const { createQuickLoginFeature } = __require("features/quick-login/index.js");
const { createDatePresetsFeature } = __require("features/date-presets/index.js");
const { createTableEnhancerFeature } = __require("features/table-enhancer/index.js");
const { createSessionTimerFeature } = __require("features/session-timer/index.js");

/**
 * Điểm khởi chạy chính của eTax Helper:
 * 1. Gắn ngay network-probe tại document-start để không bỏ sót bất kỳ request XHR/HTMX/Fetch nào.
 * 2. Chờ DOMContentLoaded để khởi tạo Menu Tampermonkey (chỉ ở Top-Frame) và bật/tắt 4 tính năng theo cài đặt từng máy.
 */

// Bước 1: Gắn cảm biến mạng ngay ở document-start
installNetworkProbe();

function bootstrapUi() {
  const controllers = {
    quickLogin: createQuickLoginFeature(),
    datePresets: createDatePresetsFeature(),
    tableEnhancer: createTableEnhancerFeature(),
    sessionTimer: createSessionTimerFeature(),
  };

  const activeFlags = {
    quickLogin: false,
    datePresets: false,
    tableEnhancer: false,
    sessionTimer: false,
  };

  const applySettings = (settings) => {
    for (const [key, ctrl] of Object.entries(controllers)) {
      const shouldRun = Boolean(settings.features[key]);
      if (shouldRun && !activeFlags[key]) {
        activeFlags[key] = true;
        ctrl.start();
      } else if (!shouldRun && activeFlags[key]) {
        activeFlags[key] = false;
        ctrl.stop();
      }
    }
  };

  if (isTopFrame()) {
    registerTampermonkeyMenu({
      onLockVaultNow() {
        lockSessionNow();
        window.alert('Đã khóa danh sách MST & xóa phiên mã PIN. Lần chọn tiếp theo sẽ yêu cầu nhập lại PIN.');
      },
      onSettingsToggled(updated) {
        applySettings(updated);
      },
    });
  }

  applySettings(getSettings());
  onSettingsChange((nextSettings) => {
    applySettings(nextSettings);
    if (isTopFrame()) {
      registerTampermonkeyMenu({
        onLockVaultNow() {
          lockSessionNow();
          window.alert('Đã khóa danh sách MST & xóa phiên mã PIN.');
        },
        onSettingsToggled(updated) {
          applySettings(updated);
        },
      });
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapUi, { once: true });
} else {
  bootstrapUi();
}


  }
  };

  const __cache = Object.create(null);
  function __require(id) {
    if (__cache[id]) return __cache[id].exports;
    const factory = __modules[id];
    if (!factory) throw new Error('[eTax Helper] Không tìm thấy module: ' + id);
    const mod = { exports: {} };
    __cache[id] = mod;
    factory(__require, mod.exports);
    return mod.exports;
  }

  __require('main.js');
})();
