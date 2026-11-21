import {
  isLoginPage,
  findLoginFormContext,
  setNativeInputValue,
  normalizeVietnamese,
} from '../../adapters/etax-adapter.js';
import { createDomWatcher } from '../../core/dom-observer.js';
import { createShadowMount } from '../../ui/shadow-host.js';
import {
  tryLoadUnlockedCompanies,
  unlockVaultWithPin,
} from './company-store.js';
import { lockSessionNow, onSessionStateChange } from '../../security/session-unlock.js';
import { openCompanyManagerModal } from './manager-modal.js';

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

export function createQuickLoginFeature() {
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
