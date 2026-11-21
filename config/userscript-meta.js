/**
 * Hợp đồng Header Tampermonkey CỐ ĐỊNH.
 * CẢNH BÁO: Tuyệt đối KHÔNG đổi @name hoặc @namespace sau khi đã phát hành 1.0.0,
 * vì Tampermonkey gắn kho dữ liệu cục bộ (GM_setValue) theo cặp định danh này.
 */
export const USERSCRIPT_META = {
  name: 'eTax Helper Internal',
  namespace: 'https://etax-helper.internal/userscript',
  version: '1.0.0',
  description:
    'Hỗ trợ thao tác nội bộ trên Cổng Dịch vụ công Thuế & eTax (Chọn nhanh MST mã hóa PIN, Chọn ngày 2 cấp, Mở rộng bảng, Đồng hồ giữ phiên)',
  author: 'Internal Accounting Tech Team',
  matches: [
    'https://dichvucong.gdt.gov.vn/*',
    'https://thuedientu.gdt.gov.vn/*',
  ],
  runAt: 'document-start',
  grants: [
    'GM_getValue',
    'GM_setValue',
    'GM_deleteValue',
    'GM_addValueChangeListener',
    'GM_removeValueChangeListener',
    'GM_registerMenuCommand',
    'GM_unregisterMenuCommand',
    'GM_addStyle',
    'unsafeWindow',
  ],
  connect: 'none',
  // Địa chỉ GitHub Pages chính thức của dự án (Phương án A — tự động cập nhật cho toàn đội)
  defaultUpdateBaseUrl: 'https://gibbs1111.github.io/etax-helper',
};

export function renderMetadataBlock(baseUrlOverride) {
  const baseUrl = (baseUrlOverride || process.env.ETAX_UPDATE_BASE_URL || USERSCRIPT_META.defaultUpdateBaseUrl).replace(
    /\/+$/,
    '',
  );
  const lines = [
    '// ==UserScript==',
    `// @name         ${USERSCRIPT_META.name}`,
    `// @namespace    ${USERSCRIPT_META.namespace}`,
    `// @version      ${USERSCRIPT_META.version}`,
    `// @description  ${USERSCRIPT_META.description}`,
    `// @author       ${USERSCRIPT_META.author}`,
    ...USERSCRIPT_META.matches.map((m) => `// @match        ${m}`),
    `// @run-at       ${USERSCRIPT_META.runAt}`,
    ...USERSCRIPT_META.grants.map((g) => `// @grant        ${g}`),
    `// @connect      ${USERSCRIPT_META.connect}`,
    `// @updateURL    ${baseUrl}/etax-helper.meta.js`,
    `// @downloadURL  ${baseUrl}/etax-helper.user.js`,
    '// ==/UserScript==',
  ];
  return lines.join('\n');
}
