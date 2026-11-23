// ==UserScript==
// @name         eTax Helper Internal
// @namespace    https://etax-helper.internal/userscript
// @version      2.0.0
// @description  Hỗ trợ nghiệp vụ kế toán nội bộ trên Cổng Dịch vụ công Thuế & eTax (MST mã hóa PIN, Chọn ngày 2 cấp, Mở rộng bảng, Đồng hồ giữ phiên, Unified Dock định danh & Ghi chú, Trợ lý MC/TM & đối soát Xanh/Đỏ, Truy cập nhanh & Ghim tờ khai, Trạng thái CT SigningHub & eSigner)
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
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      localhost
// @connect      127.0.0.1
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
  // v2 keys (hoàn toàn không ảnh hưởng dữ liệu v1)
  DOCK_UI_STATE: 'etax_dock_ui_v2',
  EXTRA_NOTES: 'etax_extra_notes_v1',
  TAX_CODES_CACHE: 'etax_tax_codes_v1',
  BOOKMARKS: 'etax_bookmarks_v1',
  SIGNING_CONFIG: 'etax_signing_config_v1',
  ACTIVE_COMPANY_CTX: 'etax_active_company_v2',
  OPEN_QUICK_ACCESS_EVT: 'etax_open_quick_access_evt_v2',
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
  schemaVersion: 2,
  features: {
    quickLogin: true,
    datePresets: true,
    tableEnhancer: true,
    sessionTimer: true,
    companyBar: true,
    taxCodeHelper: true,
    quickAccess: true,
    signingStatus: true,
  },
};

const FEATURE_MENU_ITEMS = [
  { key: 'quickLogin', label: '1. Chọn nhanh MST & Tự điền' },
  { key: 'datePresets', label: '2. Chọn nhanh khoảng thời gian' },
  { key: 'tableEnhancer', label: '3. Mở rộng bảng & Cố định tiêu đề' },
  { key: 'sessionTimer', label: '4. Đồng hồ phiên làm việc' },
  { key: 'companyBar', label: '5. Thanh định danh Cty & Ghi chú' },
  { key: 'taxCodeHelper', label: '6. Trợ lý Mã Chương / Tiểu mục & Đối soát' },
  { key: 'quickAccess', label: '7. Truy cập nhanh & Ghim tờ khai' },
  { key: 'signingStatus', label: '8. Trạng thái Ký số (SigningHub & eSigner)' },
];

let registeredMenuIds = [];

function getSettings() {
  const saved = getValue(STORAGE_KEYS.SETTINGS, null);
  if (!saved || typeof saved !== 'object') {
    return structuredClone(DEFAULT_SETTINGS);
  }
  return {
    schemaVersion: 2,
    features: {
      ...DEFAULT_SETTINGS.features,
      ...(saved.features || {}),
    },
  };
}

function saveSettings(nextSettings) {
  const normalized = {
    schemaVersion: 2,
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
            schemaVersion: 2,
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
const TTHC_DECLARATION_URL = `${DVC_ORIGIN}/tthc/thu-tuc-hanh-chinh`;
const DATE_FORMAT = 'DD/MM/YYYY';
const DEFAULT_SIGNING_PORTS = {
  signingHub: 32001,
  eSigner: 8768,
};

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

// ============================================================================
// V2 ADAPTERS — ĐÃ XÁC MINH 100% QUA F12 NHÓM A, B, C, D
// ============================================================================

/**
 * Hàm thuần phân tích tên công ty, MST tổ chức và Số định danh (CCCD) từ header `dichvucong.gdt.gov.vn` (Nhóm A).
 * QUAN TRỌNG: Phải khớp đúng nhãn "MST tổ chức" để KHÔNG bắt nhầm "Số định danh" (CCCD 12 số) đứng ngay phía trên!
 */
function parseUserHeaderInfo({ companyNameText = '', dropdownTexts = [] } = {}) {
  const companyName = String(companyNameText || '').replace(/\s+/g, ' ').trim();
  let orgMst = '';
  let personalId = '';

  for (const raw of dropdownTexts) {
    const text = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const norm = normalizeVietnamese(text);

    if (norm.includes('mst') || norm.includes('ma so thue')) {
      const m = text.match(/(\d{10}(?:-\d{3})?)/);
      if (m) {
        orgMst = m[1];
        continue;
      }
    }
    if (norm.includes('so dinh danh') || norm.includes('cccd') || norm.includes('cmnd')) {
      const m = text.match(/(\d{9,14})/);
      if (m) {
        personalId = m[1];
      }
    }
  }

  return {
    mst: orgMst || personalId || '',
    orgMst,
    personalId,
    isOrganization: Boolean(orgMst),
    companyName,
  };
}

/**
 * Trích xuất thông tin doanh nghiệp đang đăng nhập từ DOM của `dichvucong.gdt.gov.vn` (F12 Nhóm A).
 */
function extractLoggedInCompany(doc = document) {
  const header = doc.querySelector('.user-header') || doc;
  const tenDnEl = header.querySelector('span.ten_dn');
  let companyNameText = tenDnEl ? tenDnEl.textContent : '';

  if (!companyNameText || !companyNameText.trim()) {
    const userSpan = header.querySelector(':scope > span.user-name, span.user-name');
    if (userSpan) {
      companyNameText = userSpan.textContent || '';
    }
  }

  const dropdownItems = Array.from(
    header.querySelectorAll('.dropdown-menu .user-name.dropdown-item, .dropdown-menu .user-name'),
  ).map((el) => el.textContent || '');

  return parseUserHeaderInfo({ companyNameText, dropdownTexts: dropdownItems });
}

/**
 * Nhận diện màn hình Lập Giấy nộp tiền trong iframe `thuedientu.gdt.gov.vn` (F12 Nhóm B).
 */
function isGntFormPage(doc = document) {
  return Boolean(doc.querySelector('table#taxDetail'));
}

/**
 * Lấy danh sách các dòng khoản nộp trong bảng `#taxDetail` (hỗ trợ nhiều dòng _1, _2... khi bấm "Thêm dòng").
 */
function findGntDetailRows(doc = document) {
  const table = doc.querySelector('table#taxDetail');
  if (!table) return [];

  const rows = [];
  const trs = table.querySelectorAll('tr');
  for (const tr of trs) {
    const maTieuMucInput = tr.querySelector('input[name="ma_tieumuc"], input[id^="ma_tieumuc_"]');
    const maChuongInput = tr.querySelector('input[name="ma_chuong"], input[id^="ma_chuong_"]');
    if (!maTieuMucInput && !maChuongInput) continue;

    const idSource = (maTieuMucInput && maTieuMucInput.id) || (maChuongInput && maChuongInput.id) || '';
    const idxMatch = idSource.match(/_(\d+)$/);
    const index = idxMatch ? idxMatch[1] : String(rows.length + 1);

    rows.push({
      index,
      tr,
      loaiGdSelect: tr.querySelector(`#loai_gd_${index}, select[name="loai_gd"]`),
      maTkhaiSelect: tr.querySelector(`#ma_tkhai_${index}, select[name="ma_tkhai"]`),
      noiDungInput: tr.querySelector(`#noi_dung_${index}, input[name="noi_dung"]`),
      tieuMucImg: tr.querySelector(`#img_ma_tieumuc_${index}, img[onclick*="openWindow("]`),
      ghiChuInput: tr.querySelector(`#ghichu_${index}, input[name="ghi_chu"]`),
      soTienInput: tr.querySelector(`#so_tien_${index}, input[name="so_tien"]`),
      soNguyenTeInput: tr.querySelector(`#so_nguyen_te_${index}, input[name="so_nguyen_te"]`),
      maTieuMucInput,
      maChuongInput,
    });
  }
  return rows;
}

/**
 * Nhận diện cửa sổ popup tra cứu Tiểu mục (Mã NDKT) của eTax (`dse_nextEventName=getNdkt`) (F12 Nhóm B).
 */
function isNdktPopupPage(loc = location, doc = document) {
  if (loc.origin !== ETAX_ORIGIN) return false;
  if (String(loc.search || '').includes('getNdkt')) return true;
  return Boolean(doc.querySelector('select#cboNdkt') && doc.querySelector('table#tblResult'));
}

/**
 * Tách chuỗi dạng `'1151- Lợi nhuận sau thuế...'` trong `chonDanhMuc(...)` hoặc bảng `#tblResult`.
 */
function parseNdktEntryText(rawText) {
  const cleaned = String(rawText || '').replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/^(\d{4})\s*-\s*(.+)$/);
  if (!match) return null;
  return {
    code: match[1].trim(),
    name: match[2].trim(),
  };
}

/**
 * Đọc danh sách Mã NDKT từ bảng `#tblResult` trong popup `getNdkt` (F12 Nhóm B).
 */
function parseNdktResultTable(doc = document, groupCode = '') {
  const table = doc.querySelector('table#tblResult');
  if (!table) return [];

  const entries = [];
  const seen = new Set();
  const trs = table.querySelectorAll('tr');

  for (const tr of trs) {
    const link = tr.querySelector('a[href*="chonDanhMuc"]');
    let parsed = null;

    if (link) {
      const href = link.getAttribute('href') || '';
      const argMatch = href.match(/chonDanhMuc\(\s*['"]([^'"]+)['"]\s*\)/);
      if (argMatch) {
        parsed = parseNdktEntryText(argMatch[1]);
      }
    }

    if (!parsed) {
      const tds = tr.querySelectorAll('td');
      if (tds.length >= 3) {
        const colCode = (tds[1].textContent || '').trim();
        const colName = (tds[2].textContent || '').trim();
        parsed = parseNdktEntryText(colName);
        if (!parsed && /^\d{4}$/.test(colCode) && colName) {
          parsed = { code: colCode, name: colName.replace(/\s+/g, ' ').trim() };
        }
      }
    }

    if (parsed && !seen.has(parsed.code)) {
      seen.add(parsed.code);
      entries.push({
        code: parsed.code,
        name: parsed.name,
        group: groupCode || '',
      });
    }
  }
  return entries;
}

/**
 * Quét động cây Menu thực tế sau khi đăng nhập trên `dichvucong.gdt.gov.vn` (F12 Nhóm A & C).
 * Không gắn cứng URL — tự động thích nghi khi Tổng cục Thuế thêm/đổi mục menu.
 */
function scanPortalMenuItems(doc = document) {
  const items = [];
  const seenKey = new Set();

  const pushItem = ({ label, group, href, el }) => {
    const cleanLabel = String(label || '').replace(/\s+/g, ' ').trim();
    if (!cleanLabel) return;
    const rawHref = String(href || '').trim();
    if (!rawHref || rawHref === '#' || rawHref.startsWith('javascript:')) {
      if (!el) return;
    }
    if (normalizeVietnamese(cleanLabel).includes('dang xuat')) return;

    const dedup = `${rawHref}|${normalizeVietnamese(cleanLabel)}`;
    if (seenKey.has(dedup)) return;
    seenKey.add(dedup);
    items.push({ label: cleanLabel, group: group || 'Menu chính', href: rawHref, el: el || null });
  };

  // 1. Thanh menu chính `#navbarNav`
  const navItems = doc.querySelectorAll('#navbarNav ul.navbar-nav > li.nav-item');
  for (const li of navItems) {
    const parentLink = li.querySelector(':scope > a.nav-link');
    const subLinks = li.querySelectorAll(':scope > ul.dropdown-menu a.dropdown-item');

    const parentText = (parentLink?.textContent || '').replace(/\s+/g, ' ').trim();
    const parentHref = (parentLink?.getAttribute('href') || '').trim();

    if (subLinks.length > 0) {
      for (const sub of subLinks) {
        pushItem({
          label: sub.textContent,
          group: parentText || 'Menu chính',
          href: sub.getAttribute('href'),
          el: sub,
        });
      }
    } else if (parentLink && parentHref) {
      const label = parentText || (parentHref.includes('/home') ? 'Trang chủ' : '');
      pushItem({
        label,
        group: 'Menu chính',
        href: parentHref,
        el: parentLink,
      });
    }
  }

  // 2. Các mục tiện ích trong menu người dùng `.user-header .dropdown-menu`
  const userLinks = doc.querySelectorAll('.user-header .dropdown-menu a.dropdown-item[href]');
  for (const a of userLinks) {
    const href = (a.getAttribute('href') || '').trim();
    if (!href || href === '#') continue;
    pushItem({
      label: a.textContent,
      group: 'Tài khoản & Thông báo',
      href,
      el: a,
    });
  }

  return items;
}

/**
 * Nhận diện trang Tra cứu & Nộp Thủ tục hành chính (`/tthc/thu-tuc-hanh-chinh`) (F12 Nhóm C).
 */
function isTthcDeclarationPage(loc = location, doc = document) {
  if (loc.origin !== DVC_ORIGIN) return false;
  if (!loc.pathname.includes('/tthc/thu-tuc-hanh-chinh')) return false;
  return Boolean(doc.querySelector('#form_search') || doc.querySelector('#btnTthcSearchHome'));
}

/**
 * Tìm dropdown chọn Tờ khai (`bs-select-4` / bootstrap-select), thẻ `<select>` ẩn gốc,
 * nút Tìm kiếm `#btnTthcSearchHome` và vùng kết quả `#bangKetQuaTTHC` (F12 Nhóm C).
 */
function findDeclarationSelectContext(doc = document) {
  let toggleBtn = doc.querySelector('button[aria-owns="bs-select-4"]');
  let wrapper = toggleBtn ? toggleBtn.closest('.bootstrap-select') : null;
  let selectEl = wrapper ? wrapper.querySelector('select') : null;

  // Dự phòng nếu bootstrap-select đổi số thứ tự bs-select-N
  if (!selectEl) {
    const selects = doc.querySelectorAll('#form_search select, .bootstrap-select select');
    for (const sel of selects) {
      if (sel.options && sel.options.length > 50) {
        const sample = Array.from(sel.options)
          .slice(0, 60)
          .map((o) => o.textContent || '')
          .join(' ');
        if (sample.includes('01/GTGT') || sample.includes('05/KK-TNCN') || sample.includes('03/TNDN')) {
          selectEl = sel;
          wrapper = sel.closest('.bootstrap-select');
          toggleBtn = wrapper ? wrapper.querySelector('button.dropdown-toggle') : null;
          break;
        }
      }
    }
  }

  if (!selectEl) return null;

  return {
    selectEl,
    wrapper,
    toggleBtn,
    searchButton: doc.querySelector('#btnTthcSearchHome'),
    resultContainer: doc.querySelector('#bangKetQuaTTHC'),
  };
}

/**
 * Lấy danh sách các nút "Nộp hồ sơ" (`a.nop-hoso-btn`) trong bảng kết quả `#bangKetQuaTTHC` (F12 Nhóm C).
 */
function findTthcProcedureButtons(doc = document) {
  const container = doc.querySelector('#bangKetQuaTTHC') || doc;
  const links = container.querySelectorAll('a.nop-hoso-btn');
  return Array.from(links).map((el) => {
    const maTthc = (el.getAttribute('ma-tthc') || '').trim();
    const tenTthc = (el.getAttribute('ten-tthc') || '').trim();
    const doiTuong = (el.getAttribute('doi-tuong') || '').trim();
    const maToKhai = (el.getAttribute('ma-to-khai') || '').trim();
    const normTen = normalizeVietnamese(tenTthc);
    const isSupplementary = maTthc === '1.008327' || normTen.includes('khai bo sung');
    return {
      el,
      maTthc,
      tenTthc,
      doiTuong,
      maToKhai,
      isSupplementary,
    };
  });
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
  __exports.parseUserHeaderInfo = parseUserHeaderInfo;
  __exports.extractLoggedInCompany = extractLoggedInCompany;
  __exports.isGntFormPage = isGntFormPage;
  __exports.findGntDetailRows = findGntDetailRows;
  __exports.isNdktPopupPage = isNdktPopupPage;
  __exports.parseNdktEntryText = parseNdktEntryText;
  __exports.parseNdktResultTable = parseNdktResultTable;
  __exports.scanPortalMenuItems = scanPortalMenuItems;
  __exports.isTthcDeclarationPage = isTthcDeclarationPage;
  __exports.findDeclarationSelectContext = findDeclarationSelectContext;
  __exports.findTthcProcedureButtons = findTthcProcedureButtons;
  __exports.DVC_ORIGIN = DVC_ORIGIN;
  __exports.ETAX_ORIGIN = ETAX_ORIGIN;
  __exports.ALLOWED_ORIGINS = ALLOWED_ORIGINS;
  __exports.KEEP_ALIVE_URL = KEEP_ALIVE_URL;
  __exports.TTHC_DECLARATION_URL = TTHC_DECLARATION_URL;
  __exports.DATE_FORMAT = DATE_FORMAT;
  __exports.DEFAULT_SIGNING_PORTS = DEFAULT_SIGNING_PORTS;
  },

  "core/frame-bus.js": function(__require, __exports) {
const { ALLOWED_ORIGINS, DVC_ORIGIN } = __require("adapters/etax-adapter.js");
const { STORAGE_KEYS, setValue, addValueChangeListener, removeValueChangeListener } = __require("core/storage.js");

const MSG_TYPE_ACTIVITY = 'ETAX_HELPER_SERVER_ACTIVITY';
const MSG_TYPE_OPEN_QUICK_ACCESS = 'ETAX_HELPER_OPEN_QUICK_ACCESS';

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
    removeValueChangeListener(gmId);
  };
}

/**
 * Gửi lệnh mở khung Truy cập nhanh (Ctrl+K) từ iframe cross-origin lên Top-Frame.
 */
function notifyOpenQuickAccess(source = 'iframe-shortcut') {
  const payload = {
    type: MSG_TYPE_OPEN_QUICK_ACCESS,
    source,
    origin: location.origin,
    timestamp: Date.now(),
    nonce: Math.random().toString(36).slice(2, 8),
  };

  if (!isTopFrame()) {
    try {
      window.top.postMessage(payload, DVC_ORIGIN);
    } catch {
      // fallback GM_setValue bên dưới
    }
  }
  setValue(STORAGE_KEYS.OPEN_QUICK_ACCESS_EVT, payload);
}

/**
 * Lắng nghe yêu cầu mở khung Truy cập nhanh tại Top-Frame (từ iframe thuedientu).
 */
function subscribeOpenQuickAccess(handler) {
  let lastNonce = '';
  const dispatchOnce = (data) => {
    if (!data || data.type !== MSG_TYPE_OPEN_QUICK_ACCESS) return;
    if (data.nonce && data.nonce === lastNonce) return;
    lastNonce = data.nonce || '';
    handler(data);
  };

  const onMessage = (event) => {
    if (!ALLOWED_ORIGINS.has(event.origin)) return;
    dispatchOnce(event.data);
  };

  window.addEventListener('message', onMessage);

  const gmId = addValueChangeListener(
    STORAGE_KEYS.OPEN_QUICK_ACCESS_EVT,
    (_k, _oldVal, newVal) => {
      dispatchOnce(newVal);
    },
  );

  return () => {
    window.removeEventListener('message', onMessage);
    removeValueChangeListener(gmId);
  };
}

  __exports.isTopFrame = isTopFrame;
  __exports.notifyServerActivity = notifyServerActivity;
  __exports.subscribeServerActivity = subscribeServerActivity;
  __exports.notifyOpenQuickAccess = notifyOpenQuickAccess;
  __exports.subscribeOpenQuickAccess = subscribeOpenQuickAccess;
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
    if (typeof channel.unref === 'function') {
      channel.unref();
    }
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
const { STORAGE_KEYS, getValue, setValue, deleteValue, addValueChangeListener, removeValueChangeListener } = __require("core/storage.js");

const LAST_LOGIN_ACCOUNT_KEY = '__etax_helper_last_login_account_v1';
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

/**
 * Ghi nhớ tài khoản vừa chọn ở màn hình Quick Login (`0101234567-QL` vs `-KT`)
 * để Thanh định danh v2 ưu tiên khớp đúng tài khoản khi Header chỉ hiển thị MST 10 số.
 */
function rememberLastLoginAccount(account, mst) {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(
        LAST_LOGIN_ACCOUNT_KEY,
        JSON.stringify({
          account: String(account || '').trim(),
          mst: String(mst || '').trim(),
          ts: Date.now(),
        }),
      );
    }
  } catch {
    // ignore storage errors
  }
}

