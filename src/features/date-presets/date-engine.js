/**
 * Máy trạng thái thuần túy (Pure Functions) cho Tính năng 2 — Chọn nhanh khoảng thời gian.
 * Đáp ứng đầy đủ 2 chế độ:
 *  - 'range': Tự điền cả "Từ ngày" (ngày đầu kỳ) và "Đến ngày" (ngày cuối kỳ).
 *  - 'end_only': Giữ nguyên "Từ ngày" hiện có, chỉ cập nhật "Đến ngày" thành ngày cuối của Năm/Quý/Tháng/Chọn nhanh.
 */

export const QUICK_PRESETS = [
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

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function lastDayOfMonth(year, month1To12) {
  return new Date(year, month1To12, 0).getDate();
}

export function formatDateDDMMYYYY(date) {
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function parseDateDDMMYYYY(str) {
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
export function getAvailableMonths(quarter) {
  if (quarter === 1) return [1, 2, 3];
  if (quarter === 2) return [4, 5, 6];
  if (quarter === 3) return [7, 8, 9];
  if (quarter === 4) return [10, 11, 12];
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
}

export function getQuarterRange(year, quarter) {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = quarter * 3;
  return {
    fromDate: new Date(year, startMonth - 1, 1),
    toDate: new Date(year, endMonth - 1, lastDayOfMonth(year, endMonth)),
  };
}

export function getMonthRange(year, month) {
  return {
    fromDate: new Date(year, month - 1, 1),
    toDate: new Date(year, month - 1, lastDayOfMonth(year, month)),
  };
}

export function getYearRange(year) {
  return {
    fromDate: new Date(year, 0, 1),
    toDate: new Date(year, 11, 31),
  };
}

export function computeQuickPresetRange(presetId, now = new Date()) {
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

export function createInitialDateState() {
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
export function reduceDateState(prevState, action, now = new Date()) {
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
export function resolveDateRange(state, now = new Date()) {
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
export function computeFieldApplication(state, { mode = 'range', existingFromStr = '', now = new Date() } = {}) {
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
