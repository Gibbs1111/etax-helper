import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialDateState,
  reduceDateState,
  computeFieldApplication,
  getAvailableMonths,
  formatDateDDMMYYYY,
} from '../src/features/date-presets/date-engine.js';

const NOW_2026 = new Date(2026, 10, 21); // 21/11/2026

test('Chọn Tháng khi chưa chọn Năm → tự gán Năm hiện tại và lấy đầu/cuối tháng', () => {
  let state = createInitialDateState();
  state = reduceDateState(state, { type: 'SET_MONTH', value: 2 }, NOW_2026);
  assert.equal(state.year, 2026);
  assert.equal(state.month, 2);

  const res = computeFieldApplication(state, { mode: 'range', now: NOW_2026 });
  assert.equal(res.fromStr, '01/02/2026');
  assert.equal(res.toStr, '28/02/2026');
});

test('Đổi Năm sang năm nhuận (2024) khi đang chọn Tháng 2 → tự cập nhật 29/02/2024', () => {
  let state = createInitialDateState();
  state = reduceDateState(state, { type: 'SET_MONTH', value: 2 }, NOW_2026);
  state = reduceDateState(state, { type: 'SET_YEAR', value: 2024 }, NOW_2026);

  const res = computeFieldApplication(state, { mode: 'range', now: NOW_2026 });
  assert.equal(res.fromStr, '01/02/2024');
  assert.equal(res.toStr, '29/02/2024');
});

test('Chọn Quý khi chưa chọn Năm → tự gán Năm hiện tại và lấy trọn Quý', () => {
  let state = createInitialDateState();
  state = reduceDateState(state, { type: 'SET_QUARTER', value: 3 }, NOW_2026);
  assert.equal(state.year, 2026);

  const res = computeFieldApplication(state, { mode: 'range', now: NOW_2026 });
  assert.equal(res.fromStr, '01/07/2026');
  assert.equal(res.toStr, '30/09/2026');
});

test('Chỉ chọn Năm (không chọn Quý/Tháng) → lấy trọn năm 01/01 đến 31/12', () => {
  let state = createInitialDateState();
  state = reduceDateState(state, { type: 'SET_YEAR', value: 2025 }, NOW_2026);

  const res = computeFieldApplication(state, { mode: 'range', now: NOW_2026 });
  assert.equal(res.fromStr, '01/01/2025');
  assert.equal(res.toStr, '31/12/2025');
});

test('Chọn Quý trước → ô Tháng chỉ hiển thị đúng 3 tháng của Quý đó; đổi sang Quý khác tự xóa Tháng cũ', () => {
  assert.deepEqual(getAvailableMonths(null), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(getAvailableMonths(1), [1, 2, 3]);
  assert.deepEqual(getAvailableMonths(2), [4, 5, 6]);
  assert.deepEqual(getAvailableMonths(3), [7, 8, 9]);
  assert.deepEqual(getAvailableMonths(4), [10, 11, 12]);

  let state = createInitialDateState();
  state = reduceDateState(state, { type: 'SET_QUARTER', value: 2 }, NOW_2026);
  state = reduceDateState(state, { type: 'SET_MONTH', value: 5 }, NOW_2026);
  let res = computeFieldApplication(state, { mode: 'range', now: NOW_2026 });
  assert.equal(res.fromStr, '01/05/2026');
  assert.equal(res.toStr, '31/05/2026');

  // Đổi sang Quý 4 → tự xóa Tháng 5 cũ, lấy trọn Quý 4
  state = reduceDateState(state, { type: 'SET_QUARTER', value: 4 }, NOW_2026);
  assert.equal(state.month, null);
  res = computeFieldApplication(state, { mode: 'range', now: NOW_2026 });
  assert.equal(res.fromStr, '01/10/2026');
  assert.equal(res.toStr, '31/12/2026');
});

test('Chế độ END_ONLY (chỉ chỉnh Đến ngày): giữ nguyên Từ ngày, lấy ngày cuối của Tháng/Quý chọn nhanh', () => {
  // Giả sử Từ ngày đang là 01/01/2026 → chọn Tháng 5 ở hộp Đến ngày → Đến ngày = 31/05/2026
  let state = createInitialDateState();
  state = reduceDateState(state, { type: 'SET_MONTH', value: 5 }, NOW_2026);

  const res = computeFieldApplication(state, {
    mode: 'end_only',
    existingFromStr: '01/01/2026',
    now: NOW_2026,
  });
  assert.equal(res.shouldUpdateFrom, false);
  assert.equal(res.shouldUpdateTo, true);
  assert.equal(res.fromStr, '01/01/2026');
  assert.equal(res.toStr, '31/05/2026');
  assert.equal(res.isEndBeforeStart, false);

  // Chọn Quý 3 → Đến ngày = 30/09/2026
  state = reduceDateState(createInitialDateState(), { type: 'SET_QUARTER', value: 3 }, NOW_2026);
  const resQ3 = computeFieldApplication(state, {
    mode: 'end_only',
    existingFromStr: '01/01/2026',
    now: NOW_2026,
  });
  assert.equal(resQ3.toStr, '30/09/2026');
  assert.equal(resQ3.isEndBeforeStart, false);

  // Cảnh báo nếu Đến ngày < Từ ngày hiện tại
  state = reduceDateState(createInitialDateState(), { type: 'SET_MONTH', value: 1 }, NOW_2026);
  const resWarn = computeFieldApplication(state, {
    mode: 'end_only',
    existingFromStr: '01/06/2026',
    now: NOW_2026,
  });
  assert.equal(resWarn.toStr, '31/01/2026');
  assert.equal(resWarn.isEndBeforeStart, true);
});

test('Chọn nhanh Preset (Quý trước, Tháng trước, Hôm nay)', () => {
  let state = reduceDateState(createInitialDateState(), { type: 'SET_QUICK_PRESET', value: 'today' }, NOW_2026);
  let res = computeFieldApplication(state, { mode: 'range', now: NOW_2026 });
  assert.equal(res.fromStr, formatDateDDMMYYYY(NOW_2026));
  assert.equal(res.toStr, '21/11/2026');

  state = reduceDateState(createInitialDateState(), { type: 'SET_QUICK_PRESET', value: 'lastQuarter' }, NOW_2026);
  res = computeFieldApplication(state, { mode: 'range', now: NOW_2026 });
  assert.equal(res.fromStr, '01/07/2026');
  assert.equal(res.toStr, '30/09/2026');
});
