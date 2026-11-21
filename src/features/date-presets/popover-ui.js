import { createShadowMount } from '../../ui/shadow-host.js';
import {
  QUICK_PRESETS,
  getAvailableMonths,
  createInitialDateState,
  reduceDateState,
  computeFieldApplication,
} from './date-engine.js';

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

export function createDatePopoverController() {
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
