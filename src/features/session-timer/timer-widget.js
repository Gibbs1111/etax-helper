import { createShadowMount } from '../../ui/shadow-host.js';

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

export function createTimerWidget({ onChangeMinutes, onManualResume }) {
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