function getLastLoginAccount() {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const raw = window.sessionStorage.getItem(LAST_LOGIN_ACCOUNT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Tìm bản ghi công ty khớp nhất trong Vault:
 * 1. Khớp chính xác `account` (nếu có và trùng MST)
 * 2. Fallback khớp chính xác `mst`
 * 3. Fallback khớp tiền tố `account` bắt đầu bằng `mst` (VD `0101234567-QL`)
 */
function findMatchingCompany(companies, { account = '', mst = '' } = {}) {
  if (!Array.isArray(companies) || companies.length === 0) return null;
  const targetAccount = String(account || '').trim().toUpperCase();
  const targetMst = String(mst || '').trim().toUpperCase();

  if (targetAccount) {
    const exactAcc = companies.find(
      (c) => String(c.account || '').trim().toUpperCase() === targetAccount,
    );
    if (exactAcc) {
      if (!targetMst || String(exactAcc.mst || '').trim().toUpperCase() === targetMst) {
        return exactAcc;
      }
    }
  }

  if (targetMst) {
    const byMst = companies.find(
      (c) => String(c.mst || '').trim().toUpperCase() === targetMst,
    );
    if (byMst) return byMst;

    const byPrefix = companies.find((c) => {
      const acc = String(c.account || '').trim().toUpperCase();
      return acc === targetMst || acc.startsWith(`${targetMst}-`);
    });
    if (byPrefix) return byPrefix;
  }

  return null;
}

/**
 * Cập nhật ghi chú nguyên tử (Read-Modify-Write) trực tiếp vào Vault mã hóa PIN `etax_vault_v1`:
 * - Luôn đọc & giải mã mới nhất từ GM_getValue ngay trước khi ghi để chống Race Condition khi mở nhiều tab!
 * - Giữ đồng bộ 100% với cột 5 "Ghi chú" khi Import/Export Excel của v1.
 */
async function updateCompanyNoteAtomic({ account = '', mst = '' }, newNote) {
  const vaultRecord = getValue(STORAGE_KEYS.VAULT, null);
  if (!vaultRecord) {
    return { updated: false, reason: 'uninitialized' };
  }
  const session = await getActiveSession();
  if (!session) {
    return { updated: false, reason: 'locked' };
  }

  let data;
  try {
    data = await decryptPayloadWithKey(vaultRecord, session.key);
  } catch {
    lockSessionNow();
    return { updated: false, reason: 'locked' };
  }

  const companies = Array.isArray(data.companies) ? data.companies : [];
  const matched = findMatchingCompany(companies, { account, mst });
  if (!matched) {
    return { updated: false, reason: 'not-found' };
  }

  const cleanedNote = String(newNote ?? '').trim();
  const nextCompanies = companies.map((item) =>
    item.id === matched.id ? { ...item, note: cleanedNote } : item,
  );

  const nextRecord = await encryptPayloadWithKey(
    { version: 1, companies: nextCompanies },
    session.key,
    session.saltBytes,
    session.iterations,
  );
  setValue(STORAGE_KEYS.VAULT, nextRecord);

  const updatedCompany = { ...matched, note: cleanedNote };
  return { updated: true, company: updatedCompany, companies: nextCompanies };
}

function onVaultChange(callback) {
  const id = addValueChangeListener(STORAGE_KEYS.VAULT, (_k, _oldVal, newVal) => {
    callback(newVal);
  });
  return () => removeValueChangeListener(id);
}

  __exports.setupNewVault = setupNewVault;
  __exports.unlockVaultWithPin = unlockVaultWithPin;
  __exports.tryLoadUnlockedCompanies = tryLoadUnlockedCompanies;
  __exports.saveCompanies = saveCompanies;
  __exports.rollbackPreviousImport = rollbackPreviousImport;
  __exports.changeVaultPin = changeVaultPin;
  __exports.importEncryptedVaultBackup = importEncryptedVaultBackup;
  __exports.updateCompanyNoteAtomic = updateCompanyNoteAtomic;
  __exports.hasVault = hasVault;
  __exports.hasImportBackup = hasImportBackup;
  __exports.getRawVaultRecord = getRawVaultRecord;
  __exports.resetVaultCompletely = resetVaultCompletely;
  __exports.rememberLastLoginAccount = rememberLastLoginAccount;
  __exports.getLastLoginAccount = getLastLoginAccount;
  __exports.findMatchingCompany = findMatchingCompany;
  __exports.onVaultChange = onVaultChange;
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
const { tryLoadUnlockedCompanies, unlockVaultWithPin, rememberLastLoginAccount } = __require("features/quick-login/company-store.js");
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
    rememberLastLoginAccount(loginUsername, company.mst);
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

  "ui/unified-dock.js": function(__require, __exports) {
const { createShadowMount } = __require("ui/shadow-host.js");
const { STORAGE_KEYS, getValue, setValue } = __require("core/storage.js");
const { isLoggedIn } = __require("adapters/etax-adapter.js");
const { isTopFrame } = __require("core/frame-bus.js");

/**
 * Unified Dock (Top-Frame `dichvucong.gdt.gov.vn` góc dưới-trái):
 * - Hợp nhất 4 module Top-Frame (Định danh Cty + Ghi chú | Truy cập nhanh | Đèn Ký số | Đồng hồ phiên)
 *   vào duy nhất 01 thanh nổi Shadow DOM có thể thu gọn thành thẻ Pill gọn gàng.
 * - Mỗi slot cập nhật DOM độc lập -> đồng hồ đếm từng giây KHÔNG làm mất focus của ô ghi chú hay ô tìm kiếm!
 */

const DOCK_CSS = `
@keyframes eh-pulse-red {
  0%, 100% {
    background: #dc2626;
    box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.55);
  }
  50% {
    background: #b91c1c;
    box-shadow: 0 0 0 7px rgba(220, 38, 38, 0);
  }
}
.eh-dock-wrap {
  position: fixed;
  bottom: 14px;
  left: 14px;
  z-index: 2147483620;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  max-width: calc(100vw - 140px);
}
.eh-dock-popover {
  display: none;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  box-shadow: 0 16px 38px rgba(15, 23, 42, 0.22);
  padding: 12px 14px;
  min-width: 260px;
  max-width: min(520px, calc(100vw - 32px));
  max-height: min(72vh, 540px);
  overflow-y: auto;
  color: #0f172a;
}
.eh-dock-popover.open {
  display: block;
}
.eh-dock-bar {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border-radius: 999px;
  border: 1.5px solid #006FBC;
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(6px);
  user-select: none;
  flex-wrap: nowrap;
  max-width: 100%;
}
.eh-dock-slot {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.eh-dock-slot:empty {
  display: none;
}
.eh-dock-sep {
  width: 1px;
  height: 18px;
  background: #e2e8f0;
  margin: 0 4px;
  flex-shrink: 0;
}
.eh-dock-bar.collapsed .eh-hide-collapsed {
  display: none !important;
}
.eh-dock-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: #0f172a;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  line-height: 1.25;
  transition: background 0.14s, color 0.14s;
}
.eh-dock-chip:hover {
  background: #eff6ff;
  color: #006FBC;
}
.eh-dock-chip.active {
  background: #dbeafe;
  color: #005a99;
}
.eh-dock-collapse-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  border: none;
  background: #f1f5f9;
  color: #475569;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
  margin-left: 2px;
}
.eh-dock-collapse-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}
.eh-mst-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 0 2px rgba(15, 23, 42, 0.08);
}
.eh-co-name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: #1e293b;
}
.eh-dock-bar.collapsed .eh-co-name {
  max-width: 96px;
}
.eh-note-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f59e0b;
  margin-left: -2px;
}
.eh-timer-chip {
  color: #006FBC;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}
.eh-timer-chip.warning {
  background: #dc2626;
  color: #ffffff;
  animation: eh-pulse-red 1.1s infinite;
}
.eh-timer-chip.warning:hover {
  background: #b91c1c;
  color: #ffffff;
}
.eh-timer-chip.expired {
  background: #450a0a;
  color: #fecaca;
}
.eh-timer-chip.idle-paused {
  background: #fffbeb;
  color: #92400e;
}
.eh-sign-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}
.eh-sign-dot.online { background: #16a34a; box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.22); }
.eh-sign-dot.offline { background: #dc2626; box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.22); }
.eh-sign-dot.checking { background: #f59e0b; }
.eh-sign-dot.unknown { background: #94a3b8; }
.eh-pop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 8px;
  margin-bottom: 10px;
  border-bottom: 1px solid #e2e8f0;
}
.eh-pop-title {
  font-size: 13px;
  font-weight: 700;
  color: #006FBC;
}
.eh-pop-close {
  border: none;
  background: #f1f5f9;
  color: #475569;
  border-radius: 6px;
  width: 24px;
  height: 24px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
}
.eh-pop-close:hover { background: #e2e8f0; color: #0f172a; }
.eh-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: #eff6ff;
  color: #006FBC;
  border: 1px solid #bfdbfe;
}
.eh-badge-warn {
  background: #fffbeb;
  color: #b45309;
  border-color: #fde68a;
}
.eh-badge-ok {
  background: #f0fdf4;
  color: #15803d;
  border-color: #bbf7d0;
}
.eh-badge-err {
  background: #fef2f2;
  color: #b91c1c;
  border-color: #fecaca;
}
`;

const SLOT_ORDER = ['company', 'quickAccess', 'signing', 'timer'];

let host = null;
let shadow = null;
let root = null;
let cleanupMount = null;
let dockBarEl = null;
let popoverEl = null;
let collapseBtnEl = null;
let extraStylesLoaded = new Set();

const slotContainers = new Map();
const slotSeparators = new Map();
const activeSlots = new Set();

let collapsed = false;
let activePopoverId = null;
let onPopoverCloseCb = null;
let outsideClickBound = false;

function loadCollapsedState() {
  const saved = getValue(STORAGE_KEYS.DOCK_UI_STATE, null);
  return Boolean(saved && typeof saved === 'object' && saved.collapsed);
}

function saveCollapsedState(val) {
  setValue(STORAGE_KEYS.DOCK_UI_STATE, { schemaVersion: 1, collapsed: Boolean(val) });
}

function syncSeparators() {
  if (!dockBarEl) return;
  let seenVisible = false;
  for (const name of SLOT_ORDER) {
    const el = slotContainers.get(name);
    const sep = slotSeparators.get(name);
    const hasContent = Boolean(el && activeSlots.has(name) && el.childNodes.length > 0);
    if (el) el.style.display = hasContent ? 'inline-flex' : 'none';
    if (sep) {
      sep.style.display = hasContent && seenVisible ? 'inline-block' : 'none';
    }
    if (hasContent) seenVisible = true;
  }

  if (collapseBtnEl) {
    // Ẩn nút thu gọn nếu chỉ có duy nhất 1 slot (VD chỉ bật đồng hồ phiên)
    collapseBtnEl.style.display = activeSlots.size >= 2 ? 'inline-flex' : 'none';
  }
}

function applyCollapsedUi() {
  if (!dockBarEl || !collapseBtnEl) return;
  dockBarEl.classList.toggle('collapsed', collapsed);
  collapseBtnEl.textContent = collapsed ? '▸' : '◂';
  collapseBtnEl.title = collapsed ? 'Mở rộng thanh eTax Helper' : 'Thu gọn thành thẻ nhỏ (Pill)';
}

function onDocumentPointerDown(event) {
  if (!activePopoverId || !host) return;
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  if (path.includes(host) || host.contains(event.target)) return;
  closeDockPopover();
}

function onWindowKeyDown(event) {
  if (event.key === 'Escape' && activePopoverId) {
    closeDockPopover();
  }
}

function ensureMounted() {
  if (!isTopFrame()) return false;
  if (!isLoggedIn(document, location)) {
    unmountDockIfNeeded();
    return false;
  }
  if (activeSlots.size === 0) {
    unmountDockIfNeeded();
    return false;
  }
  if (host && document.body?.contains(host)) {
    return true;
  }

  collapsed = loadCollapsedState();
  extraStylesLoaded = new Set();

  const m = createShadowMount(
    'div',
    DOCK_CSS,
    { 'data-etax-role': 'unified-dock' },
    { guardBootstrapFocusTrap: true },
  );
  host = m.host;
  shadow = m.shadow;
  root = m.root;
  cleanupMount = m.cleanup;

  const wrap = document.createElement('div');
  wrap.className = 'eh-dock-wrap';

  popoverEl = document.createElement('div');
  popoverEl.className = 'eh-dock-popover';

  dockBarEl = document.createElement('div');
  dockBarEl.className = 'eh-dock-bar';

  slotContainers.clear();
  slotSeparators.clear();

  for (const name of SLOT_ORDER) {
    const sep = document.createElement('span');
    sep.className = 'eh-dock-sep';
    sep.style.display = 'none';
    dockBarEl.appendChild(sep);
    slotSeparators.set(name, sep);

    const slot = document.createElement('div');
    slot.className = `eh-dock-slot eh-slot-${name}`;
    slot.style.display = 'none';
    dockBarEl.appendChild(slot);
    slotContainers.set(name, slot);
  }

  collapseBtnEl = document.createElement('button');
  collapseBtnEl.type = 'button';
  collapseBtnEl.className = 'eh-dock-collapse-btn';
  collapseBtnEl.addEventListener('click', () => {
    collapsed = !collapsed;
    saveCollapsedState(collapsed);
    applyCollapsedUi();
  });
  dockBarEl.appendChild(collapseBtnEl);

  wrap.appendChild(popoverEl);
  wrap.appendChild(dockBarEl);
  root.appendChild(wrap);
  document.body.appendChild(host);

  if (!outsideClickBound) {
    outsideClickBound = true;
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
    window.addEventListener('keydown', onWindowKeyDown, false);
  }

  applyCollapsedUi();
  syncSeparators();
  return true;
}

function unmountDockIfNeeded() {
  if (activePopoverId) {
    closeDockPopover();
  }
  if (outsideClickBound) {
    outsideClickBound = false;
    document.removeEventListener('pointerdown', onDocumentPointerDown, true);
    window.removeEventListener('keydown', onWindowKeyDown, false);
  }
  if (cleanupMount) {
    cleanupMount();
    cleanupMount = null;
  }
  if (host) {
    host.remove();
    host = null;
    shadow = null;
    root = null;
    dockBarEl = null;
    popoverEl = null;
    collapseBtnEl = null;
    slotContainers.clear();
    slotSeparators.clear();
    extraStylesLoaded.clear();
  }
}

function injectDockStyle(styleId, cssText) {
  if (!shadow || extraStylesLoaded.has(styleId)) return;
  const st = document.createElement('style');
  st.setAttribute('data-style-id', styleId);
  st.textContent = cssText;
  shadow.appendChild(st);
  extraStylesLoaded.add(styleId);
}

function activateDockSlot(slotName) {
  activeSlots.add(slotName);
  if (!ensureMounted()) return null;
  syncSeparators();
  return slotContainers.get(slotName) || null;
}

function deactivateDockSlot(slotName) {
  activeSlots.delete(slotName);
  const el = slotContainers.get(slotName);
  if (el) {
    el.innerHTML = '';
  }
  if (activePopoverId === slotName) {
    closeDockPopover();
  }
  if (activeSlots.size === 0) {
    unmountDockIfNeeded();
  } else {
    syncSeparators();
  }
}

function getDockSlotContainer(slotName) {
  if (!activeSlots.has(slotName)) return null;
  if (!ensureMounted()) return null;
  return slotContainers.get(slotName) || null;
}

function notifyDockSlotUpdated(slotName) {
  if (!activeSlots.has(slotName)) return;
  if (ensureMounted()) {
    syncSeparators();
  }
}

function openDockPopover(popoverId, renderFn, { onClose, maxWidth } = {}) {
  if (!ensureMounted() || !popoverEl) return null;
  if (activePopoverId && activePopoverId !== popoverId && typeof onPopoverCloseCb === 'function') {
    const prevClose = onPopoverCloseCb;
    onPopoverCloseCb = null;
    prevClose();
  }
  activePopoverId = popoverId;
  onPopoverCloseCb = onClose || null;
  popoverEl.style.maxWidth = maxWidth || '';
  popoverEl.innerHTML = '';
  popoverEl.classList.add('open');
  if (typeof renderFn === 'function') {
    renderFn(popoverEl);
  }
  return popoverEl;
}

function getActiveDockPopoverId() {
  return activePopoverId;
}

function closeDockPopover(onlyIfId = null) {
  if (onlyIfId && activePopoverId !== onlyIfId) return;
  const prevClose = onPopoverCloseCb;
  activePopoverId = null;
  onPopoverCloseCb = null;
  if (popoverEl) {
    popoverEl.classList.remove('open');
    popoverEl.innerHTML = '';
  }
  if (typeof prevClose === 'function') {
    prevClose();
  }
}

function toggleDockPopover(popoverId, renderFn, options = {}) {
  if (activePopoverId === popoverId) {
    closeDockPopover();
    return false;
  }
  openDockPopover(popoverId, renderFn, options);
  return true;
}

function syncDockLoginVisibility() {
  if (!isTopFrame()) return false;
  if (!isLoggedIn(document, location)) {
    unmountDockIfNeeded();
    return false;
  }
  if (activeSlots.size > 0) {
    return ensureMounted();
  }
  return false;
}

  __exports.injectDockStyle = injectDockStyle;
  __exports.activateDockSlot = activateDockSlot;
  __exports.deactivateDockSlot = deactivateDockSlot;
  __exports.getDockSlotContainer = getDockSlotContainer;
  __exports.notifyDockSlotUpdated = notifyDockSlotUpdated;
  __exports.openDockPopover = openDockPopover;
  __exports.getActiveDockPopoverId = getActiveDockPopoverId;
  __exports.closeDockPopover = closeDockPopover;
  __exports.toggleDockPopover = toggleDockPopover;
  __exports.syncDockLoginVisibility = syncDockLoginVisibility;
  },

  "features/session-timer/timer-widget.js": function(__require, __exports) {
const { activateDockSlot, deactivateDockSlot, getDockSlotContainer, notifyDockSlotUpdated, toggleDockPopover, closeDockPopover, getActiveDockPopoverId } = __require("ui/unified-dock.js");

function formatMMSS(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createTimerWidget({ onChangeMinutes, onManualResume }) {
  let mounted = false;
  let pillBtn = null;
  let latestView = {
    remainingSeconds: 15 * 60,
    timeoutMinutes: 15,
    status: 'normal', // 'normal' | 'warning' | 'keeping-alive' | 'idle-paused' | 'expired'
    lastKeepAliveText: '',
    lastResetText: '',
  };

  const getVisualState = () => {
    const { remainingSeconds, status } = latestView;
    let cls = 'eh-dock-chip eh-timer-chip';
    let label = `⏱ ${formatMMSS(remainingSeconds)}`;
    if (status === 'warning') {
      cls += ' warning';
      label = `⚠️ ${formatMMSS(remainingSeconds)}`;
    } else if (status === 'keeping-alive') {
      cls += ' warning';
      label = '🔄 Giữ phiên...';
    } else if (status === 'expired') {
      cls += ' expired';
      label = '⛔ Hết phiên';
    } else if (status === 'idle-paused') {
      cls += ' idle-paused';
      label = `⏸ ${formatMMSS(remainingSeconds)}`;
    }
    return { cls, label };
  };

  const renderPopover = (popEl) => {
    const { timeoutMinutes, lastKeepAliveText, lastResetText } = latestView;
    popEl.innerHTML = `
      <div class="eh-pop-head">
        <div class="eh-pop-title">⏱ Cài đặt đồng hồ phiên (máy này)</div>
        <button type="button" class="eh-pop-close" id="eh-tm-close" title="Đóng">×</button>
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <input type="number" min="1" max="120" class="eh-input" id="eh-tm-input" value="${timeoutMinutes}" style="width:80px;"/>
        <span style="font-size:12.5px;">phút</span>
        <button type="button" class="eh-btn eh-btn-primary eh-btn-sm" id="eh-tm-save">Lưu</button>
      </div>
      <div style="margin-top:9px; padding-top:7px; border-top:1px solid #f1f5f9; font-size:11.5px; color:#64748b; line-height:1.5;">
        • Chỉ reset khi có giao tiếp thật với máy chủ thuế.<br/>
        • Đỏ nhấp nháy &lt; 2 phút · Tự giữ phiên ngầm &lt; 15 giây.<br/>
        ${lastResetText ? `• Reset gần nhất: <strong>${esc(lastResetText)}</strong><br/>` : ''}
        ${lastKeepAliveText ? `• Giữ phiên ngầm: <strong>${esc(lastKeepAliveText)}</strong>` : ''}
      </div>
    `;

    const save = () => {
      const val = parseInt(popEl.querySelector('#eh-tm-input')?.value || '', 10);
      if (Number.isFinite(val) && val >= 1 && val <= 120) {
        closeDockPopover('timer');
        onChangeMinutes(val);
      }
    };

    popEl.querySelector('#eh-tm-save')?.addEventListener('click', save);
    popEl.querySelector('#eh-tm-close')?.addEventListener('click', () => closeDockPopover('timer'));
    const input = popEl.querySelector('#eh-tm-input');
    if (input) {
      input.focus();
      input.select?.();
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') save();
      });
    }
  };

  const ensureSlotButton = () => {
    const slot = getDockSlotContainer('timer') || activateDockSlot('timer');
    if (!slot) return null;
    if (pillBtn && slot.contains(pillBtn)) return pillBtn;

    slot.innerHTML = '';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'eh-tm-pill';
    btn.title = 'Đồng hồ đếm ngược phiên làm việc — bấm để chỉnh số phút';
    btn.addEventListener('click', () => {
      if (latestView.status === 'idle-paused' && typeof onManualResume === 'function') {
        onManualResume();
      }
      toggleDockPopover('timer', renderPopover, { maxWidth: '300px' });
    });
    slot.appendChild(btn);
    pillBtn = btn;
    notifyDockSlotUpdated('timer');
    return btn;
  };

  const updateButtonInPlace = () => {
    if (!mounted) return;
    const btn = ensureSlotButton();
    if (!btn) return;
    const { cls, label } = getVisualState();
    btn.className = cls + (getActiveDockPopoverId() === 'timer' ? ' active' : '');
    btn.textContent = label;
  };

  return {
    mount() {
      mounted = true;
      activateDockSlot('timer');
      ensureSlotButton();
      updateButtonInPlace();
    },

    update(nextView) {
      latestView = { ...latestView, ...nextView };
      updateButtonInPlace();
    },

    unmount() {
      mounted = false;
      pillBtn = null;
      closeDockPopover('timer');
      deactivateDockSlot('timer');
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

  "features/company-bar/note-store.js": function(__require, __exports) {
const { STORAGE_KEYS, getValue, setValue } = __require("core/storage.js");
const { tryLoadUnlockedCompanies, findMatchingCompany, updateCompanyNoteAtomic, getLastLoginAccount } = __require("features/quick-login/company-store.js");

const MST_PALETTE = [
  '#0284c7', // Sky Blue
  '#0d9488', // Teal
  '#7c3aed', // Violet
  '#d97706', // Amber
  '#059669', // Emerald
  '#e11d48', // Rose
  '#2563eb', // Royal Blue
  '#ea580c', // Orange
  '#4f46e5', // Indigo
  '#c026d3', // Fuchsia
];

/**
 * Sinh màu nhận diện cố định theo MST giúp mắt nhận ra ngay nếu đang mở nhầm công ty.
 */
function getMstAccentColor(mst) {
  const s = String(mst || '').trim();
  if (!s) return '#006FBC';
  let hash = 2166136261;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const idx = (hash >>> 0) % MST_PALETTE.length;
  return MST_PALETTE[idx];
}

function normalizeMstKey(mst) {
  return String(mst || '').trim().toUpperCase();
}

function readExtraNotesStore() {
  const raw = getValue(STORAGE_KEYS.EXTRA_NOTES, null);
  if (!raw || typeof raw !== 'object' || !raw.byMst || typeof raw.byMst !== 'object') {
    return { schemaVersion: 1, byMst: {} };
  }
  return { schemaVersion: 1, byMst: { ...raw.byMst } };
}

function getExtraNote(mst) {
  const key = normalizeMstKey(mst);
  if (!key) return '';
  const store = readExtraNotesStore();
  const entry = store.byMst[key];
  return entry && typeof entry.note === 'string' ? entry.note : '';
}

function saveExtraNote(mst, note) {
  const key = normalizeMstKey(mst);
  if (!key) return '';
  const store = readExtraNotesStore();
  const cleaned = String(note ?? '').trim();
  if (!cleaned) {
    delete store.byMst[key];
  } else {
    store.byMst[key] = {
      note: cleaned,
      updatedAt: new Date().toISOString(),
    };
  }
  setValue(STORAGE_KEYS.EXTRA_NOTES, store);
  return cleaned;
}

function resolveAccountHintForMst(mst) {
  const last = getLastLoginAccount();
  const targetMst = normalizeMstKey(mst);
  if (!last || !last.account) return '';
  if (!targetMst) return last.account;
  const lastMst = normalizeMstKey(last.mst);
  const lastAcc = String(last.account).trim().toUpperCase();
  if (lastMst === targetMst || lastAcc === targetMst || lastAcc.startsWith(`${targetMst}-`)) {
    return last.account;
  }
  return '';
}

/**
 * Tải ngữ cảnh Ghi chú cho công ty đang đăng nhập:
 * - Ưu tiên Vault mã hóa PIN (`etax_vault_v1`) làm nguồn chính.
 * - Fallback kho ghi chú phụ cục bộ (`etax_extra_notes_v1`) cho MST chưa có trong Vault.
 */
async function loadCompanyNoteContext({ mst = '', account = '' } = {}) {
  const effectiveAccount = account || resolveAccountHintForMst(mst);
  const extraNote = getExtraNote(mst);
  const vaultRes = await tryLoadUnlockedCompanies();

  if (vaultRes.state === 'unlocked') {
    const matched = findMatchingCompany(vaultRes.companies, {
      account: effectiveAccount,
      mst,
    });
    if (matched) {
      return {
        source: 'vault',
        vaultState: 'unlocked',
        company: matched,
        note: matched.note || '',
        extraNote,
      };
    }
    return {
      source: 'extra',
      vaultState: 'unlocked',
      company: null,
      note: extraNote,
      extraNote,
    };
  }

  if (vaultRes.state === 'locked') {
    return {
      source: 'locked',
      vaultState: 'locked',
      company: null,
      note: extraNote,
      extraNote,
    };
  }

  return {
    source: 'extra',
    vaultState: 'uninitialized',
    company: null,
    note: extraNote,
    extraNote,
  };
}

/**
 * Lưu ghi chú cho công ty hiện tại (ưu tiên ghi nguyên tử vào Vault PIN, fallback kho ghi chú phụ).
 */
async function saveCompanyNote({ mst = '', account = '', preferExtra = false }, newNote) {
  const effectiveAccount = account || resolveAccountHintForMst(mst);
  if (!preferExtra) {
    const res = await updateCompanyNoteAtomic({ account: effectiveAccount, mst }, newNote);
    if (res.updated) {
      return {
        ok: true,
        source: 'vault',
        company: res.company,
        note: res.company.note || '',
      };
    }
    if (res.reason === 'locked') {
      return { ok: false, reason: 'locked' };
    }
  }

  const saved = saveExtraNote(mst, newNote);
  return {
    ok: true,
    source: 'extra',
    company: null,
    note: saved,
  };
}

function publishActiveCompanyContext({ mst = '', companyName = '', personalId = '' } = {}) {
  if (!mst && !companyName) return;
  const prev = getValue(STORAGE_KEYS.ACTIVE_COMPANY_CTX, null);
  if (prev && prev.mst === mst && prev.companyName === companyName && prev.personalId === personalId) {
    return;
  }
  setValue(STORAGE_KEYS.ACTIVE_COMPANY_CTX, {
    mst: String(mst || '').trim(),
    companyName: String(companyName || '').trim(),
    personalId: String(personalId || '').trim(),
    updatedAt: Date.now(),
  });
}

function getActiveCompanyContext() {
  const ctx = getValue(STORAGE_KEYS.ACTIVE_COMPANY_CTX, null);
  return ctx && typeof ctx === 'object' ? ctx : { mst: '', companyName: '', personalId: '' };
}

  __exports.loadCompanyNoteContext = loadCompanyNoteContext;
  __exports.saveCompanyNote = saveCompanyNote;
  __exports.getMstAccentColor = getMstAccentColor;
  __exports.getExtraNote = getExtraNote;
  __exports.saveExtraNote = saveExtraNote;
  __exports.resolveAccountHintForMst = resolveAccountHintForMst;
  __exports.publishActiveCompanyContext = publishActiveCompanyContext;
  __exports.getActiveCompanyContext = getActiveCompanyContext;
  },

  "features/company-bar/index.js": function(__require, __exports) {
const { isLoggedIn, extractLoggedInCompany } = __require("adapters/etax-adapter.js");
const { isTopFrame } = __require("core/frame-bus.js");
const { createDomWatcher } = __require("core/dom-observer.js");
const { activateDockSlot, deactivateDockSlot, getDockSlotContainer, notifyDockSlotUpdated, toggleDockPopover, openDockPopover, closeDockPopover, getActiveDockPopoverId } = __require("ui/unified-dock.js");
const { unlockVaultWithPin, onVaultChange } = __require("features/quick-login/company-store.js");
const { onSessionStateChange } = __require("security/session-unlock.js");
const { getMstAccentColor, loadCompanyNoteContext, saveCompanyNote, publishActiveCompanyContext } = __require("features/company-bar/note-store.js");

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shortenCompanyName(name) {
  const cleaned = String(name || '')
    .replace(/^công\s*ty\s*(tnhh|cổ\s*phần|cp|hợp\s*danh|tư\s*nhân)\s*/i, '')
    .replace(/^(sx|tm|dv|thương\s*mại|sản\s*xuất|dịch\s*vụ)(\s*(&|và)\s*(sx|tm|dv|thương\s*mại|sản\s*xuất|dịch\s*vụ))*\s*/i, '')
    .trim();
  return cleaned || String(name || '').trim() || 'Chưa rõ tên DN';
}

function createCompanyBarFeature() {
  let active = false;
  let watcher = null;
  let unsubVault = null;
  let unsubSession = null;

  let currentInfo = { mst: '', companyName: '', personalId: '', isOrganization: false };
  let noteCtx = { source: 'extra', vaultState: 'uninitialized', company: null, note: '', extraNote: '' };
  let preferExtraWhileLocked = false;
  let feedback = null; // { type: 'success' | 'error', text }

  const renderSlot = () => {
    if (!active) return;
    if (!isLoggedIn(document, location)) {
      deactivateDockSlot('company');
      return;
    }

    const slot = getDockSlotContainer('company') || activateDockSlot('company');
    if (!slot) return;

    const mst = currentInfo.mst || '---';
    const fullName = noteCtx.company?.companyName || currentInfo.companyName || 'Đang nhận diện...';
    const shortName = shortenCompanyName(fullName);
    const accent = getMstAccentColor(mst);
    const hasNote = Boolean((noteCtx.note || '').trim() || (noteCtx.extraNote || '').trim());
    const popOpen = getActiveDockPopoverId() === 'company';

    slot.innerHTML = `
      <button type="button" class="eh-dock-chip ${popOpen ? 'active' : ''}" id="eh-co-chip"
        title="${esc(fullName)} — MST: ${esc(mst)} (Bấm để xem/sửa Ghi chú & Copy MST)">
        <span class="eh-mst-dot" style="background:${accent};"></span>
        <span style="font-variant-numeric:tabular-nums; color:${accent};">${esc(mst)}</span>
        <span class="eh-co-name">· ${esc(shortName)}</span>
      </button>
      <button type="button" class="eh-dock-chip eh-hide-collapsed ${popOpen ? 'active' : ''}" id="eh-co-note-btn"
        title="Mở pop-up xem & sửa nhanh Ghi chú công ty">
        📝 <span style="font-weight:600;">Ghi chú</span>${hasNote ? '<span class="eh-note-dot" title="Công ty này có ghi chú"></span>' : ''}
      </button>
    `;

    const onOpen = () => {
      feedback = null;
      toggleDockPopover('company', renderNotePopover, {
        maxWidth: '420px',
        onClose: () => renderSlot(),
      });
      renderSlot();
    };

    slot.querySelector('#eh-co-chip')?.addEventListener('click', onOpen);
    slot.querySelector('#eh-co-note-btn')?.addEventListener('click', onOpen);
    notifyDockSlotUpdated('company');
  };

  const renderNotePopover = (popEl) => {
    const mst = currentInfo.mst || '';
    const fullName = noteCtx.company?.companyName || currentInfo.companyName || 'Chưa rõ tên công ty';
    const accent = getMstAccentColor(mst);
    const showPinGate = noteCtx.vaultState === 'locked' && !preferExtraWhileLocked;

    let sourceBadge = '';
    if (noteCtx.source === 'vault') {
      sourceBadge = `<span class="eh-badge eh-badge-ok">🔒 Kho MST mã hóa PIN (${esc(noteCtx.company?.account || mst)}) · Đồng bộ Excel</span>`;
    } else if (noteCtx.vaultState === 'locked') {
      sourceBadge = '<span class="eh-badge eh-badge-warn">🔒 Kho PIN đang khóa</span>';
    } else {
      sourceBadge = '<span class="eh-badge eh-badge-warn">📌 Ghi chú phụ theo MST (chưa có trong Kho MST)</span>';
    }

    const bodyHtml = showPinGate
      ? `
        <div style="margin-bottom:8px; font-size:12px; color:#475569;">
          Kho MST đang khóa. Nhập mã PIN 1 lần để xem &amp; sửa ghi chú đồng bộ với Kho MST v1:
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <input type="password" class="eh-input" id="eh-co-pin" placeholder="Nhập mã PIN mở khóa..." autocomplete="current-password"/>
          <button type="button" class="eh-btn eh-btn-primary" id="eh-co-pin-btn" style="white-space:nowrap;">Mở khóa</button>
        </div>
        ${
          noteCtx.extraNote
            ? `<div style="margin-top:8px; padding:6px 8px; background:#fffbeb; border:1px solid #fde68a; border-radius:6px; font-size:12px;">
                <strong>Ghi chú phụ đang có:</strong> ${esc(noteCtx.extraNote)}
              </div>`
            : ''
        }
        <div style="margin-top:8px; text-align:right;">
          <button type="button" class="eh-btn eh-btn-sm" id="eh-co-use-extra">Ghi chú phụ không cần PIN</button>
        </div>
      `
      : `
        ${
          noteCtx.source === 'vault' && !noteCtx.note && noteCtx.extraNote
            ? `<div style="margin-bottom:8px; padding:6px 8px; background:#fffbeb; border:1px solid #fde68a; border-radius:6px; font-size:12px; display:flex; align-items:center; justify-content:space-between; gap:8px;">
                <span>Có ghi chú phụ cũ: <em>${esc(noteCtx.extraNote.slice(0, 60))}</em></span>
                <button type="button" class="eh-btn eh-btn-sm" id="eh-co-pull-extra">Nạp vào</button>
              </div>`
            : ''
        }
        <label for="eh-co-note-ta" style="display:block; font-size:12px; font-weight:600; color:#334155; margin-bottom:4px;">
          Ghi chú khách hàng (Ctrl + Enter để lưu nhanh):
        </label>
        <textarea id="eh-co-note-ta" class="eh-input" rows="4" style="resize:vertical; line-height:1.45;"
          placeholder="VD: Kê khai GTGT theo Quý, Chương 854, gửi báo cáo cho anh A trước ngày 15...">${esc(noteCtx.note || '')}</textarea>
        <div style="margin-top:8px; display:flex; align-items:center; justify-content:space-between; gap:8px;">
          ${
            noteCtx.vaultState === 'locked' && preferExtraWhileLocked
              ? '<button type="button" class="eh-btn eh-btn-sm" id="eh-co-back-pin">🔓 Mở khóa Kho PIN</button>'
              : '<span class="eh-muted" style="font-size:11.5px;">Lưu cục bộ trên trình duyệt</span>'
          }
          <div style="display:flex; gap:6px;">
            <button type="button" class="eh-btn eh-btn-sm" id="eh-co-cancel">Đóng</button>
            <button type="button" class="eh-btn eh-btn-primary eh-btn-sm" id="eh-co-save">💾 Lưu ghi chú</button>
          </div>
        </div>
      `;

    popEl.innerHTML = `
      <div class="eh-pop-head">
        <div class="eh-pop-title" style="display:flex; align-items:center; gap:6px;">
          <span class="eh-mst-dot" style="background:${accent};"></span>
          <span>Thông tin &amp; Ghi chú Công ty</span>
        </div>
        <button type="button" class="eh-pop-close" id="eh-co-close" title="Đóng">×</button>
      </div>
      <div style="margin-bottom:8px; padding:8px 10px; border-radius:8px; background:#f8fafc; border-left:3px solid ${accent};">
        <div style="font-weight:700; font-size:13px; color:#0f172a; line-height:1.35;">${esc(fullName)}</div>
        <div style="margin-top:4px; display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
          <span style="font-size:12px; color:#334155;">
            MST: <strong style="color:${accent};">${esc(mst || 'Không rõ')}</strong>
            ${currentInfo.personalId && currentInfo.isOrganization ? ` · CCCD ĐD: ${esc(currentInfo.personalId)}` : ''}
          </span>
          ${mst ? '<button type="button" class="eh-btn eh-btn-sm" id="eh-co-copy-mst">📋 Copy MST</button>' : ''}
        </div>
      </div>
      <div style="margin-bottom:8px;">${sourceBadge}</div>
      ${bodyHtml}
      ${
        feedback
          ? `<div class="${feedback.type === 'error' ? 'eh-error' : 'eh-success'}" style="margin-top:8px;">${esc(feedback.text)}</div>`
          : ''
      }
    `;

    popEl.querySelector('#eh-co-close')?.addEventListener('click', () => closeDockPopover('company'));
    popEl.querySelector('#eh-co-cancel')?.addEventListener('click', () => closeDockPopover('company'));

    popEl.querySelector('#eh-co-copy-mst')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(mst);
        feedback = { type: 'success', text: `Đã sao chép MST: ${mst}` };
      } catch {
        feedback = { type: 'error', text: 'Trình duyệt không cho phép sao chép tự động.' };
      }
      if (getActiveDockPopoverId() === 'company') renderNotePopover(popEl);
    });

    const handleUnlock = async () => {
      const pin = popEl.querySelector('#eh-co-pin')?.value || '';
      if (!pin) return;
      try {
        await unlockVaultWithPin(pin);
        preferExtraWhileLocked = false;
        feedback = { type: 'success', text: 'Đã mở khóa Kho MST!' };
        await refreshNoteContext();
        if (getActiveDockPopoverId() === 'company') {
          openDockPopover('company', renderNotePopover, { maxWidth: '420px', onClose: () => renderSlot() });
        }
      } catch (err) {
        feedback = { type: 'error', text: err?.message || 'Mã PIN không đúng.' };
        if (getActiveDockPopoverId() === 'company') renderNotePopover(popEl);
      }
    };

    popEl.querySelector('#eh-co-pin-btn')?.addEventListener('click', handleUnlock);
    popEl.querySelector('#eh-co-pin')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleUnlock();
      }
    });

    popEl.querySelector('#eh-co-use-extra')?.addEventListener('click', () => {
      preferExtraWhileLocked = true;
      feedback = null;
      renderNotePopover(popEl);
    });

    popEl.querySelector('#eh-co-back-pin')?.addEventListener('click', () => {
      preferExtraWhileLocked = false;
      feedback = null;
      renderNotePopover(popEl);
    });

    popEl.querySelector('#eh-co-pull-extra')?.addEventListener('click', () => {
      const ta = popEl.querySelector('#eh-co-note-ta');
      if (ta) {
        ta.value = noteCtx.extraNote;
        ta.focus();
      }
    });

    const handleSave = async () => {
      const ta = popEl.querySelector('#eh-co-note-ta');
      if (!ta) return;
      const newVal = ta.value;
      const res = await saveCompanyNote(
        {
          mst,
          account: noteCtx.company?.account || '',
          preferExtra: noteCtx.vaultState === 'locked' && preferExtraWhileLocked,
        },
        newVal,
      );
      if (res.ok) {
        feedback = {
          type: 'success',
          text:
            res.source === 'vault'
              ? 'Đã lưu vào Kho MST mã hóa PIN (đồng bộ Excel 5 cột).'
              : 'Đã lưu vào kho ghi chú phụ cục bộ theo MST.',
        };
        await refreshNoteContext();
        if (getActiveDockPopoverId() === 'company') renderNotePopover(popEl);
      } else {
        feedback = { type: 'error', text: 'Kho PIN đã bị khóa — vui lòng mở khóa PIN để lưu.' };
        await refreshNoteContext();
        if (getActiveDockPopoverId() === 'company') renderNotePopover(popEl);
      }
    };

    popEl.querySelector('#eh-co-save')?.addEventListener('click', handleSave);
    const ta = popEl.querySelector('#eh-co-note-ta');
    if (ta) {
      ta.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          handleSave();
        }
      });
    }
  };

  const refreshNoteContext = async () => {
    if (!currentInfo.mst) return;
    noteCtx = await loadCompanyNoteContext({ mst: currentInfo.mst });
    renderSlot();
  };

  const scanHeader = () => {
    if (!active) return;
    if (!isLoggedIn(document, location)) {
      deactivateDockSlot('company');
      return;
    }
    const extracted = extractLoggedInCompany(document);
    const changed =
      extracted.mst !== currentInfo.mst ||
      extracted.companyName !== currentInfo.companyName ||
      extracted.personalId !== currentInfo.personalId;

    currentInfo = extracted;
    if (extracted.mst || extracted.companyName) {
      publishActiveCompanyContext(extracted);
    }

    if (changed) {
      void refreshNoteContext();
    } else {
      renderSlot();
    }
  };

  return {
    start() {
      if (!isTopFrame()) return;
      active = true;
      unsubVault = onVaultChange(() => {
        void refreshNoteContext().then(() => {
          if (getActiveDockPopoverId() === 'company') {
            openDockPopover('company', renderNotePopover, {
              maxWidth: '420px',
              onClose: () => renderSlot(),
            });
          }
        });
      });
      unsubSession = onSessionStateChange(() => {
        void refreshNoteContext();
      });
      watcher = createDomWatcher(scanHeader, { debounceMs: 200 });
      watcher.start();
    },

    stop() {
      active = false;
      if (watcher) {
        watcher.stop();
        watcher = null;
      }
      if (unsubVault) {
        unsubVault();
        unsubVault = null;
      }
      if (unsubSession) {
        unsubSession();
        unsubSession = null;
      }
      closeDockPopover('company');
      deactivateDockSlot('company');
    },
  };
}

  __exports.createCompanyBarFeature = createCompanyBarFeature;
  },

  "features/tax-code-helper/catalog-data.js": function(__require, __exports) {
/**
 * Bộ danh mục Mã Chương & Mã Tiểu mục (NDKT) cốt lõi đóng gói sẵn offline (Lớp 1).
 * Nguồn tham chiếu: Hệ thống Mục lục Ngân sách Nhà nước (Thông tư 324/2016/TT-BTC và các sửa đổi bổ sung).
 * Khi đồng bộ hoặc Passive Capture từ cổng thuế (Lớp 2), tên chính thức của cổng thuế sẽ được ưu tiên ghi đè.
 */

const SYNC_CORE_NDKT_GROUPS = [
  '1000', // Thuế thu nhập cá nhân
  '1050', // Thuế thu nhập doanh nghiệp
  '1700', // Thuế giá trị gia tăng
  '1750', // Thuế tiêu thụ đặc biệt
  '2000', // Thuế bảo vệ môi trường
  '2850', // Lệ phí QLNN liên quan đến SXKD (Lệ phí môn bài)
  '4250', // Thu tiền phạt
  '4900', // Các khoản thu khác (Tiền chậm nộp)
];

const DEFAULT_CHAPTER_CODES = [
  { code: '154', name: 'Kinh tế hỗn hợp ngoài quốc doanh (Cấp Trung ương)', kind: 'enterprise' },
  { code: '554', name: 'Kinh tế hỗn hợp ngoài quốc doanh (Cấp Tỉnh/TP)', kind: 'enterprise' },
  { code: '754', name: 'Kinh tế hỗn hợp ngoài quốc doanh (Cấp Huyện/Quận/Khu vực)', kind: 'enterprise' },
  { code: '854', name: 'Kinh tế hỗn hợp ngoài quốc doanh (Cấp Cơ sở / Xã / Phường)', kind: 'enterprise' },
  { code: '155', name: 'Kinh tế có vốn đầu tư nước ngoài - FDI (Cấp Trung ương)', kind: 'enterprise' },
  { code: '555', name: 'Kinh tế có vốn đầu tư nước ngoài - FDI (Cấp Tỉnh/TP)', kind: 'enterprise' },
  { code: '755', name: 'Kinh tế có vốn đầu tư nước ngoài - FDI (Cấp Huyện/Khu vực)', kind: 'enterprise' },
  { code: '855', name: 'Kinh tế có vốn đầu tư nước ngoài - FDI (Cấp Cơ sở)', kind: 'enterprise' },
  { code: '157', name: 'Kinh tế cá thể / Hộ gia đình, cá nhân (Cấp Trung ương)', kind: 'individual' },
  { code: '557', name: 'Kinh tế cá thể / Hộ gia đình, cá nhân (Cấp Tỉnh/TP)', kind: 'individual' },
  { code: '757', name: 'Kinh tế cá thể / Hộ gia đình, cá nhân (Cấp Huyện/Khu vực)', kind: 'individual' },
  { code: '857', name: 'Kinh tế cá thể / Hộ gia đình, cá nhân (Cấp Cơ sở)', kind: 'individual' },
  { code: '151', name: 'Doanh nghiệp Nhà nước (Cấp Trung ương)', kind: 'enterprise' },
  { code: '551', name: 'Doanh nghiệp Nhà nước (Cấp Tỉnh/TP)', kind: 'enterprise' },
  { code: '751', name: 'Doanh nghiệp Nhà nước (Cấp Huyện)', kind: 'enterprise' },
  { code: '152', name: 'Công ty có vốn Nhà nước trên 50% (Cấp Trung ương)', kind: 'enterprise' },
  { code: '552', name: 'Công ty có vốn Nhà nước trên 50% (Cấp Tỉnh/TP)', kind: 'enterprise' },
  { code: '752', name: 'Công ty có vốn Nhà nước trên 50% (Cấp Huyện)', kind: 'enterprise' },
  { code: '153', name: 'Kinh tế tập thể / Hợp tác xã (Cấp Trung ương)', kind: 'enterprise' },
  { code: '553', name: 'Kinh tế tập thể / Hợp tác xã (Cấp Tỉnh/TP)', kind: 'enterprise' },
  { code: '753', name: 'Kinh tế tập thể / Hợp tác xã (Cấp Huyện)', kind: 'enterprise' },
  { code: '853', name: 'Kinh tế tập thể / Hợp tác xã (Cấp Cơ sở)', kind: 'enterprise' },
  { code: '158', name: 'Doanh nghiệp tư nhân (Cấp Trung ương)', kind: 'enterprise' },
  { code: '558', name: 'Doanh nghiệp tư nhân (Cấp Tỉnh/TP)', kind: 'enterprise' },
  { code: '758', name: 'Doanh nghiệp tư nhân (Cấp Huyện)', kind: 'enterprise' },
  { code: '858', name: 'Doanh nghiệp tư nhân (Cấp Cơ sở)', kind: 'enterprise' },
  { code: '160', name: 'Khối cơ quan hành chính, sự nghiệp (Cấp Trung ương)', kind: 'other' },
  { code: '560', name: 'Khối cơ quan hành chính, sự nghiệp (Cấp Tỉnh/TP)', kind: 'other' },
  { code: '760', name: 'Khối cơ quan hành chính, sự nghiệp (Cấp Huyện)', kind: 'other' },
];

const DEFAULT_NDKT_CODES = [
  // 1700 — Thuế GTGT
  { code: '1701', name: 'Thuế giá trị gia tăng hàng sản xuất, kinh doanh trong nước (gồm cả dịch vụ trong lĩnh vực dầu khí)', group: '1700', family: 'GTGT', popular: true },
  { code: '1702', name: 'Thuế giá trị gia tăng hàng nhập khẩu', group: '1700', family: 'GTGT', popular: false },
  { code: '1704', name: 'Thuế giá trị gia tăng từ hoạt động thăm dò, khai thác dầu khí', group: '1700', family: 'GTGT', popular: false },
  { code: '1705', name: 'Thuế giá trị gia tăng từ hoạt động xổ số kiến thiết', group: '1700', family: 'GTGT', popular: false },

  // 1050 — Thuế TNDN
  { code: '1052', name: 'Thuế thu nhập doanh nghiệp của các đơn vị không hạch toán toàn ngành', group: '1050', family: 'TNDN', popular: true },
  { code: '1053', name: 'Thuế thu nhập doanh nghiệp của các đơn vị hạch toán toàn ngành', group: '1050', family: 'TNDN', popular: false },
  { code: '1054', name: 'Thuế thu nhập doanh nghiệp từ hoạt động xổ số kiến thiết', group: '1050', family: 'TNDN', popular: false },
  { code: '1056', name: 'Thuế thu nhập doanh nghiệp từ hoạt động thăm dò, khai thác dầu khí', group: '1050', family: 'TNDN', popular: false },
  { code: '1057', name: 'Thuế thu nhập doanh nghiệp từ chuyển nhượng bất động sản', group: '1050', family: 'TNDN', popular: false },

  // 1000 — Thuế TNCN
  { code: '1001', name: 'Thuế thu nhập từ tiền lương, tiền công', group: '1000', family: 'TNCN', popular: true },
  { code: '1003', name: 'Thuế thu nhập từ hoạt động sản xuất, kinh doanh của cá nhân', group: '1000', family: 'TNCN', popular: true },
  { code: '1004', name: 'Thuế thu nhập từ đầu tư vốn của cá nhân', group: '1000', family: 'TNCN', popular: true },
  { code: '1005', name: 'Thuế thu nhập từ chuyển nhượng vốn', group: '1000', family: 'TNCN', popular: false },
  { code: '1006', name: 'Thuế thu nhập từ chuyển nhượng bất động sản', group: '1000', family: 'TNCN', popular: false },
  { code: '1007', name: 'Thuế thu nhập từ trúng thưởng', group: '1000', family: 'TNCN', popular: false },
  { code: '1008', name: 'Thuế thu nhập từ bản quyền, nhượng quyền thương mại', group: '1000', family: 'TNCN', popular: false },
  { code: '1014', name: 'Thuế thu nhập từ nhận thừa kế, quà tặng', group: '1000', family: 'TNCN', popular: false },
  { code: '1049', name: 'Thuế thu nhập cá nhân khác', group: '1000', family: 'TNCN', popular: false },

  // 2850 — Lệ phí Môn bài
  { code: '2862', name: 'Lệ phí môn bài mức (bậc) 1 - Tổ chức vốn điều lệ trên 10 tỷ đồng', group: '2850', family: 'MON_BAI', popular: true },
  { code: '2863', name: 'Lệ phí môn bài mức (bậc) 2 - Tổ chức vốn điều lệ từ 10 tỷ đồng trở xuống', group: '2850', family: 'MON_BAI', popular: true },
  { code: '2864', name: 'Lệ phí môn bài mức (bậc) 3 - Chi nhánh, VPĐD, địa điểm kinh doanh', group: '2850', family: 'MON_BAI', popular: true },
  { code: '2865', name: 'Lệ phí môn bài hộ/cá nhân kinh doanh bậc 1', group: '2850', family: 'MON_BAI', popular: false },
  { code: '2866', name: 'Lệ phí môn bài hộ/cá nhân kinh doanh bậc 2', group: '2850', family: 'MON_BAI', popular: false },
  { code: '2867', name: 'Lệ phí môn bài hộ/cá nhân kinh doanh bậc 3', group: '2850', family: 'MON_BAI', popular: false },

  // 1750 — Thuế TTĐB
  { code: '1751', name: 'Thuế tiêu thụ đặc biệt hàng hóa sản xuất trong nước', group: '1750', family: 'TTDB', popular: false },
  { code: '1752', name: 'Thuế tiêu thụ đặc biệt hàng hóa nhập khẩu', group: '1750', family: 'TTDB', popular: false },
  { code: '1753', name: 'Thuế tiêu thụ đặc biệt dịch vụ', group: '1750', family: 'TTDB', popular: false },
  { code: '1757', name: 'Thuế tiêu thụ đặc biệt hàng hóa, dịch vụ trong nước khác', group: '1750', family: 'TTDB', popular: false },

  // 2000 — Thuế BVMT
  { code: '2001', name: 'Thuế bảo vệ môi trường đối với xăng, dầu, mỡ nhờn', group: '2000', family: 'BVMT', popular: false },
  { code: '2002', name: 'Thuế bảo vệ môi trường đối với than đá', group: '2000', family: 'BVMT', popular: false },
  { code: '2003', name: 'Thuế bảo vệ môi trường đối với dung dịch HCFC', group: '2000', family: 'BVMT', popular: false },
  { code: '2004', name: 'Thuế bảo vệ môi trường đối với túi ni lông thuộc diện chịu thuế', group: '2000', family: 'BVMT', popular: false },

  // 1550 — Thuế tài nguyên
  { code: '1551', name: 'Thuế tài nguyên khoáng sản kim loại', group: '1550', family: 'TAIN', popular: false },
  { code: '1552', name: 'Thuế tài nguyên khoáng sản không kim loại', group: '1550', family: 'TAIN', popular: false },
  { code: '1554', name: 'Thuế tài nguyên nước thiên nhiên', group: '1550', family: 'TAIN', popular: false },

  // 4250 — Tiền phạt
  { code: '4254', name: 'Phạt vi phạm hành chính trong lĩnh vực thuế', group: '4250', family: 'PHAT', popular: true },
  { code: '4268', name: 'Phạt vi phạm hành chính khác do ngành thuế thực hiện', group: '4250', family: 'PHAT', popular: false },
  { code: '4272', name: 'Phạt vi phạm hành chính về hóa đơn', group: '4250', family: 'PHAT', popular: false },

  // 4900 — Tiền chậm nộp
  { code: '4911', name: 'Tiền chậm nộp các khoản thu khác do ngành thuế quản lý', group: '4900', family: 'CHAM_NOP', popular: true },
  { code: '4917', name: 'Tiền chậm nộp thuế thu nhập cá nhân', group: '4900', family: 'CHAM_NOP', subFamily: 'TNCN', popular: true },
  { code: '4918', name: 'Tiền chậm nộp thuế thu nhập doanh nghiệp', group: '4900', family: 'CHAM_NOP', subFamily: 'TNDN', popular: true },
  { code: '4927', name: 'Tiền chậm nộp thuế tiêu thụ đặc biệt', group: '4900', family: 'CHAM_NOP', subFamily: 'TTDB', popular: false },
  { code: '4931', name: 'Tiền chậm nộp thuế giá trị gia tăng', group: '4900', family: 'CHAM_NOP', subFamily: 'GTGT', popular: true },
  { code: '4944', name: 'Tiền chậm nộp các khoản khác (lệ phí môn bài, phí, lệ phí...)', group: '4900', family: 'CHAM_NOP', subFamily: 'MON_BAI', popular: true },
];

  __exports.SYNC_CORE_NDKT_GROUPS = SYNC_CORE_NDKT_GROUPS;
  __exports.DEFAULT_CHAPTER_CODES = DEFAULT_CHAPTER_CODES;
  __exports.DEFAULT_NDKT_CODES = DEFAULT_NDKT_CODES;
  },

  "features/tax-code-helper/catalog-store.js": function(__require, __exports) {
const { STORAGE_KEYS, getValue, setValue } = __require("core/storage.js");
const { DEFAULT_CHAPTER_CODES, DEFAULT_NDKT_CODES } = __require("features/tax-code-helper/catalog-data.js");

function readCacheRaw() {
  const raw = getValue(STORAGE_KEYS.TAX_CODES_CACHE, null);
  if (!raw || typeof raw !== 'object') {
    return {
      schemaVersion: 1,
      updatedAt: null,
      ndkt: {},
      lastChapterByMst: {},
    };
  }
  return {
    schemaVersion: 1,
    updatedAt: raw.updatedAt || null,
    ndkt: raw.ndkt && typeof raw.ndkt === 'object' ? { ...raw.ndkt } : {},
    lastChapterByMst:
      raw.lastChapterByMst && typeof raw.lastChapterByMst === 'object'
        ? { ...raw.lastChapterByMst }
        : {},
  };
}

function saveCacheRaw(cache) {
  setValue(STORAGE_KEYS.TAX_CODES_CACHE, {
    schemaVersion: 1,
    updatedAt: cache.updatedAt || new Date().toISOString(),
    ndkt: cache.ndkt || {},
    lastChapterByMst: cache.lastChapterByMst || {},
  });
}

/**
 * Gộp bộ danh mục Offline Baseline + Bộ nhớ đệm thu thập từ cổng Thuế (ưu tiên tên chính thức từ cổng Thuế).
 */
function getMergedCatalog() {
  const cache = readCacheRaw();
  const ndktMap = new Map();

  for (const item of DEFAULT_NDKT_CODES) {
    ndktMap.set(item.code, {
      code: item.code,
      name: item.name,
      group: item.group || '',
      family: item.family || '',
      subFamily: item.subFamily || '',
      popular: Boolean(item.popular),
      fromPortal: false,
    });
  }

  for (const [code, entry] of Object.entries(cache.ndkt || {})) {
    if (!/^\d{4}$/.test(code) || !entry || !entry.name) continue;
    const prev = ndktMap.get(code);
    ndktMap.set(code, {
      code,
      name: String(entry.name).trim(),
      group: entry.group || prev?.group || '',
      family: prev?.family || '',
      subFamily: prev?.subFamily || '',
      popular: Boolean(prev?.popular),
      fromPortal: true,
    });
  }

  const chapterMap = new Map();
  for (const ch of DEFAULT_CHAPTER_CODES) {
    chapterMap.set(ch.code, { ...ch });
  }

  return {
    ndktMap,
    ndktList: Array.from(ndktMap.values()).sort((a, b) => {
      if (a.popular !== b.popular) return a.popular ? -1 : 1;
      return a.code.localeCompare(b.code);
    }),
    chapterMap,
    chapterList: Array.from(chapterMap.values()),
    portalSyncedCount: Object.keys(cache.ndkt || {}).length,
    updatedAt: cache.updatedAt,
  };
}

/**
 * Lưu bổ sung các dòng Tiểu mục thu thập được từ popup `getNdkt` (Passive Capture hoặc Manual Sync).
 */
function mergePortalNdktEntries(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) return 0;
  const cache = readCacheRaw();
  let addedOrUpdated = 0;

  for (const item of entries) {
    const code = String(item?.code || '').trim();
    const name = String(item?.name || '').replace(/\s+/g, ' ').trim();
    if (!/^\d{4}$/.test(code) || !name) continue;

    const existing = cache.ndkt[code];
    if (!existing || existing.name !== name || (item.group && existing.group !== item.group)) {
      cache.ndkt[code] = {
        name,
        group: item.group || existing?.group || '',
      };
      addedOrUpdated += 1;
    }
  }

  if (addedOrUpdated > 0) {
    cache.updatedAt = new Date().toISOString();
    saveCacheRaw(cache);
  }
  return addedOrUpdated;
}

