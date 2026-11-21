# Quy trình Tiếp nhận Báo lỗi, Vá lỗi & Phát hành Nội bộ (eTax Helper)

Tài liệu này dành cho người phụ trách kỹ thuật nội bộ khi duy trì **eTax Helper** cho đội ngũ kế toán (>10 người) trên `dichvucong.gdt.gov.vn` và `thuedientu.gdt.gov.vn`.

---

## 1. Quy trình báo lỗi dành cho kế toán

Khi phát hiện một màn hình bị lỗi (thường xảy ra khi Tổng cục Thuế thay đổi giao diện), kế toán thực hiện 2 bước:

1. **Xử lý tạm thời (không gián đoạn công việc):**
   - Bấm biểu tượng **Tampermonkey** → bấm tắt tạm đúng **1 tính năng đang bị ảnh hưởng** (3 tính năng còn lại vẫn chạy bình thường).
2. **Gửi báo lỗi theo mẫu ngắn gọn vào nhóm nội bộ:**
   - **Màn hình gặp lỗi:** *(VD: Tra cứu hồ sơ / Tra cứu giấy nộp tiền / Trang đăng nhập)*
   - **Đường link (URL) trên thanh địa chỉ:** *(copy trực tiếp)*
   - **Tính năng bị ảnh hưởng:** *(1. Chọn MST / 2. Chọn ngày / 3. Bảng kết quả / 4. Đồng hồ phiên)*
   - **Mô tả ngắn + Ảnh chụp màn hình** *(che MST/số tiền thật nếu cần)*.

---

## 2. Quy trình Vá lỗi & Phát hành bản mới (Hotfix SOP)

### Bước 1: Tái hiện & Vá tập trung
- Hầu hết thay đổi từ cổng thuế chỉ liên quan đến selector DOM → chỉnh sửa tập trung tại **`src/adapters/etax-adapter.js`** (hoặc CSS trong `src/features/table-enhancer/index.js`).
- **Quy tắc bất biến khi phát hành:**
  - **TUYỆT ĐỐI KHÔNG** sửa `@name` và `@namespace` trong `config/userscript-meta.js` (sửa sẽ làm Tampermonkey tách kho lưu trữ mới và nhân viên bị mất quyền đọc danh sách MST cũ!).
  - **TUYỆT ĐỐI KHÔNG** commit bất kỳ file `.csv`, `.xlsx` (ngoài `docs/template-import-mst.xlsx`) hay `.etaxvault.json` chứa dữ liệu công ty thật.

### Bước 2: Tăng phiên bản & Kiểm thử cục bộ
1. Tăng `version` theo SemVer trong cả `package.json` và `config/userscript-meta.js`:
   - `PATCH` (`1.0.0 → 1.0.1`): vá lỗi selector, chỉnh CSS, sửa bug nhỏ.
   - `MINOR` (`1.0.1 → 1.1.0`): thêm tính năng mới (giữ tương thích ngược schema dữ liệu cũ).
2. Chạy lệnh kiểm thử & đóng gói:
   ```bash
   npm run verify
   ```
   Lệnh này tự động chạy toàn bộ Unit Tests (`node --test tests/*.test.js`), build `dist/etax-helper.user.js` + `dist/etax-helper.meta.js` và kiểm tra cú pháp bundle bằng Node VM.

### Bước 3: Phát hành bản mới lên GitHub Pages (`https://gibbs1111.github.io/etax-helper/`)

#### Cách A — Không cần cài Git (Bấm chuột trực tiếp trên web GitHub — Khuyên dùng cho người không chuyên code)
1. Sau khi tăng `version` trong `config/userscript-meta.js` và chạy `npm run verify` *(lệnh này tự cập nhật mới các file trong thư mục `docs/`)*:
2. Mở trình duyệt vào thư mục `docs` trên kho GitHub:  
   **`https://github.com/Gibbs1111/etax-helper/tree/main/docs`**
3. Bấm **Add file → Upload files** → kéo thả 3 file mới từ thư mục `docs/` trên máy vào:
   - `etax-helper.user.js`
   - `etax-helper.meta.js`
   - `index.html`
4. Gõ ghi chú ngắn ở ô **Commit changes** *(VD: `Cap nhat ban va v1.0.1`)* → bấm nút xanh **Commit changes**.
5. Chờ khoảng 30–60 giây để GitHub Pages tự xuất bản bản mới!

#### Cách B — Dành cho người dùng Git CLI (Tự động qua GitHub Actions)
1. Commit thay đổi và tạo tag phiên bản khớp với `version`:
   ```bash
   git add -A
   git commit -m "fix(adapter): cap nhat selector bang ket qua moi"
   git tag v1.0.1
   git push origin main --tags
   ```
2. **GitHub Actions (`.github/workflows/release.yml`)** sẽ tự động chạy kiểm thử, build và tạo **GitHub Release**.

### Bước 4: Thông báo team (nếu cần nhận bản vá ngay lập tức)
- Máy nhân viên sẽ tự động cập nhật trong chu kỳ kiểm tra của Tampermonkey (6 giờ / 1 ngày).
- Trường hợp vá khẩn cấp trong mùa quyết toán, nhắn team thao tác 5 giây:
  **Bấm biểu tượng Tampermonkey → Bảng điều khiển (Dashboard) → Tiện ích (Utilities) → Kiểm tra cập nhật tập lệnh (Check for userscript updates)**.

---

## 3. Bài kiểm tra Bắt buộc trước khi Phổ biến Bản Đầu tiên (Upgrade Drill)

Trước khi gửi link cho >10 kế toán, người phụ trách cần tự diễn tập 1 lần trên máy thử nghiệm:
1. Cài bản `v1.0.0` từ link GitHub Pages.
2. Tạo mã PIN, Import 3 công ty mẫu, tắt thử Tính năng 3, đổi đồng hồ từ `15` sang `20` phút.
3. Đẩy tag `v1.0.1` (chỉ đổi version).
4. Bấm *Check for userscript updates* trong Tampermonkey → xác nhận script nâng lên `1.0.1` và kiểm tra:
   - ✅ Mở khóa bằng mã PIN cũ thành công, đủ 3 công ty mẫu.
   - ✅ Tính năng 3 vẫn giữ trạng thái đang tắt.
   - ✅ Đồng hồ phiên vẫn giữ cấu hình `20` phút.
