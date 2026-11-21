import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { USERSCRIPT_META, renderMetadataBlock } from '../config/userscript-meta.js';
import { buildTemplateXlsxBytes } from '../src/features/quick-login/importer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SRC_ROOT = path.join(ROOT, 'src');
const DIST_DIR = path.join(ROOT, 'dist');
const DOCS_DIR = path.join(ROOT, 'docs');

/**
 * Bundler ESM → IIFE thuần Node.js (Zero Dependencies):
 * Biến đổi sạch toàn bộ module `src/` thành 01 file userscript duy nhất `dist/etax-helper.user.js`
 * + `dist/etax-helper.meta.js` + tạo sẵn file Excel mẫu `docs/template-import-mst.xlsx`.
 */

function toModuleId(absPath) {
  return path.relative(SRC_ROOT, absPath).replace(/\\/g, '/');
}

function collectModules(entryAbsPath) {
  const visited = new Set();
  const ordered = [];

  function walk(absPath) {
    const resolved = path.resolve(absPath);
    if (visited.has(resolved)) return;
    visited.add(resolved);

    const code = fs.readFileSync(resolved, 'utf8');
    const importRe = /^import\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"];?/gm;
    let m;
    while ((m = importRe.exec(code)) !== null) {
      const spec = m[1];
      if (!spec.startsWith('.')) continue;
      const target = path.resolve(path.dirname(resolved), spec);
      walk(target);
    }
    ordered.push({ id: toModuleId(resolved), absPath: resolved, code });
  }

  walk(entryAbsPath);
  return ordered;
}

