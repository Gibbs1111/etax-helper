import { createShadowMount, triggerFileDownload } from '../../ui/shadow-host.js';
import { normalizeVietnamese } from '../../adapters/etax-adapter.js';
import {
  hasVault,
  hasImportBackup,
  getRawVaultRecord,
  setupNewVault,
  saveCompanies,
  rollbackPreviousImport,
  changeVaultPin,
  importEncryptedVaultBackup,
  resetVaultCompletely,
} from './company-store.js';
import {
  parseAndAnalyzeFile,
  mergeCompanies,
  buildTemplateXlsxBytes,
  exportCompaniesToXlsxBytes,
  exportCompaniesToCsvBytes,
  normalizeAccount,
} from './importer.js';

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

export function openCompanyManagerModal({
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