function getRememberedChapterForMst(mst) {
  const key = String(mst || '').trim().toUpperCase();
  if (!key) return '';
  const cache = readCacheRaw();
  return String(cache.lastChapterByMst[key] || '').trim();
}

function rememberChapterForMst(mst, chapterCode) {
  const key = String(mst || '').trim().toUpperCase();
  const code = String(chapterCode || '').trim();
  if (!key || !/^\d{3}$/.test(code)) return;
  const cache = readCacheRaw();
  if (cache.lastChapterByMst[key] === code) return;
  cache.lastChapterByMst[key] = code;
  saveCacheRaw(cache);
}

  __exports.getMergedCatalog = getMergedCatalog;
  __exports.mergePortalNdktEntries = mergePortalNdktEntries;
  __exports.getRememberedChapterForMst = getRememberedChapterForMst;
  __exports.rememberChapterForMst = rememberChapterForMst;
  },

  "features/tax-code-helper/validator.js": function(__require, __exports) {
const { normalizeVietnamese } = __require("adapters/etax-adapter.js");

const FAMILY_LABELS = {
  GTGT: 'Thuế GTGT',
  TNDN: 'Thuế TNDN',
  TNCN: 'Thuế TNCN',
  MON_BAI: 'Lệ phí môn bài',
  TTDB: 'Thuế TTĐB',
  BVMT: 'Thuế BVMT',
  TAIN: 'Thuế tài nguyên',
  PHAT: 'Tiền phạt vi phạm',
  CHAM_NOP: 'Tiền chậm nộp',
};

const INDIVIDUAL_CHAPTERS = new Set(['157', '557', '757', '857']);

function inferTaxFamilyFromCode(code) {
  const s = String(code || '').trim();
  if (!/^\d{4}$/.test(s)) return '';
  const num = Number(s);
  if (num >= 1700 && num <= 1749) return 'GTGT';
  if (num >= 1050 && num <= 1099) return 'TNDN';
  if (num >= 1000 && num <= 1049) return 'TNCN';
  if (num >= 2850 && num <= 2899) return 'MON_BAI';
  if (num >= 1750 && num <= 1799) return 'TTDB';
  if (num >= 2000 && num <= 2049) return 'BVMT';
  if (num >= 1550 && num <= 1599) return 'TAIN';
  if (num >= 4250 && num <= 4299) return 'PHAT';
  if (num >= 4900 && num <= 4949) return 'CHAM_NOP';
  return '';
}

/**
 * Suy luận nhóm thuế từ văn bản (Nội dung khoản nộp, Tên tờ khai, Ghi chú).
 * Ưu tiên nhận diện "chậm nộp" / "tiền phạt" trước để KHÔNG báo đỏ oan kiểu "Chậm nộp thuế GTGT" dùng mã 4931!
 */
function inferTaxFamilyFromText(rawText) {
  const t = normalizeVietnamese(rawText);
  if (!t) return '';

  // 1. Tiền chậm nộp (kiểm tra trước tên thuế gốc)
  if (t.includes('cham nop') || t.includes('tien cham nop') || t.includes('tcn ')) {
    return 'CHAM_NOP';
  }
  // 2. Tiền phạt
  if (
    t.includes('tien phat') ||
    t.includes('phat vi pham') ||
    t.includes('phat hanh chinh') ||
    /\bphat\b/.test(t)
  ) {
    return 'PHAT';
  }
  // 3. Các sắc thuế chính
  if (t.includes('gtgt') || t.includes('gia tri gia tang') || /\bvat\b/.test(t)) return 'GTGT';
  if (t.includes('tndn') || t.includes('thu nhap doanh nghiep')) return 'TNDN';
  if (
    t.includes('tncn') ||
    t.includes('thu nhap ca nhan') ||
    t.includes('tien luong') ||
    t.includes('tien cong')
  ) {
    return 'TNCN';
  }
  if (t.includes('mon bai') || t.includes('lpmb') || t.includes('mbai')) return 'MON_BAI';
  if (t.includes('ttdb') || t.includes('tieu thu dac biet')) return 'TTDB';
  if (t.includes('bvmt') || t.includes('bao ve moi truong')) return 'BVMT';
  if (t.includes('tai nguyen') || /\btain\b/.test(t)) return 'TAIN';
  return '';
}

function getMeaningfulTokens(text) {
  const stop = new Set(['thue', 'cua', 'cac', 'cho', 'voi', 'trong', 'theo', 'tu', 'va', 'khac', 'nop', 'khoan']);
  return normalizeVietnamese(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !stop.has(w));
}

function hasTextOverlap(a, b) {
  const ta = getMeaningfulTokens(a);
  const tb = new Set(getMeaningfulTokens(b));
  if (ta.length === 0 || tb.size === 0) return true;
  let hits = 0;
  for (const tok of ta) {
    if (tb.has(tok)) hits += 1;
  }
  return hits >= 1;
}

/**
 * Đối soát ô Mã Tiểu mục (`ma_tieumuc_{i}`) với `noi_dung_{i}`, tên tờ khai (`ma_tkhai_{i}`) và `ghichu_{i}`.
 * Trả về: { status: 'empty' | 'green' | 'yellow' | 'red', summary, detail }
 */
function validateNdktRow({
  maTieuMuc = '',
  noiDung = '',
  maTkhaiText = '',
  ghiChu = '',
  catalog,
} = {}) {
  const code = String(maTieuMuc || '').trim();
  const content = String(noiDung || '').trim();
  const decl = String(maTkhaiText || '').trim();
  const note = String(ghiChu || '').trim();

  if (!code) {
    return {
      status: 'empty',
      summary: 'Chưa chọn Mã NDKT (Tiểu mục)',
      detail: 'Bấm TM để chọn nhanh hoặc bấm kính lúp tra cứu gốc.',
    };
  }

  if (!/^\d{4}$/.test(code)) {
    return {
      status: 'red',
      summary: `Mã NDKT "${code}" sai định dạng`,
      detail: 'Mã tiểu mục (NDKT) hợp lệ gồm đúng 4 chữ số (VD: 1701, 1052, 1001, 2862).',
    };
  }

  const entry = catalog?.ndktMap?.get(code) || null;
  const codeFamily = entry?.family || inferTaxFamilyFromCode(code);
  const codeDesc = entry ? `${code} — ${entry.name}` : `Mã ${code}`;

  // Kiểm tra 1: So khớp giữa Mã NDKT và ô "Nội dung các khoản nộp NSNN"
  if (content) {
    const contentFamily = inferTaxFamilyFromText(content);
    if (codeFamily && contentFamily && codeFamily !== contentFamily) {
      // Ngoại lệ: chậm nộp & phạt đôi khi đi chung câu chữ
      const bothPenalty =
        (codeFamily === 'PHAT' && contentFamily === 'CHAM_NOP') ||
        (codeFamily === 'CHAM_NOP' && contentFamily === 'PHAT');
      if (!bothPenalty) {
        return {
          status: 'red',
          summary: `Lệch Nội dung khoản nộp vs Mã ${code}`,
          detail: `Nội dung đang là "${content}" (${FAMILY_LABELS[contentFamily] || contentFamily}), nhưng mã ${codeDesc} thuộc ${FAMILY_LABELS[codeFamily] || codeFamily}.`,
        };
      }
    }
    if (entry && !hasTextOverlap(content, entry.name)) {
      return {
        status: 'red',
        summary: `Nội dung không khớp tên chuẩn của mã ${code}`,
        detail: `Ô nội dung ghi "${content}" nhưng mã ${code} là "${entry.name}". Hãy kiểm tra lại trước khi nộp!`,
      };
    }
  }

  // Kiểm tra 2: So khớp chéo với Tờ khai đã chọn (`ma_tkhai`) & Ghi chú chuyển tiền (`ghi_chu`)
  const contextSources = [
    { label: 'Tờ khai đã chọn', text: decl },
    { label: 'Ghi chú', text: note },
  ];

  for (const src of contextSources) {
    if (!src.text) continue;
    const ctxFamily = inferTaxFamilyFromText(src.text);
    if (!ctxFamily || !codeFamily) continue;

    // Nếu ghi chú nói "chậm nộp thuế GTGT" (ctxFamily=CHAM_NOP) và code là 4931 (CHAM_NOP) → kiểm tra thêm subFamily!
    if (ctxFamily === 'CHAM_NOP' && codeFamily === 'CHAM_NOP') {
      const normSrc = normalizeVietnamese(src.text);
      if (entry?.subFamily === 'GTGT' && (normSrc.includes('tndn') || normSrc.includes('tncn'))) {
        return {
          status: 'red',
          summary: `Lệch sắc thuế Tiền chậm nộp (${code})`,
          detail: `${src.label} ghi "${src.text}", nhưng mã ${codeDesc} là chậm nộp GTGT!`,
        };
      }
      if (entry?.subFamily === 'TNDN' && (normSrc.includes('gtgt') || normSrc.includes('tncn'))) {
        return {
          status: 'red',
          summary: `Lệch sắc thuế Tiền chậm nộp (${code})`,
          detail: `${src.label} ghi "${src.text}", nhưng mã ${codeDesc} là chậm nộp TNDN!`,
        };
      }
      if (entry?.subFamily === 'TNCN' && (normSrc.includes('gtgt') || normSrc.includes('tndn'))) {
        return {
          status: 'red',
          summary: `Lệch sắc thuế Tiền chậm nộp (${code})`,
          detail: `${src.label} ghi "${src.text}", nhưng mã ${codeDesc} là chậm nộp TNCN!`,
        };
      }
      continue;
    }

    if (ctxFamily !== codeFamily) {
      // Nếu kế toán chọn tờ khai 01/GTGT để nộp tiền chậm nộp GTGT (4931) → hợp lệ, không báo đỏ oan!
      if (src.label === 'Tờ khai đã chọn' && (codeFamily === 'CHAM_NOP' || codeFamily === 'PHAT')) {
        continue;
      }
      return {
        status: 'red',
        summary: `Cảnh báo lệch với ${src.label}!`,
        detail: `${src.label} ("${src.text}") thuộc ${FAMILY_LABELS[ctxFamily] || ctxFamily}, nhưng Mã NDKT ${codeDesc} lại thuộc ${FAMILY_LABELS[codeFamily] || codeFamily}.`,
      };
    }
  }

  // Kiểm tra 3: Mã 4 số hợp lệ nhưng chưa nằm trong từ điển/cache cục bộ
  if (!entry) {
    return {
      status: 'yellow',
      summary: `Mã ${code} chưa có trong bộ nhớ đệm cục bộ`,
      detail: 'Mã đúng 4 số nhưng chưa có tên chuẩn trong cache. Mở popup tra cứu gốc để tự học hoặc bấm Đồng bộ.',
    };
  }

  return {
    status: 'green',
    summary: `Khớp: ${codeDesc}`,
    detail: content ? `Khớp với nội dung nộp "${content}".` : `Ý nghĩa: ${entry.name}`,
  };
}

/**
 * Đối soát ô Mã Chương (`ma_chuong_{i}`):
 * - So với Mã Chương gốc cổng thuế tự điền ban đầu + Mã Chương chuẩn đã nhớ của MST + danh mục Chương hợp lệ.
 * - Xử lý đúng ngoại lệ TNCN (cổng thuế tự chuyển 557/757/857 khi nộp 1001..1049), nhưng báo ĐỎ ngay
 *   nếu lệch sang Chương cá nhân khi nộp thuế DN (GTGT/TNDN/Môn bài) hoặc sửa tay sai mã!
 */
function validateChapterRow({
  maChuong = '',
  initialPortalChapter = '',
  rememberedMstChapter = '',
  maTieuMuc = '',
  catalog,
} = {}) {
  const code = String(maChuong || '').trim();
  const initial = String(initialPortalChapter || '').trim();
  const remembered = String(rememberedMstChapter || '').trim();
  const ndktFamily = inferTaxFamilyFromCode(maTieuMuc);

  if (!code) {
    return {
      status: 'red',
      summary: 'Chưa có Mã Chương',
      detail: 'Vui lòng điền Mã Chương 3 chữ số (VD: 554, 754, 854).',
    };
  }

  if (!/^\d{3}$/.test(code)) {
    return {
      status: 'red',
      summary: `Mã Chương "${code}" sai định dạng`,
      detail: 'Mã Chương hợp lệ gồm đúng 3 chữ số (VD: 554, 754, 854).',
    };
  }

  const entry = catalog?.chapterMap?.get(code) || null;
  const codeMeaning = entry ? `${code} — ${entry.name}` : `Mã Chương ${code}`;
  const isIndividualChapter = INDIVIDUAL_CHAPTERS.has(code) || entry?.kind === 'individual';
  const baseline = initial || remembered;

  // Cảnh báo đặc biệt: Đang nộp thuế Doanh nghiệp (GTGT / TNDN / Môn bài) nhưng Chương lại là Chương Cá nhân (557/757/857)
  if (isIndividualChapter && ['GTGT', 'TNDN', 'MON_BAI'].includes(ndktFamily)) {
    const expectedHint = baseline && !INDIVIDUAL_CHAPTERS.has(baseline) ? ` (mã DN gốc: ${baseline})` : '';
    return {
      status: 'red',
      summary: `Lệch Chương Cá nhân (${code}) khi nộp ${FAMILY_LABELS[ndktFamily]}`,
      detail: `Mã ${codeMeaning} dành cho cá nhân/hộ KD, có thể bị sai khi nộp ${FAMILY_LABELS[ndktFamily]} doanh nghiệp${expectedHint}!`,
    };
  }

  // Ngoại lệ hợp lệ: Nộp TNCN (1001..1049 hoặc chậm nộp TNCN 4917) và cổng thuế chuyển sang Chương cá nhân (557/757/857)
  const isTncnTax = ndktFamily === 'TNCN' || String(maTieuMuc || '').trim() === '4917';
  if (isIndividualChapter && isTncnTax) {
    return {
      status: 'green',
      summary: `Khớp (TNCN): ${codeMeaning}`,
      detail: initial && initial !== code
        ? `Hệ thống/kế toán dùng Chương cá nhân ${code} phù hợp với khoản nộp TNCN (Mã Chương DN gốc: ${initial}).`
        : `Phù hợp với khoản nộp thuế TNCN.`,
    };
  }

  // Nếu bị chỉnh tay lệch khỏi Mã Chương gốc cổng thuế (và cũng khác mã đã nhớ của MST)
  if (initial && code !== initial && (!remembered || code !== remembered)) {
    const initEntry = catalog?.chapterMap?.get(initial);
    const initDesc = initEntry ? `${initial} (${initEntry.name})` : initial;
    return {
      status: 'red',
      summary: `Mã Chương ${code} lệch mã gốc cổng thuế (${initial})`,
      detail: `Đang điền ${codeMeaning}, khác với mã gốc cổng thuế tự điền ban đầu là ${initDesc}. Kiểm tra kỹ tránh nộp nhầm Chương!`,
    };
  }

  if (!entry) {
    return {
      status: 'yellow',
      summary: `Mã Chương ${code} không nằm trong nhóm DN phổ biến`,
      detail: initial === code
        ? 'Trùng với mã cổng thuế tự điền sẵn, nhưng chưa có giải thích chi tiết trong danh mục cơ bản.'
        : 'Hãy đối chiếu lại Mã Chương trên thông báo đăng ký thuế của doanh nghiệp.',
    };
  }

  return {
    status: 'green',
    summary: `Khớp: ${codeMeaning}`,
    detail: initial === code ? 'Khớp với Mã Chương mặc định cổng thuế tự điền.' : `Khớp với Mã Chương đã ghi nhớ của MST.`,
  };
}

  __exports.inferTaxFamilyFromCode = inferTaxFamilyFromCode;
  __exports.inferTaxFamilyFromText = inferTaxFamilyFromText;
  __exports.validateNdktRow = validateNdktRow;
  __exports.validateChapterRow = validateChapterRow;
  },

  "features/tax-code-helper/index.js": function(__require, __exports) {
const { isEtaxOrigin, isGntFormPage, findGntDetailRows, isNdktPopupPage, parseNdktResultTable, setNativeInputValue, normalizeVietnamese } = __require("adapters/etax-adapter.js");
const { createDomWatcher } = __require("core/dom-observer.js");
const { createShadowMount } = __require("ui/shadow-host.js");
const { getActiveCompanyContext } = __require("features/company-bar/note-store.js");
const { SYNC_CORE_NDKT_GROUPS } = __require("features/tax-code-helper/catalog-data.js");
const { getMergedCatalog, mergePortalNdktEntries, getRememberedChapterForMst, rememberChapterForMst } = __require("features/tax-code-helper/catalog-store.js");
const { validateNdktRow, validateChapterRow } = __require("features/tax-code-helper/validator.js");

const HELPER_INLINE_CSS = `
.eh-tc-inline {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  vertical-align: middle;
  margin-left: 3px;
}
.eh-tc-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid rgba(15, 23, 42, 0.18);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: transform 0.12s;
}
.eh-tc-dot:hover { transform: scale(1.2); }
.eh-tc-dot.green { background: #16a34a; box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.22); }
.eh-tc-dot.red { background: #dc2626; box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.28); }
.eh-tc-dot.yellow { background: #eab308; box-shadow: 0 0 0 2px rgba(234, 179, 8, 0.24); }
.eh-tc-dot.empty { background: #cbd5e1; }
.eh-tc-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 1px 4px;
  border-radius: 4px;
  border: 1px solid #93c5fd;
  background: #eff6ff;
  color: #006FBC;
  font-size: 10.5px;
  font-weight: 700;
  cursor: pointer;
  line-height: 1.3;
}
.eh-tc-btn:hover {
  background: #006FBC;
  color: #ffffff;
  border-color: #006FBC;
}
`;

const PICKER_POP_CSS = `
.eh-tc-pop {
  position: fixed;
  z-index: 2147483640;
  width: min(440px, calc(100vw - 24px));
  max-height: min(440px, calc(100vh - 24px));
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border: 1.5px solid #006FBC;
  border-radius: 10px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.26);
  overflow: hidden;
}
.eh-tc-pop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  background: #f0f8ff;
  border-bottom: 1px solid #bae0ff;
}
.eh-tc-pop-title {
  font-size: 12.5px;
  font-weight: 700;
  color: #006FBC;
}
.eh-tc-status-box {
  padding: 7px 11px;
  font-size: 12px;
  line-height: 1.4;
  border-bottom: 1px solid #e2e8f0;
}
.eh-tc-status-box.green { background: #f0fdf4; color: #166534; }
.eh-tc-status-box.red { background: #fef2f2; color: #991b1b; }
.eh-tc-status-box.yellow { background: #fffbeb; color: #92400e; }
.eh-tc-status-box.empty { background: #f8fafc; color: #475569; }
.eh-tc-search-bar {
  padding: 8px 10px;
  border-bottom: 1px solid #e2e8f0;
}
.eh-tc-list {
  flex: 1;
  overflow-y: auto;
  max-height: 250px;
}
.eh-tc-item {
  padding: 7px 11px;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.eh-tc-item:hover { background: #eff6ff; }
.eh-tc-code {
  font-weight: 700;
  color: #006FBC;
  font-variant-numeric: tabular-nums;
  min-width: 40px;
  flex-shrink: 0;
}
.eh-tc-name {
  font-size: 12px;
  color: #1e293b;
  line-height: 1.35;
}
.eh-tc-tag {
  display: inline-block;
  margin-left: 5px;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  background: #dbeafe;
  color: #1d4ed8;
}
.eh-tc-tag-mst {
  background: #fef3c7;
  color: #92400e;
}
.eh-tc-foot {
  padding: 7px 10px;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: #64748b;
}
`;

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getPageWindow() {
  try {
    return typeof unsafeWindow !== 'undefined' && unsafeWindow ? unsafeWindow : window;
  } catch {
    return window;
  }
}

function getSelectedOptionText(selectEl) {
  if (!selectEl || selectEl.selectedIndex < 0) return '';
  const opt = selectEl.options[selectEl.selectedIndex];
  if (!opt || !opt.value) return '';
  return (opt.textContent || '').trim();
}

function createTaxCodeHelperFeature() {
  let active = false;
  let watcher = null;
  let popupObserver = null;
  let focusHandler = null;
  let outsideClickHandler = null;

  // Theo dõi từng dòng đã gắn theo `tr`
  const rowBindings = new Map();
  let activePickerHost = null;
  let activePickerCleanup = null;
  let popupBannerHost = null;

  const closePicker = () => {
    if (activePickerCleanup) {
      activePickerCleanup();
      activePickerCleanup = null;
    }
    if (activePickerHost) {
      activePickerHost.remove();
      activePickerHost = null;
    }
  };

  const getCurrentMst = () => getActiveCompanyContext().mst || '';

  const applyNdktSelection = (row, item) => {
    if (row.maTieuMucInput) {
      setNativeInputValue(row.maTieuMucInput, item.code, {
        triggerInput: true,
        triggerChange: true,
        triggerBlur: false,
      });
    }
    if (row.noiDungInput) {
      setNativeInputValue(row.noiDungInput, item.name, {
        triggerInput: true,
        triggerChange: true,
        triggerBlur: false,
      });
    }
    // Mở khóa ô số tiền nếu vẫn đang bị readonly (giữ nguyên logic gốc khi đã chọn VND)
    if (row.soTienInput && row.soTienInput.hasAttribute('readonly')) {
      row.soTienInput.removeAttribute('readonly');
    }
    // Cập nhật bộ đếm ký tự điện chuyển tiền CITAD .../210 của cổng thuế
    try {
      const pw = getPageWindow();
      if (typeof pw.countCitad === 'function') {
        pw.countCitad();
      }
    } catch {
      // ignore page callback error
    }
  };

  const applyChapterSelection = (row, item) => {
    if (!row.maChuongInput) return;
    setNativeInputValue(row.maChuongInput, item.code, {
      triggerInput: true,
      triggerChange: true,
      triggerBlur: true,
    });
    const mst = getCurrentMst();
    if (mst) {
      rememberChapterForMst(mst, item.code);
    }
  };

  const openPickerPopover = ({ kind, row, anchorEl, initialPortalChapter, onUpdated }) => {
    closePicker();

    const catalog = getMergedCatalog();
    const mst = getCurrentMst();
    const rememberedChapter = getRememberedChapterForMst(mst);

    const validation =
      kind === 'ndkt'
        ? validateNdktRow({
            maTieuMuc: row.maTieuMucInput?.value || '',
            noiDung: row.noiDungInput?.value || '',
            maTkhaiText: getSelectedOptionText(row.maTkhaiSelect),
            ghiChu: row.ghiChuInput?.value || '',
            catalog,
          })
        : validateChapterRow({
            maChuong: row.maChuongInput?.value || '',
            initialPortalChapter,
            rememberedMstChapter: rememberedChapter,
            maTieuMuc: row.maTieuMucInput?.value || '',
            catalog,
          });

    const { host, root, cleanup } = createShadowMount('div', PICKER_POP_CSS, {
      'data-etax-role': 'tax-code-picker',
    });
    activePickerHost = host;
    activePickerCleanup = cleanup;
    document.body.appendChild(host);

    let searchQuery = '';

    const positionPop = (popEl) => {
      const rect = anchorEl.getBoundingClientRect();
      const popW = Math.min(440, window.innerWidth - 24);
      const popH = Math.min(420, window.innerHeight - 24);
      let left = rect.left;
      if (left + popW > window.innerWidth - 12) {
        left = Math.max(12, window.innerWidth - popW - 12);
      }
      let top = rect.bottom + 6;
      if (top + popH > window.innerHeight - 12) {
        top = Math.max(12, rect.top - popH - 6);
      }
      popEl.style.left = `${Math.round(left)}px`;
      popEl.style.top = `${Math.round(top)}px`;
    };

    const render = () => {
      const q = normalizeVietnamese(searchQuery);
      let items = kind === 'ndkt' ? catalog.ndktList : catalog.chapterList;

      if (kind === 'chapter' && (rememberedChapter || initialPortalChapter)) {
        items = [...items].sort((a, b) => {
          const score = (c) =>
            c.code === rememberedChapter ? 3 : c.code === initialPortalChapter ? 2 : 0;
          return score(b) - score(a);
        });
      }

      const filtered = q
        ? items.filter(
            (it) =>
              it.code.includes(q) || normalizeVietnamese(it.name).includes(q),
          )
        : items;

      const title =
        kind === 'ndkt'
          ? '🔎 Trợ lý Mã Tiểu mục (NDKT) — Chọn nhanh & Đối soát'
          : '🔎 Trợ lý Mã Chương — Chọn nhanh & Đối soát';

      root.innerHTML = `
        <div class="eh-tc-pop" id="eh-tc-pop">
          <div class="eh-tc-pop-head">
            <div class="eh-tc-pop-title">${title}</div>
            <button type="button" class="eh-btn eh-btn-sm" id="eh-tc-close">Đóng</button>
          </div>
          <div class="eh-tc-status-box ${validation.status}">
            <strong>${
              validation.status === 'green'
                ? '🟢'
                : validation.status === 'red'
                  ? '🔴'
                  : validation.status === 'yellow'
                    ? '🟡'
                    : '⚪'
            } ${esc(validation.summary)}</strong><br/>
            <span>${esc(validation.detail)}</span>
          </div>
          <div class="eh-tc-search-bar">
            <input type="text" class="eh-input" id="eh-tc-search" value="${esc(searchQuery)}"
              placeholder="${
                kind === 'ndkt'
                  ? 'Gõ mã (1701, 1052, 2862) hoặc tên không dấu (gtgt, mon bai, cham nop)...'
                  : 'Gõ mã Chương (854, 754, 554, 557) hoặc cấp quản lý...'
              }" autocomplete="off"/>
          </div>
          <div class="eh-tc-list">
            ${
              filtered.length === 0
                ? '<div style="padding:14px; text-align:center;" class="eh-muted">Không tìm thấy mã phù hợp.</div>'
                : filtered
                    .slice(0, 80)
                    .map((it) => {
                      const badges = [];
                      if (kind === 'chapter' && it.code === rememberedChapter) {
                        badges.push('<span class="eh-tc-tag eh-tc-tag-mst">MST hay dùng</span>');
                      }
                      if (kind === 'chapter' && it.code === initialPortalChapter) {
                        badges.push('<span class="eh-tc-tag">Mặc định cổng thuế</span>');
                      }
                      if (kind === 'ndkt' && it.fromPortal) {
                        badges.push('<span class="eh-tc-tag">Đồng bộ Thuế</span>');
                      }
                      return `
                        <div class="eh-tc-item" data-code="${esc(it.code)}">
                          <div class="eh-tc-code">${esc(it.code)}</div>
                          <div class="eh-tc-name">${esc(it.name)}${badges.join('')}</div>
                        </div>
                      `;
                    })
                    .join('')
            }
          </div>
          <div class="eh-tc-foot">
            <span>${
              kind === 'ndkt'
                ? `Danh mục: ${catalog.ndktList.length} mã (${catalog.portalSyncedCount} đã đồng bộ từ Thuế)`
                : `Danh mục: ${catalog.chapterList.length} Mã Chương phổ biến`
            }</span>
            ${
              kind === 'ndkt' && row.tieuMucImg
                ? '<button type="button" class="eh-btn eh-btn-sm" id="eh-tc-open-native">🔄 Mở tra cứu Thuế để đồng bộ</button>'
                : ''
            }
          </div>
        </div>
      `;

      const popEl = root.querySelector('#eh-tc-pop');
      if (popEl) positionPop(popEl);

      root.querySelector('#eh-tc-close')?.addEventListener('click', closePicker);
      root.querySelector('#eh-tc-open-native')?.addEventListener('click', () => {
        closePicker();
        row.tieuMucImg?.click();
      });

      const searchEl = root.querySelector('#eh-tc-search');
      if (searchEl) {
        searchEl.focus();
        searchEl.setSelectionRange(searchQuery.length, searchQuery.length);
        searchEl.addEventListener('input', (e) => {
          searchQuery = e.target.value;
          render();
        });
        searchEl.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') closePicker();
        });
      }

      root.querySelectorAll('.eh-tc-item').forEach((el) => {
        el.addEventListener('click', () => {
          const pickedCode = el.dataset.code;
          const picked =
            kind === 'ndkt'
              ? catalog.ndktMap.get(pickedCode)
              : catalog.chapterMap.get(pickedCode);
          if (picked) {
            if (kind === 'ndkt') {
              applyNdktSelection(row, picked);
            } else {
              applyChapterSelection(row, picked);
            }
            closePicker();
            onUpdated();
          }
        });
      });
    };

    render();
  };

  const attachRowHelper = (row) => {
    if (rowBindings.has(row.tr)) return;

    const initialPortalChapter = String(row.maChuongInput?.value || '').trim();
    const mountedHosts = [];
    const listeners = [];

    const bindListener = (el, evt, fn) => {
      if (!el) return;
      el.addEventListener(evt, fn);
      listeners.push(() => el.removeEventListener(evt, fn));
    };

    const createInlineMount = (targetInput, kind) => {
      if (!targetInput || !targetInput.parentNode) return null;
      const { host, root } = createShadowMount('span', HELPER_INLINE_CSS, {
        'data-etax-role': `tax-code-${kind}-inline`,
      });
      host.style.display = 'inline-flex';
      host.style.verticalAlign = 'middle';
      targetInput.insertAdjacentElement('afterend', host);
      mountedHosts.push(host);

      root.innerHTML = `
        <span class="eh-tc-inline">
          <button type="button" class="eh-tc-dot empty" id="dot" title="Đang kiểm tra..."></button>
          <button type="button" class="eh-tc-btn" id="pick" title="${
            kind === 'ndkt' ? 'Chọn nhanh & Tra cứu Mã Tiểu mục' : 'Chọn nhanh & Tra cứu Mã Chương'
          }">${kind === 'ndkt' ? 'TM' : 'MC'}</button>
        </span>
      `;

      const dotBtn = root.querySelector('#dot');
      const pickBtn = root.querySelector('#pick');
      const onClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openPickerPopover({
          kind,
          row,
          anchorEl: host,
          initialPortalChapter,
          onUpdated: revalidate,
        });
      };
      dotBtn?.addEventListener('click', onClick);
      pickBtn?.addEventListener('click', onClick);

      return { dotBtn, pickBtn };
    };

    const ndktUi = createInlineMount(row.maTieuMucInput, 'ndkt');
    const chapterUi = createInlineMount(row.maChuongInput, 'chapter');

    const revalidate = () => {
      const catalog = getMergedCatalog();
      const rememberedChapter = getRememberedChapterForMst(getCurrentMst());

      if (ndktUi?.dotBtn) {
        const res = validateNdktRow({
          maTieuMuc: row.maTieuMucInput?.value || '',
          noiDung: row.noiDungInput?.value || '',
          maTkhaiText: getSelectedOptionText(row.maTkhaiSelect),
          ghiChu: row.ghiChuInput?.value || '',
          catalog,
        });
        ndktUi.dotBtn.className = `eh-tc-dot ${res.status}`;
        ndktUi.dotBtn.title = `${res.summary}\n${res.detail}`;
      }

      if (chapterUi?.dotBtn) {
        const res = validateChapterRow({
          maChuong: row.maChuongInput?.value || '',
          initialPortalChapter,
          rememberedMstChapter: rememberedChapter,
          maTieuMuc: row.maTieuMucInput?.value || '',
          catalog,
        });
        chapterUi.dotBtn.className = `eh-tc-dot ${res.status}`;
        chapterUi.dotBtn.title = `${res.summary}\n${res.detail}`;
      }
    };

    // Ghi nhận Mã Chương nếu kế toán nhập tay hợp lệ và rời ô
    bindListener(row.maChuongInput, 'blur', () => {
      const val = String(row.maChuongInput?.value || '').trim();
      if (/^\d{3}$/.test(val) && getCurrentMst()) {
        rememberChapterForMst(getCurrentMst(), val);
      }
      revalidate();
    });

    for (const el of [
      row.maChuongInput,
      row.maTieuMucInput,
      row.noiDungInput,
      row.ghiChuInput,
    ]) {
      bindListener(el, 'input', revalidate);
      bindListener(el, 'change', revalidate);
    }
    bindListener(row.maTkhaiSelect, 'change', revalidate);

    revalidate();

    rowBindings.set(row.tr, {
      revalidate,
      destroy() {
        for (const off of listeners) off();
        for (const h of mountedHosts) h.remove();
      },
    });
  };

  const scanGntForm = () => {
    if (!active || !isGntFormPage(document)) return;
    const rows = findGntDetailRows(document);
    const aliveTrs = new Set(rows.map((r) => r.tr));

    for (const [tr, binding] of rowBindings.entries()) {
      if (!aliveTrs.has(tr)) {
        binding.destroy();
        rowBindings.delete(tr);
      }
    }

    for (const row of rows) {
      if (!rowBindings.has(row.tr)) {
        attachRowHelper(row);
      } else {
        rowBindings.get(row.tr).revalidate();
      }
    }
  };

  // ============================================================================
  // CHẾ ĐỘ POPUP `getNdkt`: Passive Capture + Nút Đồng bộ an toàn 8 nhóm thuế DN
  // ============================================================================

  const setupNdktPopupMode = () => {
    const cbo = document.querySelector('select#cboNdkt');
    const searchBtn = document.querySelector('input#tracuu');
    const resultTable = document.querySelector('table#tblResult');
    if (!cbo || !resultTable) return;

    let syncing = false;
    let statusSpan = null;

    const captureCurrentTable = () => {
      const groupCode = cbo.value || '';
      const entries = parseNdktResultTable(document, groupCode);
      if (entries.length === 0) return 0;
      mergePortalNdktEntries(entries);
      if (statusSpan && !syncing) {
        const merged = getMergedCatalog();
        statusSpan.textContent = `✓ Tự lưu ${entries.length} tiểu mục (Tổng cache Thuế: ${merged.portalSyncedCount})`;
      }
      return entries.length;
    };

    // Chèn thanh nhỏ gọn ngay cạnh nút Tra cứu trong popup
    if (searchBtn && !popupBannerHost) {
      const { host, root } = createShadowMount('span', '', {
        'data-etax-role': 'ndkt-popup-sync',
      });
      host.style.display = 'inline-flex';
      host.style.marginLeft = '8px';
      host.style.verticalAlign = 'middle';
      searchBtn.insertAdjacentElement('afterend', host);
      popupBannerHost = host;

      root.innerHTML = `
        <span style="display:inline-flex; align-items:center; gap:6px;">
          <button type="button" class="eh-btn eh-btn-primary eh-btn-sm" id="eh-ndkt-sync"
            title="Tuần tự đồng bộ 8 nhóm thuế doanh nghiệp cốt lõi vào bộ nhớ đệm cục bộ">
            🔄 Đồng bộ 8 nhóm thuế DN
          </button>
          <span id="eh-ndkt-status" class="eh-muted" style="font-size:11.5px;"></span>
        </span>
      `;
      statusSpan = root.querySelector('#eh-ndkt-status');
      const syncBtn = root.querySelector('#eh-ndkt-sync');

      const waitNextTableUpdate = (prevSignature, timeoutMs = 4000) =>
        new Promise((resolve) => {
          const started = Date.now();
          const check = () => {
            const sig = resultTable.textContent || '';
            if (sig !== prevSignature && resultTable.querySelectorAll('tr').length > 1) {
              resolve(true);
              return;
            }
            if (Date.now() - started >= timeoutMs) {
              resolve(false);
              return;
            }
            setTimeout(check, 120);
          };
          setTimeout(check, 160);
        });

      syncBtn?.addEventListener('click', async () => {
        if (syncing) return;
        const pw = getPageWindow();
        if (typeof pw.traCuuDanhMuc !== 'function') {
          if (statusSpan) statusSpan.textContent = 'Không tìm thấy hàm traCuuDanhMuc() của trang.';
          return;
        }
        syncing = true;
        syncBtn.disabled = true;
        let totalCaptured = 0;

        for (let i = 0; i < SYNC_CORE_NDKT_GROUPS.length; i++) {
          const groupCode = SYNC_CORE_NDKT_GROUPS[i];
          const hasOpt = Array.from(cbo.options).some((o) => o.value === groupCode);
          if (!hasOpt) continue;

          if (statusSpan) {
            statusSpan.textContent = `Đang đồng bộ nhóm ${groupCode} (${i + 1}/${SYNC_CORE_NDKT_GROUPS.length})...`;
          }
          const prevSig = resultTable.textContent || '';
          cbo.value = groupCode;
          cbo.dispatchEvent(new Event('change', { bubbles: true }));
          try {
            pw.traCuuDanhMuc();
          } catch {
            // ignore
          }
          await waitNextTableUpdate(prevSig, 3500);
          const count = captureCurrentTable();
          totalCaptured += count;
          // Giãn cách lịch sự 350ms tránh gây tải máy chủ thuế
          await new Promise((r) => setTimeout(r, 350));
        }

        const merged = getMergedCatalog();
        if (statusSpan) {
          statusSpan.textContent = `✅ Đồng bộ xong ${totalCaptured} dòng (Tổng cache: ${merged.portalSyncedCount} tiểu mục)!`;
        }
        syncing = false;
        syncBtn.disabled = false;
      });
    }

    // Passive Capture ban đầu + mỗi khi `#tblResult` cập nhật sau khi bấm Tra cứu
    captureCurrentTable();
    popupObserver = new MutationObserver(() => {
      if (!syncing) captureCurrentTable();
    });
    popupObserver.observe(resultTable, { childList: true, subtree: true });
  };

  return {
    start() {
      if (!isEtaxOrigin(location.origin)) return;
      active = true;

      if (isNdktPopupPage(location, document)) {
        setupNdktPopupMode();
        return;
      }

      outsideClickHandler = (event) => {
        if (!activePickerHost) return;
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
        if (path.includes(activePickerHost) || activePickerHost.contains(event.target)) return;
        closePicker();
      };
      document.addEventListener('pointerdown', outsideClickHandler, true);

      // Khi popup tra cứu gốc `openWindow(i)` ghi xong dữ liệu vào `window.opener` và đóng lại,
      // sự kiện focus quay lại iframe sẽ kích hoạt đối soát lại toàn bộ các chấm Xanh/Đỏ!
      focusHandler = () => {
        for (const binding of rowBindings.values()) {
          binding.revalidate();
        }
      };
      window.addEventListener('focus', focusHandler);

      watcher = createDomWatcher(scanGntForm, { debounceMs: 200 });
      watcher.start();
    },

    stop() {
      active = false;
      closePicker();
      if (watcher) {
        watcher.stop();
        watcher = null;
      }
      if (popupObserver) {
        popupObserver.disconnect();
        popupObserver = null;
      }
      if (popupBannerHost) {
        popupBannerHost.remove();
        popupBannerHost = null;
      }
      if (focusHandler) {
        window.removeEventListener('focus', focusHandler);
        focusHandler = null;
      }
      if (outsideClickHandler) {
        document.removeEventListener('pointerdown', outsideClickHandler, true);
        outsideClickHandler = null;
      }
      for (const binding of rowBindings.values()) {
        binding.destroy();
      }
      rowBindings.clear();
    },
  };
}

  __exports.createTaxCodeHelperFeature = createTaxCodeHelperFeature;
  },

  "features/quick-access/bookmark-store.js": function(__require, __exports) {
const { STORAGE_KEYS, getValue, setValue } = __require("core/storage.js");
const { normalizeVietnamese } = __require("adapters/etax-adapter.js");

const STARTER_DECLARATION_PRESETS = [
  { coreCode: '01/GTGT', label: '01/GTGT — Thuế GTGT khấu trừ', matchMode: 'core' },
  { coreCode: '05/KK-TNCN', label: '05/KK-TNCN — Khấu trừ thuế TNCN', matchMode: 'core' },
  { coreCode: '03/TNDN', label: '03/TNDN — Quyết toán thuế TNDN', matchMode: 'core' },
  { coreCode: '05/QTT-TNCN', label: '05/QTT-TNCN — Quyết toán thuế TNCN', matchMode: 'core' },
  { coreCode: '01/LPMB', label: '01/LPMB — Tờ khai lệ phí môn bài', matchMode: 'core' },
];

function readStore() {
  const raw = getValue(STORAGE_KEYS.BOOKMARKS, null);
  if (!raw || typeof raw !== 'object') {
    return { schemaVersion: 1, global: [], byMst: {} };
  }
  return {
    schemaVersion: 1,
    global: Array.isArray(raw.global) ? [...raw.global] : [],
    byMst: raw.byMst && typeof raw.byMst === 'object' ? { ...raw.byMst } : {},
  };
}

function writeStore(store) {
  setValue(STORAGE_KEYS.BOOKMARKS, {
    schemaVersion: 1,
    global: store.global || [],
    byMst: store.byMst || {},
  });
}

function normKey(item) {
  const code = normalizeVietnamese(item.coreCode || '');
  const exact = item.matchMode === 'exact' ? normalizeVietnamese(item.preferredOptionText || '') : '';
  return `${code}|${item.matchMode || 'core'}|${exact}`;
}

function normalizeMst(mst) {
  return String(mst || '').trim().toUpperCase();
}

function getBookmarksForMst(mst = '') {
  const store = readStore();
  const mstKey = normalizeMst(mst);
  const mstList = mstKey && Array.isArray(store.byMst[mstKey]) ? [...store.byMst[mstKey]] : [];
  return {
    mstBookmarks: mstList,
    globalBookmarks: [...store.global],
    all: [...mstList.map((b) => ({ ...b, scope: 'mst' })), ...store.global.map((b) => ({ ...b, scope: 'global' }))],
  };
}

function addBookmark({
  coreCode,
  label = '',
  preferredOptionText = '',
  matchMode = 'core',
  scope = 'global',
  mst = '',
}) {
  const cleanCode = String(coreCode || '').trim();
  if (!cleanCode) return null;

  const store = readStore();
  const entry = {
    id: `bm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    coreCode: cleanCode,
    label: String(label || cleanCode).trim(),
    preferredOptionText: String(preferredOptionText || '').trim(),
    matchMode: matchMode === 'exact' && preferredOptionText ? 'exact' : 'core',
    createdAt: new Date().toISOString(),
  };

  const targetKey = normKey(entry);

  if (scope === 'mst') {
    const mstKey = normalizeMst(mst);
    if (!mstKey) return null;
    const list = Array.isArray(store.byMst[mstKey]) ? [...store.byMst[mstKey]] : [];
    if (list.some((b) => normKey(b) === targetKey)) return list.find((b) => normKey(b) === targetKey);
    list.unshift(entry);
    store.byMst[mstKey] = list;
  } else {
    if (store.global.some((b) => normKey(b) === targetKey)) {
      return store.global.find((b) => normKey(b) === targetKey);
    }
    store.global.unshift(entry);
  }

  writeStore(store);
  return entry;
}

function removeBookmark({ id, scope = 'global', mst = '' }) {
  const store = readStore();
  if (scope === 'mst') {
    const mstKey = normalizeMst(mst);
    if (mstKey && Array.isArray(store.byMst[mstKey])) {
      store.byMst[mstKey] = store.byMst[mstKey].filter((b) => b.id !== id);
      if (store.byMst[mstKey].length === 0) delete store.byMst[mstKey];
    }
  } else {
    store.global = store.global.filter((b) => b.id !== id);
  }
  writeStore(store);
}

function findExistingBookmark({ coreCode, preferredOptionText = '', matchMode = 'core', scope = 'global', mst = '' }) {
  const store = readStore();
  const list =
    scope === 'mst'
      ? store.byMst[normalizeMst(mst)] || []
      : store.global;
  const targetKey = normKey({ coreCode, preferredOptionText, matchMode });
  return list.find((b) => normKey(b) === targetKey) || null;
}

function seedStarterBookmarks() {
  const store = readStore();
  const existingKeys = new Set(store.global.map(normKey));
  for (const preset of STARTER_DECLARATION_PRESETS) {
    const item = {
      id: `bm_seed_${preset.coreCode.replace(/[^a-z0-9]/gi, '_')}`,
      coreCode: preset.coreCode,
      label: preset.label,
      preferredOptionText: '',
      matchMode: preset.matchMode,
      createdAt: new Date().toISOString(),
    };
    const key = normKey(item);
    if (!existingKeys.has(key)) {
      store.global.push(item);
      existingKeys.add(key);
    }
  }
  writeStore(store);
  return store.global;
}

  __exports.getBookmarksForMst = getBookmarksForMst;
  __exports.addBookmark = addBookmark;
  __exports.removeBookmark = removeBookmark;
  __exports.findExistingBookmark = findExistingBookmark;
  __exports.seedStarterBookmarks = seedStarterBookmarks;
  __exports.STARTER_DECLARATION_PRESETS = STARTER_DECLARATION_PRESETS;
  },

  "features/quick-access/declaration-matcher.js": function(__require, __exports) {
const { normalizeVietnamese } = __require("adapters/etax-adapter.js");

/**
 * Tách "mã lõi" tờ khai từ chuỗi option trên `/tthc/thu-tuc-hanh-chinh` (484 mẫu):
 * VD:
 *  - "01/GTGT - TỜ KHAI THUẾ GIÁ TRỊ GIA TĂNG Mẫu số 01/GTGT (TT80/2021)" -> "01/GTGT"
 *  - "05/KK-TNCN - Tờ khai khấu trừ thuế thu nhập cá nhân (TT89/2026)"   -> "05/KK-TNCN"
 *  - "02/NTNN (TT80) - Tờ khai quyết toán..."                             -> "02/NTNN"
 *  - "---Tất cả---"                                                       -> ""
 */
function extractCoreCode(optionText) {
  const raw = String(optionText || '').replace(/\s+/g, ' ').trim();
  if (!raw || raw.startsWith('---')) return '';

  const sepIdx = raw.indexOf(' - ');
  if (sepIdx > 0) {
    let left = raw.slice(0, sepIdx).trim();
    // Gỡ hậu tố thông tư dính trong phần mã nếu có, VD: "02/NTNN (TT80)" -> "02/NTNN"
    left = left.replace(/\s*\((?:TT|ND|NĐ|QĐ|QD)[^)]*\)\s*$/i, '').trim();
    return left;
  }

  return raw.slice(0, 40).trim();
}

/**
 * Trích xuất năm Thông tư / Nghị định trong tên tờ khai để tự xếp mẫu mới nhất lên đầu
 * (VD: TT89/2026 -> 2026, NĐ373/2025 -> 2025, TT80/2021 -> 2021, TT92/2015 -> 2015).
 */
function extractCircularYear(optionText) {
  const raw = String(optionText || '');
  // Ưu tiên dạng TTxx/YYYY, NĐxx/YYYY, QĐxx/YYYY
  const m1 = raw.match(/(?:TT|NĐ|ND|QĐ|QD)\s*\d*\s*\/\s*(20\d{2})/i);
  if (m1) return Number(m1[1]);
  // Dạng "Nghị định số 245/2026/NĐ-CP" hoặc "thông tư 133/2016/TT-BTC"
  const m2 = raw.match(/\/\s*(20\d{2})\s*\/(?:TT|NĐ|ND|QĐ|QD)/i);
  if (m2) return Number(m2[1]);
  // Dạng năm đơn lẻ trong ngoặc hoặc cuối câu (2000..2099)
  const m3 = raw.match(/\b(20\d{2})\b/);
  if (m3) return Number(m3[1]);
  return 0;
}

/**
 * Khớp danh sách `<option>` của dropdown Tờ khai với một Bookmark đã ghim:
 * - Nếu ghim đích danh (`matchMode === 'exact'`) và mẫu đó vẫn còn tồn tại -> trả đúng 1 mẫu (`single`).
 * - Nếu ghim theo mã lõi (`core`) hoặc mẫu đích danh đã bị đổi tên sang thông tư mới -> lọc mọi mẫu cùng mã lõi,
 *   xếp Thông tư năm mới nhất lên trên cùng!
 */
function matchDeclarationOptions(options, bookmark) {
  if (!Array.isArray(options) || !bookmark) {
    return { mode: 'none', match: null, candidates: [] };
  }

  const validOptions = options.filter((o) => {
    const t = String(o?.text || '').trim();
    return t && !t.startsWith('---') && o.value !== '';
  });

  if (bookmark.matchMode === 'exact' && bookmark.preferredOptionText) {
    const targetExact = normalizeVietnamese(bookmark.preferredOptionText);
    const exactHit = validOptions.find((o) => normalizeVietnamese(o.text) === targetExact);
    if (exactHit) {
      return { mode: 'single', match: exactHit, candidates: [exactHit] };
    }
  }

  const targetCore = normalizeVietnamese(bookmark.coreCode || '');
  if (!targetCore) {
    return { mode: 'none', match: null, candidates: [] };
  }

  const candidates = validOptions.filter((o) => {
    const optCore = normalizeVietnamese(extractCoreCode(o.text));
    if (optCore === targetCore) return true;
    // Xử lý mẫu gộp mã như "01/NTNN, NCCNN - ..." khi tìm "01/NTNN"
    const parts = optCore.split(/[,;]/).map((s) => s.trim());
    return parts.includes(targetCore);
  });

  // Sắp xếp Thông tư năm mới nhất lên đầu (TT89/2026 > NĐ373/2025 > TT80/2021 > TT92/2015 > chưa ghi năm)
  candidates.sort((a, b) => {
    const ya = extractCircularYear(a.text);
    const yb = extractCircularYear(b.text);
    if (ya !== yb) return yb - ya;
    return a.text.localeCompare(b.text, 'vi');
  });

  if (candidates.length === 0) {
    return { mode: 'none', match: null, candidates: [] };
  }
  if (candidates.length === 1) {
    return { mode: 'single', match: candidates[0], candidates };
  }
  return { mode: 'multiple', match: null, candidates };
}

/**
 * Từ danh sách nút `a.nop-hoso-btn` trong `#bangKetQuaTTHC`, loại trừ "Khai bổ sung hồ sơ khai thuế"
 * (`ma-tthc="1.008327"`) để luôn ưu tiên chọn **Nộp tờ khai mới (chính thức)**.
 */
function selectOfficialProcedure(buttons = []) {
  if (!Array.isArray(buttons) || buttons.length === 0) {
    return { action: 'none', target: null, officialButtons: [] };
  }

  const official = buttons.filter((b) => {
    if (b.isSupplementary) return false;
    const normTen = normalizeVietnamese(b.tenTthc || '');
    if (b.maTthc === '1.008327' || normTen.includes('khai bo sung')) return false;
    return true;
  });

  if (official.length === 1) {
    return { action: 'auto-click', target: official[0], officialButtons: official };
  }
  if (official.length >= 2) {
    return { action: 'highlight-multiple', target: null, officialButtons: official };
  }
  return { action: 'none', target: null, officialButtons: [] };
}

  __exports.extractCoreCode = extractCoreCode;
  __exports.extractCircularYear = extractCircularYear;
  __exports.matchDeclarationOptions = matchDeclarationOptions;
  __exports.selectOfficialProcedure = selectOfficialProcedure;
  },

  "features/quick-access/index.js": function(__require, __exports) {
const { isLoggedIn, isDvcOrigin, isEtaxOrigin, TTHC_DECLARATION_URL, scanPortalMenuItems, isTthcDeclarationPage, findDeclarationSelectContext, findTthcProcedureButtons, normalizeVietnamese } = __require("adapters/etax-adapter.js");
const { isTopFrame, notifyOpenQuickAccess, subscribeOpenQuickAccess } = __require("core/frame-bus.js");
const { createDomWatcher } = __require("core/dom-observer.js");
const { createShadowMount } = __require("ui/shadow-host.js");
const { activateDockSlot, deactivateDockSlot, getDockSlotContainer, notifyDockSlotUpdated, toggleDockPopover, openDockPopover, closeDockPopover, getActiveDockPopoverId, injectDockStyle } = __require("ui/unified-dock.js");
const { getActiveCompanyContext } = __require("features/company-bar/note-store.js");
const { getBookmarksForMst, addBookmark, removeBookmark, findExistingBookmark, seedStarterBookmarks } = __require("features/quick-access/bookmark-store.js");
const { extractCoreCode, extractCircularYear, matchDeclarationOptions, selectOfficialProcedure } = __require("features/quick-access/declaration-matcher.js");

const PENDING_INTENT_KEY = '__etax_helper_qa_pending_intent_v2';
const INTENT_TTL_MS = 20000;

const QA_DOCK_CSS = `
.eh-qa-sec-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: #64748b;
  margin: 10px 0 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.eh-qa-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.eh-qa-bm {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 9px;
  border-radius: 8px;
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #005a99;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  max-width: 100%;
}
.eh-qa-bm:hover {
  background: #dbeafe;
  border-color: #60a5fa;
}
.eh-qa-bm.mst-scope {
  background: #fffbeb;
  border-color: #fcd34d;
  color: #92400e;
}
.eh-qa-bm.mst-scope:hover {
  background: #fef3c7;
}
.eh-qa-bm-del {
  border: none;
  background: transparent;
  color: #94a3b8;
  font-weight: 700;
  cursor: pointer;
  padding: 0 2px;
  font-size: 13px;
  line-height: 1;
}
.eh-qa-bm-del:hover { color: #dc2626; }
.eh-qa-menu-list {
  max-height: 210px;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}
.eh-qa-menu-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  font-size: 12.5px;
}
.eh-qa-menu-row:last-child { border-bottom: none; }
.eh-qa-menu-row:hover, .eh-qa-menu-row.focused {
  background: #eff6ff;
  color: #006FBC;
}
.eh-qa-group {
  font-size: 11px;
  color: #64748b;
  white-space: nowrap;
}
`;

const INLINE_PIN_CSS = `
.eh-pin-bar {
  margin-top: 6px;
  padding: 6px 9px;
  border: 1px solid #bae0ff;
  border-radius: 8px;
  background: #f0f8ff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.eh-pin-info {
  font-size: 12px;
  color: #0f172a;
}
.eh-pin-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.eh-picker-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  z-index: 2147483645;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.eh-picker-card {
  width: min(560px, 100%);
  max-height: 80vh;
  overflow-y: auto;
  background: #ffffff;
  border-radius: 12px;
  border: 1.5px solid #006FBC;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.28);
  padding: 14px 16px;
}
.eh-ver-item {
  padding: 9px 11px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  margin-bottom: 7px;
  cursor: pointer;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.eh-ver-item:hover {
  background: #eff6ff;
  border-color: #006FBC;
}
.eh-ver-new {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #86efac;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}
`;

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getPageWindow() {
  try {
    return typeof unsafeWindow !== 'undefined' && unsafeWindow ? unsafeWindow : window;
  } catch {
    return window;
  }
}

function savePendingIntent(intent) {
  try {
    window.sessionStorage.setItem(
      PENDING_INTENT_KEY,
      JSON.stringify({ ...intent, expiresAt: Date.now() + INTENT_TTL_MS }),
    );
  } catch {
    // ignore
  }
}

function consumePendingIntent() {
  try {
    const raw = window.sessionStorage.getItem(PENDING_INTENT_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(PENDING_INTENT_KEY);
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.expiresAt || Date.now() > parsed.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function selectBootstrapOption(ctx, optionEl) {
  if (!ctx?.selectEl || !optionEl) return false;
  ctx.selectEl.value = optionEl.value;
  optionEl.selected = true;
  ctx.selectEl.dispatchEvent(new Event('change', { bubbles: true }));

  // Cập nhật giao diện nút bootstrap-select ngay lập tức
  if (ctx.toggleBtn) {
    ctx.toggleBtn.classList.remove('bs-placeholder');
    ctx.toggleBtn.setAttribute('title', optionEl.textContent || '');
    const inner = ctx.toggleBtn.querySelector('.filter-option-inner-inner');
    if (inner) inner.textContent = optionEl.textContent || '';
  }

  // Đồng bộ qua jQuery selectpicker nếu có sẵn trên trang
  try {
    const pw = getPageWindow();
    if (pw.jQuery && typeof pw.jQuery(ctx.selectEl).selectpicker === 'function') {
      pw.jQuery(ctx.selectEl).selectpicker('val', optionEl.value);
      pw.jQuery(ctx.selectEl).selectpicker('refresh');
    }
  } catch {
    // ignore
  }
  return true;
}

function createQuickAccessFeature() {
  let active = false;
  let watcher = null;
  let unsubOpenBus = null;
  let keydownHandler = null;

  let searchQuery = '';
  let focusedIndex = 0;
  let showQuickAddForm = false;
  let statusBanner = null;

  let inlinePinHost = null;
  let inlinePinRoot = null;
  let boundSelectEl = null;
  let selectChangeListener = null;
  let versionPickerHost = null;
  let versionPickerCleanup = null;

  const getCurrentMst = () => getActiveCompanyContext().mst || '';

  const closeVersionPicker = () => {
    if (versionPickerCleanup) {
      versionPickerCleanup();
      versionPickerCleanup = null;
    }
    if (versionPickerHost) {
      versionPickerHost.remove();
      versionPickerHost = null;
    }
  };

  const triggerSearchAndOpenOfficial = (ctx) => {
    if (!ctx?.searchButton) return;
    const container = ctx.resultContainer || document.querySelector('#bangKetQuaTTHC');
    const prevHtml = container ? container.innerHTML : '';
    let handled = false;

    const finalize = () => {
      if (handled) return;
      handled = true;
      document.removeEventListener('htmx:afterSettle', onSettle);
      const buttons = findTthcProcedureButtons(document);
      const decision = selectOfficialProcedure(buttons);

      if (decision.action === 'auto-click' && decision.target?.el) {
        decision.target.el.click();
        return;
      }

      if (decision.action === 'highlight-multiple') {
        const resBox = document.querySelector('#bangKetQuaTTHC');
        resBox?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        for (const btn of buttons) {
          const tr = btn.el.closest('tr');
          if (!tr) continue;
          if (btn.isSupplementary) {
            tr.style.opacity = '0.45';
          } else {
            tr.style.outline = '2px solid #006FBC';
            tr.style.backgroundColor = '#eff6ff';
          }
        }
      }
    };

    const onSettle = (event) => {
      const target = event?.detail?.target || event?.target;
      if (target && (target.id === 'bangKetQuaTTHC' || target.querySelector?.('#bangKetQuaTTHC'))) {
        setTimeout(finalize, 60);
      }
    };

    document.addEventListener('htmx:afterSettle', onSettle);
    ctx.searchButton.click();

    // Dự phòng nếu HTMX swap xong không bắn afterSettle trên target mong đợi
    const started = Date.now();
    const poll = () => {
      if (handled) return;
      const box = document.querySelector('#bangKetQuaTTHC');
      if (box && box.innerHTML !== prevHtml && box.querySelector('a.nop-hoso-btn')) {
        setTimeout(finalize, 80);
        return;
      }
      if (Date.now() - started < 6000) {
        setTimeout(poll, 160);
      } else {
        document.removeEventListener('htmx:afterSettle', onSettle);
      }
    };
    setTimeout(poll, 220);
  };

  const openVersionPickerModal = (ctx, bookmark, candidates) => {
    closeVersionPicker();
    const { host, root, cleanup } = createShadowMount(
      'div',
      INLINE_PIN_CSS,
      { 'data-etax-role': 'declaration-version-picker' },
      { guardBootstrapFocusTrap: true },
    );
    versionPickerHost = host;
    versionPickerCleanup = cleanup;
    document.body.appendChild(host);

    const maxYear = Math.max(...candidates.map((c) => extractCircularYear(c.text)));

    root.innerHTML = `
      <div class="eh-picker-backdrop" id="eh-vp-bg">
        <div class="eh-picker-card">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px;">
            <strong style="color:#006FBC; font-size:14px;">★ Chọn phiên bản Thông tư cho "${esc(bookmark.coreCode)}"</strong>
            <button type="button" class="eh-btn eh-btn-sm" id="eh-vp-close">Đóng</button>
          </div>
          <div class="eh-muted" style="margin-bottom:10px;">
            Có ${candidates.length} mẫu tờ khai khớp mã lõi <strong>${esc(bookmark.coreCode)}</strong> (mẫu Thông tư mới nhất được xếp trên cùng). Bấm chọn để tự tìm &amp; mở <strong>Tờ khai mới</strong>:
          </div>
          <div>
            ${candidates
              .map((c, idx) => {
                const yr = extractCircularYear(c.text);
                const isNewest = yr > 0 && yr === maxYear;
                return `
                  <div class="eh-ver-item" data-idx="${idx}">
                    <span style="font-size:12.5px; color:#0f172a; line-height:1.4;">${esc(c.text)}</span>
                    ${isNewest ? `<span class="eh-ver-new">Mới nhất (${yr})</span>` : yr > 0 ? `<span class="eh-muted">${yr}</span>` : ''}
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      </div>
    `;

    root.querySelector('#eh-vp-close')?.addEventListener('click', closeVersionPicker);
    root.querySelector('#eh-vp-bg')?.addEventListener('click', (e) => {
      if (e.target.id === 'eh-vp-bg') closeVersionPicker();
    });
    root.querySelectorAll('.eh-ver-item').forEach((el) => {
      el.addEventListener('click', () => {
        const picked = candidates[Number(el.dataset.idx)];
        closeVersionPicker();
        if (picked?.optionEl) {
          selectBootstrapOption(ctx, picked.optionEl);
          triggerSearchAndOpenOfficial(ctx);
        }
      });
    });
  };

  const executeDeclarationBookmarkOnPage = (bookmark) => {
    const ctx = findDeclarationSelectContext(document);
    if (!ctx) return false;

    const options = Array.from(ctx.selectEl.options).map((opt, index) => ({
      value: opt.value,
      text: (opt.textContent || '').replace(/\s+/g, ' ').trim(),
      index,
      optionEl: opt,
    }));

    const matched = matchDeclarationOptions(options, bookmark);
    if (matched.mode === 'single' && matched.match?.optionEl) {
      selectBootstrapOption(ctx, matched.match.optionEl);
      triggerSearchAndOpenOfficial(ctx);
      return true;
    }
    if (matched.mode === 'multiple') {
      openVersionPickerModal(ctx, bookmark, matched.candidates);
      return true;
    }

    // Không khớp được mã lõi -> mở dropdown để người dùng xem
    window.alert(`Không tìm thấy tờ khai nào khớp mã "${bookmark.coreCode}" trong danh sách hiện tại.`);
    return true;
  };

  const launchBookmark = (bookmark) => {
    closeDockPopover('quickAccess');
    if (isTthcDeclarationPage(location, document)) {
      executeDeclarationBookmarkOnPage(bookmark);
      return;
    }
    savePendingIntent({ type: 'OPEN_DECLARATION', bookmark });
    location.href = TTHC_DECLARATION_URL;
  };

  const renderPalettePopover = (popEl) => {
    injectDockStyle('quick-access-css', QA_DOCK_CSS);

    const mst = getCurrentMst();
    const { mstBookmarks, globalBookmarks } = getBookmarksForMst(mst);
    const menuItems = scanPortalMenuItems(document);
    const q = normalizeVietnamese(searchQuery);

    const filterBm = (list) =>
      q
        ? list.filter(
            (b) =>
              normalizeVietnamese(b.coreCode).includes(q) ||
              normalizeVietnamese(b.label).includes(q) ||
              normalizeVietnamese(b.preferredOptionText).includes(q),
          )
        : list;

    const filteredMstBm = filterBm(mstBookmarks);
    const filteredGlobalBm = filterBm(globalBookmarks);
    const filteredMenus = q
      ? menuItems.filter(
          (m) =>
            normalizeVietnamese(m.label).includes(q) ||
            normalizeVietnamese(m.group).includes(q),
        )
      : menuItems;

    const totalBookmarks = mstBookmarks.length + globalBookmarks.length;
    if (focusedIndex >= filteredMenus.length) focusedIndex = 0;

    const renderBmChip = (b, scope) => `
      <span class="eh-qa-bm ${scope === 'mst' ? 'mst-scope' : ''}" data-bm-id="${esc(b.id)}" data-bm-scope="${scope}"
        title="Bấm để mở ngay Tờ khai mới cho ${esc(b.coreCode)}${b.preferredOptionText ? `\n(${esc(b.preferredOptionText)})` : ''}">
        <span class="eh-qa-bm-run">${scope === 'mst' ? '🏢' : '★'} ${esc(b.coreCode)}${
          b.label && b.label !== b.coreCode ? ` <span style="font-weight:400; opacity:0.85;">· ${esc(b.label.replace(new RegExp(`^${b.coreCode}\\s*[-—–:]?\\s*`, 'i'), '').slice(0, 26))}</span>` : ''
        }</span>
        <button type="button" class="eh-qa-bm-del" data-del-id="${esc(b.id)}" data-del-scope="${scope}" title="Bỏ ghim">×</button>
      </span>
    `;

    popEl.innerHTML = `
      <div class="eh-pop-head">
        <div class="eh-pop-title">⚡ Truy cập nhanh &amp; Tờ khai đã ghim <span class="eh-muted" style="font-weight:500;">(Ctrl + K)</span></div>
        <button type="button" class="eh-pop-close" id="eh-qa-close" title="Đóng">×</button>
      </div>
      <input type="text" class="eh-input" id="eh-qa-search" value="${esc(searchQuery)}"
        placeholder="🔍 Gõ tên chức năng (Lập GNT, Tra cứu...) hoặc mã tờ khai (01/GTGT)..." autocomplete="off"/>

      <div class="eh-qa-sec-title">
        <span>★ Tờ khai đã ghim (1 chạm → tự mở Tờ khai mới)</span>
        <button type="button" class="eh-btn eh-btn-sm" id="eh-qa-toggle-add">${showQuickAddForm ? 'Ẩn' : '+ Ghim mã'}</button>
      </div>

      ${
        showQuickAddForm
          ? `
        <div style="padding:8px; margin-bottom:8px; border:1px solid #bae0ff; border-radius:8px; background:#f8fafc;">
          <div style="display:flex; gap:6px; margin-bottom:6px;">
            <input type="text" class="eh-input" id="eh-qa-add-code" placeholder="Mã lõi (VD: 01/GTGT, 05/KK-TNCN)..." style="flex:1;"/>
            <select class="eh-select" id="eh-qa-add-scope" style="width:140px;">
              <option value="global">Ghim chung</option>
              ${mst ? `<option value="mst">Riêng MST ${esc(mst)}</option>` : ''}
            </select>
          </div>
          <div style="display:flex; gap:6px;">
            <input type="text" class="eh-input" id="eh-qa-add-label" placeholder="Tên gợi nhớ ngắn (không bắt buộc)..." style="flex:1;"/>
            <button type="button" class="eh-btn eh-btn-primary eh-btn-sm" id="eh-qa-add-save">Ghim</button>
          </div>
        </div>
      `
          : ''
      }

      ${
        totalBookmarks === 0
          ? `
        <div style="padding:10px; border:1px dashed #cbd5e1; border-radius:8px; text-align:center; background:#f8fafc;">
          <div class="eh-muted" style="margin-bottom:6px;">Chưa ghim tờ khai nào. Bạn có thể bấm nút <strong>☆ Ghim</strong> ngay trên trang <em>Thủ tục hành chính</em> hoặc nạp nhanh 5 mẫu DN phổ biến:</div>
          <button type="button" class="eh-btn eh-btn-primary eh-btn-sm" id="eh-qa-seed">✨ Nạp nhanh 5 tờ khai DN phổ biến</button>
        </div>
      `
          : `
        ${
          filteredMstBm.length > 0
            ? `<div style="margin-bottom:6px;">
                <div class="eh-muted" style="font-size:11px; margin-bottom:4px;">Ghim riêng cho MST ${esc(mst)}:</div>
                <div class="eh-qa-chips">${filteredMstBm.map((b) => renderBmChip(b, 'mst')).join('')}</div>
              </div>`
            : ''
        }
        ${
          filteredGlobalBm.length > 0
            ? `<div class="eh-qa-chips">${filteredGlobalBm.map((b) => renderBmChip(b, 'global')).join('')}</div>`
            : filteredMstBm.length === 0
              ? '<div class="eh-muted" style="font-size:12px;">Không có tờ khai đã ghim nào khớp từ khóa.</div>'
              : ''
        }
      `
      }

      ${statusBanner ? `<div class="eh-success" style="margin-top:7px;">${esc(statusBanner)}</div>` : ''}

      <div class="eh-qa-sec-title">
        <span>🧭 Chức năng cổng Thuế (quét động Menu)</span>
        <span>${filteredMenus.length} mục</span>
      </div>
      <div class="eh-qa-menu-list">
        ${
          filteredMenus.length === 0
            ? '<div style="padding:10px; text-align:center;" class="eh-muted">Không có mục menu nào khớp.</div>'
            : filteredMenus
                .map(
                  (m, i) => `
              <div class="eh-qa-menu-row ${i === focusedIndex ? 'focused' : ''}" data-menu-idx="${i}">
                <span>${esc(m.label)}</span>
                <span class="eh-qa-group">${esc(m.group)}</span>
              </div>`,
                )
                .join('')
        }
      </div>
    `;

    popEl.querySelector('#eh-qa-close')?.addEventListener('click', () => closeDockPopover('quickAccess'));

    popEl.querySelector('#eh-qa-toggle-add')?.addEventListener('click', () => {
      showQuickAddForm = !showQuickAddForm;
      statusBanner = null;
      renderPalettePopover(popEl);
      if (showQuickAddForm) popEl.querySelector('#eh-qa-add-code')?.focus();
    });

    popEl.querySelector('#eh-qa-add-save')?.addEventListener('click', () => {
      const code = (popEl.querySelector('#eh-qa-add-code')?.value || '').trim();
      const label = (popEl.querySelector('#eh-qa-add-label')?.value || '').trim();
      const scope = popEl.querySelector('#eh-qa-add-scope')?.value || 'global';
      if (!code) return;
      addBookmark({ coreCode: code, label: label || code, matchMode: 'core', scope, mst });
      showQuickAddForm = false;
      statusBanner = `Đã ghim tờ khai "${code}"!`;
      renderPalettePopover(popEl);
    });

    popEl.querySelector('#eh-qa-seed')?.addEventListener('click', () => {
      seedStarterBookmarks();
      statusBanner = 'Đã nạp 5 tờ khai DN phổ biến!';
      renderPalettePopover(popEl);
    });

    // Chạy tờ khai đã ghim hoặc xóa ghim
    popEl.querySelectorAll('.eh-qa-bm').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        if (e.target.closest('.eh-qa-bm-del')) return;
        const id = chip.dataset.bmId;
        const scope = chip.dataset.bmScope;
        const list = scope === 'mst' ? mstBookmarks : globalBookmarks;
        const target = list.find((b) => b.id === id);
        if (target) launchBookmark(target);
      });
    });

    popEl.querySelectorAll('.eh-qa-bm-del').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeBookmark({ id: btn.dataset.delId, scope: btn.dataset.delScope, mst });
        statusBanner = null;
        renderPalettePopover(popEl);
      });
    });

    const activateMenu = (item) => {
      if (!item) return;
      closeDockPopover('quickAccess');
      if (item.el && document.contains(item.el)) {
        item.el.click();
      } else if (item.href) {
        location.href = item.href;
      }
    };

    popEl.querySelectorAll('.eh-qa-menu-row').forEach((row) => {
      row.addEventListener('click', () => {
        activateMenu(filteredMenus[Number(row.dataset.menuIdx)]);
      });
    });

    const searchInput = popEl.querySelector('#eh-qa-search');
    if (searchInput && !showQuickAddForm) {
      searchInput.focus();
      searchInput.setSelectionRange(searchQuery.length, searchQuery.length);
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        focusedIndex = 0;
        statusBanner = null;
        renderPalettePopover(popEl);
      });
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' && filteredMenus.length > 0) {
          e.preventDefault();
          focusedIndex = (focusedIndex + 1) % filteredMenus.length;
          renderPalettePopover(popEl);
        } else if (e.key === 'ArrowUp' && filteredMenus.length > 0) {
          e.preventDefault();
          focusedIndex = (focusedIndex - 1 + filteredMenus.length) % filteredMenus.length;
          renderPalettePopover(popEl);
        } else if (e.key === 'Enter' && filteredMenus.length > 0) {
          e.preventDefault();
          activateMenu(filteredMenus[focusedIndex]);
        }
      });
    }
  };

  const openPalette = () => {
    if (!active || !isLoggedIn(document, location)) return;
    statusBanner = null;
    openDockPopover('quickAccess', renderPalettePopover, {
      maxWidth: '500px',
      onClose: () => renderDockButton(),
    });
    renderDockButton();
  };

  const renderDockButton = () => {
    if (!active) return;
    if (!isLoggedIn(document, location)) {
      deactivateDockSlot('quickAccess');
      return;
    }
    const slot = getDockSlotContainer('quickAccess') || activateDockSlot('quickAccess');
    if (!slot) return;

    const popOpen = getActiveDockPopoverId() === 'quickAccess';
    slot.innerHTML = `
      <button type="button" class="eh-dock-chip eh-hide-collapsed ${popOpen ? 'active' : ''}" id="eh-qa-btn"
        title="Mở Truy cập nhanh & Tờ khai đã ghim (Phím tắt: Ctrl + K)">
        ⚡ <span>Truy cập nhanh</span>
      </button>
    `;
    slot.querySelector('#eh-qa-btn')?.addEventListener('click', () => {
      statusBanner = null;
      toggleDockPopover('quickAccess', renderPalettePopover, {
        maxWidth: '500px',
        onClose: () => renderDockButton(),
      });
      renderDockButton();
    });
    notifyDockSlotUpdated('quickAccess');
  };

  // ============================================================================
  // THANH GHIM TRỰC TIẾP TRÊN TRANG `/tthc/thu-tuc-hanh-chinh`
  // ============================================================================

  const renderInlinePinBar = (ctx) => {
    if (!inlinePinRoot || !ctx?.selectEl) return;
    const opt = ctx.selectEl.options[ctx.selectEl.selectedIndex];
    const optText = opt && opt.value ? (opt.textContent || '').replace(/\s+/g, ' ').trim() : '';
    const coreCode = extractCoreCode(optText);
    const mst = getCurrentMst();

    if (!coreCode) {
      inlinePinRoot.innerHTML = `
        <div class="eh-pin-bar">
          <span class="eh-pin-info eh-muted">★ Chọn một <strong>Tờ khai</strong> ở ô trên để Ghim 1 chạm vào khung Truy cập nhanh (Ctrl + K).</span>
        </div>
      `;
      return;
    }

    const existingGlobal = findExistingBookmark({ coreCode, matchMode: 'core', scope: 'global' });
    const existingMst = mst
      ? findExistingBookmark({ coreCode, matchMode: 'core', scope: 'mst', mst })
      : null;

    inlinePinRoot.innerHTML = `
      <div class="eh-pin-bar">
        <span class="eh-pin-info">Mã lõi: <strong>${esc(coreCode)}</strong></span>
        <div class="eh-pin-actions">
          <button type="button" class="eh-btn eh-btn-sm ${existingGlobal ? 'eh-btn-primary' : ''}" id="eh-pin-global">
            ${existingGlobal ? '★ Đã ghim chung' : '☆ Ghim chung (mọi Cty)'}
          </button>
          ${
            mst
              ? `<button type="button" class="eh-btn eh-btn-sm ${existingMst ? 'eh-btn-primary' : ''}" id="eh-pin-mst">
                  ${existingMst ? `★ Đã ghim MST ${esc(mst)}` : `☆ Ghim riêng MST ${esc(mst)}`}
                </button>`
              : ''
          }
        </div>
      </div>
    `;

    inlinePinRoot.querySelector('#eh-pin-global')?.addEventListener('click', () => {
      if (existingGlobal) {
        removeBookmark({ id: existingGlobal.id, scope: 'global' });
      } else {
        addBookmark({
          coreCode,
          label: optText.slice(0, 60),
          preferredOptionText: optText,
          matchMode: 'core',
          scope: 'global',
        });
      }
      renderInlinePinBar(ctx);
    });

    inlinePinRoot.querySelector('#eh-pin-mst')?.addEventListener('click', () => {
      if (!mst) return;
      if (existingMst) {
        removeBookmark({ id: existingMst.id, scope: 'mst', mst });
      } else {
        addBookmark({
          coreCode,
          label: optText.slice(0, 60),
          preferredOptionText: optText,
          matchMode: 'core',
          scope: 'mst',
          mst,
        });
      }
      renderInlinePinBar(ctx);
    });
  };

  const mountInlinePinIfOnTthcPage = () => {
    if (!isTthcDeclarationPage(location, document)) return;
    const ctx = findDeclarationSelectContext(document);
    if (!ctx) return;

    const anchorParent = ctx.wrapper || ctx.selectEl;
    if (!inlinePinHost || !document.contains(inlinePinHost)) {
      const { host, root } = createShadowMount('div', INLINE_PIN_CSS, {
        'data-etax-role': 'tthc-inline-pin',
      });
      inlinePinHost = host;
      inlinePinRoot = root;
      anchorParent.insertAdjacentElement('afterend', host);
    }

    if (boundSelectEl !== ctx.selectEl) {
      if (boundSelectEl && selectChangeListener) {
        boundSelectEl.removeEventListener('change', selectChangeListener);
      }
      boundSelectEl = ctx.selectEl;
      selectChangeListener = () => renderInlinePinBar(ctx);
      boundSelectEl.addEventListener('change', selectChangeListener);
    }

    renderInlinePinBar(ctx);

    // Kiểm tra và thực thi Pending Intent nếu vừa điều hướng từ nút Ghim tờ khai sang
    const pending = consumePendingIntent();
    if (pending && pending.type === 'OPEN_DECLARATION' && pending.bookmark) {
      setTimeout(() => executeDeclarationBookmarkOnPage(pending.bookmark), 120);
    }
  };

  const scanTopFrame = () => {
    if (!active) return;
    renderDockButton();
    mountInlinePinIfOnTthcPage();
  };

  return {
    start() {
      active = true;

      // Phím tắt Ctrl + K hoạt động ở CẢ Top-Frame (dichvucong) lẫn iframe (thuedientu)
      keydownHandler = (e) => {
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          e.stopPropagation();
          if (isTopFrame() && isDvcOrigin(location.origin)) {
            if (getActiveDockPopoverId() === 'quickAccess') {
              closeDockPopover('quickAccess');
            } else {
              openPalette();
            }
          } else if (isEtaxOrigin(location.origin)) {
            notifyOpenQuickAccess('iframe-ctrl-k');
          }
        }
      };
      window.addEventListener('keydown', keydownHandler, true);

      if (!isTopFrame() || !isDvcOrigin(location.origin)) return;

      unsubOpenBus = subscribeOpenQuickAccess(() => {
        openPalette();
      });

      watcher = createDomWatcher(scanTopFrame, { debounceMs: 220 });
      watcher.start();
    },

    stop() {
      active = false;
      closeVersionPicker();
      if (keydownHandler) {
        window.removeEventListener('keydown', keydownHandler, true);
        keydownHandler = null;
      }
      if (unsubOpenBus) {
        unsubOpenBus();
        unsubOpenBus = null;
      }
      if (watcher) {
        watcher.stop();
        watcher = null;
      }
      if (boundSelectEl && selectChangeListener) {
        boundSelectEl.removeEventListener('change', selectChangeListener);
        boundSelectEl = null;
        selectChangeListener = null;
      }
      if (inlinePinHost) {
        inlinePinHost.remove();
        inlinePinHost = null;
        inlinePinRoot = null;
      }
      closeDockPopover('quickAccess');
      deactivateDockSlot('quickAccess');
    },
  };
}

  __exports.createQuickAccessFeature = createQuickAccessFeature;
  },

  "features/signing-status/probe.js": function(__require, __exports) {
const { DEFAULT_SIGNING_PORTS } = __require("adapters/etax-adapter.js");

/**
 * Kiểm tra cổng cục bộ của phần mềm ký số (CT SigningHub :32001 & eSigner Java :8768)
 * bằng `GM_xmlhttpRequest` tới ĐƯỜNG DẪN GỐC `/` trên `127.0.0.1` (Loopback Only).
 *
 * QUY TẮC AN TOÀN TUYỆT ĐỐI:
 * - TUYỆT ĐỐI KHÔNG gọi `/api/hubclient/GetCert` hay `/signhash` vì sẽ làm bật pop-up nhập PIN Token trên Windows!
 * - Mọi phản hồi HTTP có `status > 0` (kể cả 200, 400, 404, 405, 426...) đều xác nhận dịch vụ đang chạy trên cổng đó.
 */

function normalizePort(port, fallback) {
  const n = Number(port);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : fallback;
}

function runSingleHttpProbe(url, timeoutMs, requester) {
  return new Promise((resolve) => {
    const started = Date.now();
    try {
      requester({
        method: 'GET',
        url,
        timeout: timeoutMs,
        anonymous: true,
        onload(resp) {
          const status = Number(resp?.status || 0);
          resolve({
            online: status > 0,
            status,
            latencyMs: Date.now() - started,
            reason: status > 0 ? `HTTP ${status}` : 'Không có mã phản hồi HTTP',
          });
        },
        onerror() {
          resolve({
            online: false,
            status: 0,
            latencyMs: Date.now() - started,
            reason: 'Không kết nối được cổng (ứng dụng chưa bật)',
          });
        },
        ontimeout() {
          resolve({
            online: false,
            status: 0,
            latencyMs: Date.now() - started,
            reason: 'Quá thời gian chờ phản hồi',
          });
        },
      });
    } catch (err) {
      resolve({
        online: false,
        status: 0,
        latencyMs: Date.now() - started,
        reason: err?.message || 'Lỗi gọi GM_xmlhttpRequest',
      });
    }
  });
}

async function probeLocalSigningPort({
  port,
  tryHttpsFallback = false,
  timeoutMs = 1500,
  requester = typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : null,
} = {}) {
  const safePort = normalizePort(port, 0);
  if (!safePort) {
    return { state: 'offline', online: false, status: 0, port: 0, reason: 'Số cổng không hợp lệ' };
  }
  if (typeof requester !== 'function') {
    return {
      state: 'unknown',
      online: false,
      status: 0,
      port: safePort,
      reason: 'Tampermonkey chưa cấp quyền GM_xmlhttpRequest',
    };
  }

  // Luôn chỉ gọi đường dẫn gốc `/` trên loopback 127.0.0.1 — không chạm API Token!
  const httpUrl = `http://127.0.0.1:${safePort}/`;
  const httpRes = await runSingleHttpProbe(httpUrl, timeoutMs, requester);
  if (httpRes.online) {
    return {
      state: 'online',
      online: true,
      protocol: 'http',
      port: safePort,
      status: httpRes.status,
      latencyMs: httpRes.latencyMs,
      reason: `Đang chạy (${httpRes.reason}, ${httpRes.latencyMs}ms)`,
    };
  }

  if (tryHttpsFallback) {
    const httpsUrl = `https://127.0.0.1:${safePort}/`;
    const httpsRes = await runSingleHttpProbe(httpsUrl, timeoutMs, requester);
    if (httpsRes.online) {
      return {
        state: 'online',
        online: true,
        protocol: 'https',
        port: safePort,
        status: httpsRes.status,
        latencyMs: httpsRes.latencyMs,
        reason: `Đang chạy (HTTPS ${httpsRes.status}, ${httpsRes.latencyMs}ms)`,
      };
    }
  }

  return {
    state: 'offline',
    online: false,
    protocol: 'http',
    port: safePort,
    status: 0,
    latencyMs: httpRes.latencyMs,
    reason: httpRes.reason,
  };
}

async function probeAllSigningApps({
  signingHubPort = DEFAULT_SIGNING_PORTS.signingHub,
  eSignerPort = DEFAULT_SIGNING_PORTS.eSigner,
  timeoutMs = 1500,
  requester,
} = {}) {
  const shPort = normalizePort(signingHubPort, DEFAULT_SIGNING_PORTS.signingHub);
  const esPort = normalizePort(eSignerPort, DEFAULT_SIGNING_PORTS.eSigner);

  const [signingHub, eSigner] = await Promise.all([
    probeLocalSigningPort({
      port: shPort,
      tryHttpsFallback: false,
      timeoutMs,
      requester,
    }),
    probeLocalSigningPort({
      port: esPort,
      tryHttpsFallback: true,
      timeoutMs,
      requester,
    }),
  ]);

  return {
    signingHub,
    eSigner,
    checkedAt: Date.now(),
  };
}

/**
 * Tổng hợp trạng thái đèn trên Unified Dock theo chế độ theo dõi của từng máy kế toán.
 */
function evaluateSigningAggregate({ signingHub, eSigner } = {}, watchTarget = 'any') {
  const s1 = signingHub?.state || 'unknown';
  const s2 = eSigner?.state || 'unknown';

  if (watchTarget === 'signinghub') return s1;
  if (watchTarget === 'esigner') return s2;

  if (watchTarget === 'both') {
    if (s1 === 'online' && s2 === 'online') return 'online';
    if (s1 === 'checking' || s2 === 'checking') return 'checking';
    if (s1 === 'unknown' && s2 === 'unknown') return 'unknown';
    return 'offline';
  }

  // Mặc định `'any'`: Xanh khi ít nhất 1 trong 2 phần mềm ký số đang bật
  if (s1 === 'online' || s2 === 'online') return 'online';
  if (s1 === 'checking' || s2 === 'checking') return 'checking';
  if (s1 === 'unknown' && s2 === 'unknown') return 'unknown';
  return 'offline';
}

  __exports.probeLocalSigningPort = probeLocalSigningPort;
  __exports.probeAllSigningApps = probeAllSigningApps;
  __exports.evaluateSigningAggregate = evaluateSigningAggregate;
  },

  "features/signing-status/index.js": function(__require, __exports) {
const { isLoggedIn, DEFAULT_SIGNING_PORTS } = __require("adapters/etax-adapter.js");
const { STORAGE_KEYS, getValue, setValue } = __require("core/storage.js");
const { isTopFrame } = __require("core/frame-bus.js");
const { createDomWatcher } = __require("core/dom-observer.js");
const { activateDockSlot, deactivateDockSlot, getDockSlotContainer, notifyDockSlotUpdated, toggleDockPopover, openDockPopover, closeDockPopover, getActiveDockPopoverId } = __require("ui/unified-dock.js");
const { probeAllSigningApps, evaluateSigningAggregate } = __require("features/signing-status/probe.js");

const DEFAULT_SIGNING_CONFIG = {
  schemaVersion: 1,
  watchTarget: 'any', // 'any' | 'signinghub' | 'esigner' | 'both'
  signingHubPort: DEFAULT_SIGNING_PORTS.signingHub,
  eSignerPort: DEFAULT_SIGNING_PORTS.eSigner,
};

function loadConfig() {
  const raw = getValue(STORAGE_KEYS.SIGNING_CONFIG, null);
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SIGNING_CONFIG };
  const validTargets = new Set(['any', 'signinghub', 'esigner', 'both']);
  return {
    schemaVersion: 1,
    watchTarget: validTargets.has(raw.watchTarget) ? raw.watchTarget : 'any',
    signingHubPort: Number(raw.signingHubPort) || DEFAULT_SIGNING_PORTS.signingHub,
    eSignerPort: Number(raw.eSignerPort) || DEFAULT_SIGNING_PORTS.eSigner,
  };
}

function saveConfig(cfg) {
  setValue(STORAGE_KEYS.SIGNING_CONFIG, {
    schemaVersion: 1,
    watchTarget: cfg.watchTarget,
    signingHubPort: cfg.signingHubPort,
    eSignerPort: cfg.eSignerPort,
  });
}

function formatTime(ts) {
  if (!ts) return 'Chưa kiểm tra';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createSigningStatusFeature() {
  let active = false;
  let watcher = null;
  let initialTimer = null;
  let hasProbedOnceForLogin = false;
  let showAdvancedPorts = false;

  let config = loadConfig();
  let state = {
    signingHub: { state: 'unknown', port: config.signingHubPort, reason: 'Chưa kiểm tra' },
    eSigner: { state: 'unknown', port: config.eSignerPort, reason: 'Chưa kiểm tra' },
    checkedAt: 0,
  };

  const runProbe = async () => {
    if (!active) return;
    state = {
      signingHub: { state: 'checking', port: config.signingHubPort, reason: 'Đang kiểm tra...' },
      eSigner: { state: 'checking', port: config.eSignerPort, reason: 'Đang kiểm tra...' },
      checkedAt: state.checkedAt,
    };
    renderSlot();
    if (getActiveDockPopoverId() === 'signing') {
      openDockPopover('signing', renderPopover, {
        maxWidth: '370px',
        onClose: () => renderSlot(),
      });
    }

    const res = await probeAllSigningApps({
      signingHubPort: config.signingHubPort,
      eSignerPort: config.eSignerPort,
    });
    if (!active) return;
    state = res;
    renderSlot();

    if (getActiveDockPopoverId() === 'signing') {
      openDockPopover('signing', renderPopover, {
        maxWidth: '370px',
        onClose: () => renderSlot(),
      });
    }
  };

  const renderPopover = (popEl) => {
    const agg = evaluateSigningAggregate(state, config.watchTarget);
    const badgeFor = (s) =>
      s === 'online'
        ? '<span class="eh-badge eh-badge-ok">🟢 Đang bật</span>'
        : s === 'checking'
          ? '<span class="eh-badge eh-badge-warn">⏳ Đang kiểm tra</span>'
          : '<span class="eh-badge eh-badge-err">🔴 Chưa bật</span>';

    popEl.innerHTML = `
      <div class="eh-pop-head">
        <div class="eh-pop-title">🔏 Trạng thái Phần mềm Ký số</div>
        <button type="button" class="eh-pop-close" id="eh-sg-close" title="Đóng">×</button>
      </div>

      <div style="display:flex; flex-direction:column; gap:7px; margin-bottom:10px;">
        <div style="padding:8px 10px; border:1px solid #e2e8f0; border-radius:8px; background:#f8fafc;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
            <strong>CT SigningHub <span class="eh-muted">(:${config.signingHubPort})</span></strong>
            ${badgeFor(state.signingHub.state)}
          </div>
          <div class="eh-muted" style="margin-top:3px; font-size:11.5px;">Dùng cho cổng Dịch vụ công mới · ${esc(state.signingHub.reason)}</div>
        </div>

        <div style="padding:8px 10px; border:1px solid #e2e8f0; border-radius:8px; background:#f8fafc;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
            <strong>eSigner Java <span class="eh-muted">(:${config.eSignerPort})</span></strong>
            ${badgeFor(state.eSigner.state)}
          </div>
          <div class="eh-muted" style="margin-top:3px; font-size:11.5px;">Dùng cho iframe Thuế điện tử (GNT/XML) · ${esc(state.eSigner.reason)}</div>
        </div>
      </div>

      <div style="margin-bottom:9px;">
        <label for="eh-sg-target" style="display:block; font-size:11.5px; font-weight:600; color:#475569; margin-bottom:4px;">
          Quy tắc báo đèn trên máy này:
        </label>
        <select class="eh-select" id="eh-sg-target" style="font-size:12px;">
          <option value="any" ${config.watchTarget === 'any' ? 'selected' : ''}>Xanh khi ít nhất 1 trong 2 app đang bật (Mặc định)</option>
          <option value="signinghub" ${config.watchTarget === 'signinghub' ? 'selected' : ''}>Chỉ theo dõi CT SigningHub</option>
          <option value="esigner" ${config.watchTarget === 'esigner' ? 'selected' : ''}>Chỉ theo dõi eSigner Java</option>
          <option value="both" ${config.watchTarget === 'both' ? 'selected' : ''}>Yêu cầu CẢ HAI app cùng bật</option>
        </select>
      </div>

      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
        <span class="eh-muted" style="font-size:11.5px;">Kiểm tra lúc: ${esc(formatTime(state.checkedAt))}</span>
        <div style="display:flex; gap:6px;">
          <button type="button" class="eh-btn eh-btn-sm" id="eh-sg-ports-toggle">${showAdvancedPorts ? 'Ẩn cổng' : '⚙️ Cổng'}</button>
          <button type="button" class="eh-btn eh-btn-primary eh-btn-sm" id="eh-sg-recheck">🔄 Kiểm tra lại</button>
        </div>
      </div>

      ${
        showAdvancedPorts
          ? `
        <div style="margin-top:9px; padding-top:8px; border-top:1px solid #e2e8f0; display:flex; align-items:flex-end; gap:6px;">
          <div style="flex:1;">
            <label style="font-size:11px; color:#64748b;">Cổng SigningHub</label>
            <input type="number" class="eh-input" id="eh-sg-port-sh" value="${config.signingHubPort}" style="padding:4px 6px; font-size:12px;"/>
          </div>
          <div style="flex:1;">
            <label style="font-size:11px; color:#64748b;">Cổng eSigner</label>
            <input type="number" class="eh-input" id="eh-sg-port-es" value="${config.eSignerPort}" style="padding:4px 6px; font-size:12px;"/>
          </div>
          <button type="button" class="eh-btn eh-btn-sm" id="eh-sg-ports-save">Lưu</button>
        </div>
      `
          : ''
      }

      ${
        agg === 'offline'
          ? '<div class="eh-warning" style="margin-top:9px;">⚠️ Chưa phát hiện phần mềm ký số đang chạy. Hãy mở ứng dụng ký số trên Windows rồi bấm <strong>Kiểm tra lại</strong> trước khi trình ký.</div>'
          : ''
      }
    `;

    popEl.querySelector('#eh-sg-close')?.addEventListener('click', () => closeDockPopover('signing'));
    popEl.querySelector('#eh-sg-recheck')?.addEventListener('click', () => {
      void runProbe();
    });
    popEl.querySelector('#eh-sg-target')?.addEventListener('change', (e) => {
      config.watchTarget = e.target.value;
      saveConfig(config);
      renderSlot();
      renderPopover(popEl);
    });
    popEl.querySelector('#eh-sg-ports-toggle')?.addEventListener('click', () => {
      showAdvancedPorts = !showAdvancedPorts;
      renderPopover(popEl);
    });
    popEl.querySelector('#eh-sg-ports-save')?.addEventListener('click', () => {
      const sh = parseInt(popEl.querySelector('#eh-sg-port-sh')?.value || '', 10);
      const es = parseInt(popEl.querySelector('#eh-sg-port-es')?.value || '', 10);
      if (sh >= 1 && sh <= 65535) config.signingHubPort = sh;
      if (es >= 1 && es <= 65535) config.eSignerPort = es;
      saveConfig(config);
      showAdvancedPorts = false;
      void runProbe();
    });
  };

  const renderSlot = () => {
    if (!active) return;
    if (!isLoggedIn(document, location)) {
      deactivateDockSlot('signing');
      return;
    }

    const slot = getDockSlotContainer('signing') || activateDockSlot('signing');
    if (!slot) return;

    const agg = evaluateSigningAggregate(state, config.watchTarget);
    const popOpen = getActiveDockPopoverId() === 'signing';
    const textLabel =
      agg === 'online'
        ? 'Ký số'
        : agg === 'checking'
          ? 'Đang dò...'
          : agg === 'offline'
            ? 'Chưa bật ký số'
            : 'Ký số';

    const titleText =
      `CT SigningHub (:${config.signingHubPort}): ${state.signingHub.state === 'online' ? 'Đang bật' : 'Chưa bật'}\n` +
      `eSigner Java (:${config.eSignerPort}): ${state.eSigner.state === 'online' ? 'Đang bật' : 'Chưa bật'}\n` +
      'Bấm để xem chi tiết hoặc Kiểm tra lại.';

    slot.innerHTML = `
      <button type="button" class="eh-dock-chip ${popOpen ? 'active' : ''}" id="eh-sg-btn" title="${esc(titleText)}">
        <span class="eh-sign-dot ${agg}"></span>
        <span class="eh-hide-collapsed" style="${agg === 'offline' ? 'color:#dc2626;' : ''}">${textLabel}</span>
      </button>
    `;

    slot.querySelector('#eh-sg-btn')?.addEventListener('click', () => {
      toggleDockPopover('signing', renderPopover, {
        maxWidth: '370px',
        onClose: () => renderSlot(),
      });
      renderSlot();
    });
    notifyDockSlotUpdated('signing');
  };

  const syncLoginAndCheckOnce = () => {
    if (!active) return;
    const logged = isLoggedIn(document, location);
    if (!logged) {
      hasProbedOnceForLogin = false;
      deactivateDockSlot('signing');
      return;
    }

    renderSlot();
    if (!hasProbedOnceForLogin) {
      hasProbedOnceForLogin = true;
      if (initialTimer) clearTimeout(initialTimer);
      initialTimer = setTimeout(() => {
        initialTimer = null;
        void runProbe();
      }, 800);
    }
  };

  return {
    start() {
      if (!isTopFrame()) return;
      active = true;
      config = loadConfig();
      watcher = createDomWatcher(syncLoginAndCheckOnce, { debounceMs: 250 });
      watcher.start();
    },

    stop() {
      active = false;
      hasProbedOnceForLogin = false;
      if (initialTimer) {
        clearTimeout(initialTimer);
        initialTimer = null;
      }
      if (watcher) {
        watcher.stop();
        watcher = null;
      }
      closeDockPopover('signing');
      deactivateDockSlot('signing');
    },
  };
}

  __exports.createSigningStatusFeature = createSigningStatusFeature;
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
const { createCompanyBarFeature } = __require("features/company-bar/index.js");
const { createTaxCodeHelperFeature } = __require("features/tax-code-helper/index.js");
const { createQuickAccessFeature } = __require("features/quick-access/index.js");
const { createSigningStatusFeature } = __require("features/signing-status/index.js");

/**
 * Điểm khởi chạy chính của eTax Helper v2.0:
 * 1. Gắn ngay network-probe tại document-start để không bỏ sót bất kỳ request XHR/HTMX/Fetch nào.
 * 2. Chờ DOMContentLoaded để khởi tạo Menu Tampermonkey (chỉ ở Top-Frame) và bật/tắt độc lập 8 tính năng.
 */

// Bước 1: Gắn cảm biến mạng ngay ở document-start
installNetworkProbe();

function bootstrapUi() {
  const controllers = {
    quickLogin: createQuickLoginFeature(),
    datePresets: createDatePresetsFeature(),
    tableEnhancer: createTableEnhancerFeature(),
    sessionTimer: createSessionTimerFeature(),
    companyBar: createCompanyBarFeature(),
    taxCodeHelper: createTaxCodeHelperFeature(),
    quickAccess: createQuickAccessFeature(),
    signingStatus: createSigningStatusFeature(),
  };

  const activeFlags = {
    quickLogin: false,
    datePresets: false,
    tableEnhancer: false,
    sessionTimer: false,
    companyBar: false,
    taxCodeHelper: false,
    quickAccess: false,
    signingStatus: false,
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

  const refreshMenu = () => {
    if (!isTopFrame()) return;
    registerTampermonkeyMenu({
      onLockVaultNow() {
        lockSessionNow();
        window.alert('Đã khóa danh sách MST & xóa phiên mã PIN. Lần chọn tiếp theo sẽ yêu cầu nhập lại PIN.');
      },
      onSettingsToggled(updated) {
        applySettings(updated);
      },
    });
  };

  refreshMenu();
  applySettings(getSettings());
  onSettingsChange((nextSettings) => {
    applySettings(nextSettings);
    refreshMenu();
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
