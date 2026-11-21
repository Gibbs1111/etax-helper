import {
  findDateInputPairs,
  setNativeInputValue,
} from '../../adapters/etax-adapter.js';
import { createDomWatcher } from '../../core/dom-observer.js';
import { createDatePopoverController } from './popover-ui.js';

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

export function createDatePresetsFeature() {
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
