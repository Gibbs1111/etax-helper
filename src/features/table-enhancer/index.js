import { isDvcOrigin, isEtaxOrigin } from '../../adapters/etax-adapter.js';
import { createDomWatcher } from '../../core/dom-observer.js';

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

export function createTableEnhancerFeature() {
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