function transformModule(mod) {
  let code = mod.code;

  // 1. Thay thế import { a, b as c } from './rel.js';
  code = code.replace(
    /^import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?/gm,
    (_full, bindings, spec) => {
      const targetId = toModuleId(path.resolve(path.dirname(mod.absPath), spec));
      const destruct = bindings
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const asMatch = s.match(/^(\w+)\s+as\s+(\w+)$/);
          return asMatch ? `${asMatch[1]}: ${asMatch[2]}` : s;
        })
        .join(', ');
      return `const { ${destruct} } = __require(${JSON.stringify(targetId)});`;
    },
  );

  // 2. Thu thập các tên export để gán vào __exports ở cuối module
  const exportedNames = new Set();

  code = code.replace(/^export\s+async\s+function\s+(\w+)/gm, (_m, name) => {
    exportedNames.add(name);
    return `async function ${name}`;
  });

  code = code.replace(/^export\s+function\s+(\w+)/gm, (_m, name) => {
    exportedNames.add(name);
    return `function ${name}`;
  });

  code = code.replace(/^export\s+(const|let|var)\s+(\w+)/gm, (_m, kind, name) => {
    exportedNames.add(name);
    return `${kind} ${name}`;
  });

  code = code.replace(/^export\s*\{([\s\S]*?)\};?/gm, (_m, list) => {
    const assigns = list
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const asMatch = s.match(/^(\w+)\s+as\s+(\w+)$/);
        return asMatch
          ? `__exports.${asMatch[2]} = ${asMatch[1]};`
          : `__exports.${s} = ${s};`;
      });
    return assigns.join('\n');
  });

  // 3. Loại bỏ khối dynamic import('node:zlib') chỉ dùng trong Node test khỏi bản build trình duyệt
  code = code.replace(/await import\(['"]node:zlib['"]\)/g, 'null');

  const exportLines = Array.from(exportedNames)
    .map((n) => `  __exports.${n} = ${n};`)
    .join('\n');

  return `  ${JSON.stringify(mod.id)}: function(__require, __exports) {\n${code}\n${exportLines}\n  }`;
}

function buildLandingHtml(version) {
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>eTax Helper v${version} — Cài đặt nội bộ</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      background: #f1f5f9;
      color: #1e293b;
      margin: 0;
      padding: 32px 16px;
      line-height: 1.55;
    }
    .wrap {
      max-width: 700px;
      margin: 0 auto;
    }
    .card {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 14px;
      padding: 28px;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
    }
    .badge {
      display: inline-block;
      background: #eff8ff;
      color: #006FBC;
      border: 1px solid #bae0ff;
      border-radius: 999px;
      padding: 3px 10px;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 10px;
    }
    h1 {
      color: #006FBC;
      margin: 0 0 8px;
      font-size: 24px;
    }
    .desc {
      color: #475569;
      margin: 0 0 20px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 22px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 11px 18px;
      border-radius: 8px;
      background: #006FBC;
      color: #ffffff;
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
    }
    .btn:hover { background: #005a99; }
    .btn-sec {
      background: #ffffff;
      color: #006FBC;
      border: 1.5px solid #006FBC;
    }
    .btn-sec:hover { background: #eff8ff; }
    .steps {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 14px 18px;
      margin-bottom: 16px;
    }
    .steps h2 {
      font-size: 15px;
      margin: 0 0 8px;
      color: #0f172a;
    }
    .steps ol {
      margin: 0;
      padding-left: 20px;
    }
    .steps li {
      margin-bottom: 6px;
      font-size: 14px;
    }
    .security {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      color: #166534;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 13px;
    }
    code {
      background: #e2e8f0;
      padding: 1px 5px;
      border-radius: 4px;
      font-size: 12.5px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="badge">Phiên bản hiện tại: v${version}</div>
      <h1>eTax Helper Internal</h1>
      <p class="desc">
        Tiện ích Tampermonkey nội bộ hỗ trợ đội ngũ kế toán trên <code>dichvucong.gdt.gov.vn</code> và <code>thuedientu.gdt.gov.vn</code> (Chọn nhanh MST mã hóa PIN, Chọn nhanh khoảng thời gian, Mở rộng bảng &amp; Cố định tiêu đề, Đồng hồ giữ phiên).
      </p>

      <div class="actions">
        <a class="btn" href="./etax-helper.user.js">⚡ Cài đặt / Cập nhật eTax Helper (v${version})</a>
        <a class="btn btn-sec" href="./template-import-mst.xlsx">📄 Tải Excel mẫu 5 cột (.xlsx)</a>
      </div>

      <div class="steps">
        <h2>Hướng dẫn cài đặt nhanh trong 3 bước</h2>
        <ol>
          <li>Cài tiện ích <strong>Tampermonkey</strong> trên Chrome/Edge (nhớ bật <em>Allow User Scripts / Chế độ nhà phát triển</em> trong Quản lý tiện ích của trình duyệt).</li>
          <li>Bấm nút màu xanh <strong>Cài đặt / Cập nhật eTax Helper</strong> ở trên → bấm <strong>Install</strong> trong màn hình Tampermonkey vừa mở.</li>
          <li>Mở <code>https://dichvucong.gdt.gov.vn/tthc/login</code> để tạo mã PIN cục bộ, nhập hoặc Import file Excel 5 cột và sử dụng. Bấm vào biểu tượng Tampermonkey để tự bật/tắt độc lập từng tính năng.</li>
        </ol>
      </div>

      <div class="security">
        <strong>🔐 Cam kết bảo mật cục bộ:</strong> Toàn bộ Mã số thuế, Tài khoản và Mật khẩu chỉ lưu trên trình duyệt từng máy với mã hóa <strong>AES-256-GCM + mã PIN cá nhân</strong>, tuyệt đối không gửi ra bất kỳ máy chủ bên ngoài nào. Các bản cập nhật tự động sau này luôn bảo toàn 100% dữ liệu đã lưu của bạn.
      </div>
    </div>
  </div>
</body>
</html>
`;
}

function build() {
  const entryPath = path.join(SRC_ROOT, 'main.js');
  const modules = collectModules(entryPath);
  const metaBlock = renderMetadataBlock();

  const modulesBody = modules.map(transformModule).join(',\n\n');
  const iifeCode = `(function () {\n  'use strict';\n\n  const __modules = {\n${modulesBody}\n  };\n\n  const __cache = Object.create(null);\n  function __require(id) {\n    if (__cache[id]) return __cache[id].exports;\n    const factory = __modules[id];\n    if (!factory) throw new Error('[eTax Helper] Không tìm thấy module: ' + id);\n    const mod = { exports: {} };\n    __cache[id] = mod;\n    factory(__require, mod.exports);\n    return mod.exports;\n  }\n\n  __require('main.js');\n})();\n`;

  const fullUserscript = `${metaBlock}\n\n${iifeCode}`;

  // Kiểm tra cú pháp JavaScript của bản đóng gói bằng Node VM trước khi xuất file
  new vm.Script(fullUserscript, { filename: 'etax-helper.user.js' });

  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.writeFileSync(path.join(DIST_DIR, 'etax-helper.user.js'), fullUserscript, 'utf8');
  fs.writeFileSync(path.join(DIST_DIR, 'etax-helper.meta.js'), `${metaBlock}\n`, 'utf8');

  // Đồng bộ toàn bộ gói phát hành GitHub Pages vào thư mục docs/ (chỉ cần chọn Branch: main /docs trên GitHub)
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  const templateBytes = buildTemplateXlsxBytes();
  fs.writeFileSync(path.join(DOCS_DIR, 'template-import-mst.xlsx'), templateBytes);
  fs.writeFileSync(path.join(DOCS_DIR, 'etax-helper.user.js'), fullUserscript, 'utf8');
  fs.writeFileSync(path.join(DOCS_DIR, 'etax-helper.meta.js'), `${metaBlock}\n`, 'utf8');
  fs.writeFileSync(path.join(DOCS_DIR, 'index.html'), buildLandingHtml(USERSCRIPT_META.version), 'utf8');
  fs.writeFileSync(path.join(DOCS_DIR, '.nojekyll'), '', 'utf8');

  const kb = (Buffer.byteLength(fullUserscript, 'utf8') / 1024).toFixed(1);
  console.log(`✅ Build thành công (v${USERSCRIPT_META.version})!`);
  console.log(`   - dist/etax-helper.user.js (${kb} KB, ${modules.length} modules)`);
  console.log(`   - dist/etax-helper.meta.js`);
  console.log(`   - docs/index.html + docs/etax-helper.user.js + docs/etax-helper.meta.js`);
  console.log(`   - docs/template-import-mst.xlsx (${templateBytes.length} bytes)`);
}

build();
