# Hướng dẫn Cài đặt & Sử dụng eTax Helper (Cho Đội ngũ Kế toán)

> **An toàn dữ liệu 100%:** Toàn bộ Mã số thuế, Tài khoản và Mật khẩu công ty chỉ lưu **cục bộ trên trình duyệt máy tính của bạn**, được mã hóa bằng **mã PIN cá nhân (AES-256)** và **tuyệt đối không gửi ra máy chủ bên ngoài**.

---

## Phần 1: Cài đặt lần đầu (Chỉ làm 1 lần — mất khoảng 3 phút)

### Bước 1: Cài tiện ích Tampermonkey
1. Mở trình duyệt **Google Chrome** hoặc **Microsoft Edge**.
2. Truy cập Chrome Web Store, tìm **Tampermonkey** (biểu tượng hình vuông màu đen có 2 chấm tròn trắng) → bấm **Thêm vào Chrome (Add to Chrome)**.
3. *(Quan trọng trên Chrome mới)* Nhấp chuột phải vào biểu tượng Tampermonkey góc trên bên phải → chọn **Quản lý tiện ích (Manage extension)** → bật mục **Cho phép tập lệnh người dùng (Allow User Scripts)** *(hoặc bật **Chế độ dành cho nhà phát triển / Developer Mode** ở góc trên trang `chrome://extensions`)*.

### Bước 2: Cài đặt eTax Helper (1 chạm)
1. Mở trang cài đặt nội bộ của công ty trên Chrome/Edge:
   - Trang hướng dẫn & tải nhanh: **https://gibbs1111.github.io/etax-helper/**
   - Hoặc bấm thẳng link cài Tampermonkey: **https://gibbs1111.github.io/etax-helper/etax-helper.user.js**
2. Màn hình Tampermonkey sẽ tự mở ra → bấm nút **Cài đặt (Install)**.
3. *(Khuyến nghị bật tự động cập nhật nhanh)* Mở **Tampermonkey → Bảng điều khiển (Dashboard) → Cài đặt (Settings)** → mục **Cập nhật tập lệnh (Script Update)** chọn **Mỗi 6 giờ (Every 6 hours)** hoặc **Hằng ngày (Every day)**.
   - Mỗi khi cổng thuế đổi giao diện và công ty ra bản vá mới, máy bạn sẽ **tự động cập nhật mà không hề bị mất danh sách công ty đã lưu**.

---

## Phần 2: Hướng dẫn sử dụng 4 tính năng

### 1. Chọn nhanh MST & Tự điền đăng nhập (`dichvucong.gdt.gov.vn/tthc/login`)
- **Lần đầu tiên:**
  1. Mở màn hình đăng nhập Doanh nghiệp trên `https://dichvucong.gdt.gov.vn/tthc/login`.
  2. Ngay phía trên ô *"Tên đăng nhập"* sẽ xuất hiện hộp **⚡ Chọn nhanh MST (Doanh nghiệp)** → bấm **🔐 Thiết lập PIN & Nhập MST**.
  3. Tạo một **mã PIN cá nhân** *(khuyến nghị ≥ 6 ký tự, dễ nhớ với bạn)*.
- **Nhập danh sách công ty (2 cách):**
  - **Cách A — Nhập tay:** Vào tab **📋 Danh sách** → điền MST, Tên công ty, Tài khoản *(để trống sẽ tự gợi ý `MST-QL`)*, Mật khẩu, Ghi chú → bấm **Thêm công ty**.
  - **Cách B — Import từ Excel / CSV:**
    1. Vào tab **📥 Import Excel / CSV** → bấm **📄 Tải file Excel mẫu (.xlsx)** *(đã định dạng sẵn kiểu Text để không bị mất số `0` đầu của MST)*.
    2. Điền đúng thứ tự 5 cột: `Mã số thuế | Tên công ty | Tài khoản | Mật khẩu | Ghi chú`.
    3. Chọn file vừa điền → kiểm tra bảng **Xem trước (Preview)** → bấm **Lưu vào kho mã hóa**.
    - *Mẹo:* Nếu lỡ Import nhầm file, bấm ngay nút **↩️ Hoàn tác lần Import trước**.
- **Sử dụng hằng ngày:**
  - Đầu ngày mở trình duyệt vào cổng thuế → nhập **mã PIN 1 lần duy nhất** để mở khóa dùng suốt cả phiên trình duyệt.
  - Gõ tên công ty (có dấu hay không dấu đều được) → bấm chọn công ty → script tự điền **Tên đăng nhập** và **Mật khẩu**, đồng thời tự đưa con trỏ vào ô **Captcha** → bạn chỉ cần gõ Captcha và nhấn Enter!
  - Nếu cần xem cột Ghi chú, bấm nút **📝 Ghi chú**; nếu rời máy tính, bấm nút **🔒** để khóa danh sách ngay.

### 2. Chọn nhanh khoảng thời gian (`Từ ngày – Đến ngày`)
- Trên mọi màn hình tra cứu (cả **Tra cứu hồ sơ** lẫn mục **Dịch vụ khác** như *Giấy nộp tiền, Tờ khai, Thông báo CQT*), ngay cạnh cặp ô ngày sẽ có **2 nút nhỏ**:
  - Nút **`📅 Kỳ`** *(cạnh ô Từ ngày)*: Chọn Năm / Quý / Tháng / Chọn nhanh → tự động điền **cả Từ ngày và Đến ngày**.
    - Chọn Tháng hoặc Quý trước khi chọn Năm → tự lấy năm hiện tại.
    - Chọn Quý trước rồi mở ô Tháng → ô Tháng chỉ hiện đúng 3 tháng của Quý đó.
    - Chỉ chọn Năm → lấy `01/01` đến `31/12`.
  - Nút **`📅 Đến`** *(cạnh ô Đến ngày)*: Giao diện chọn giống hệt, nhưng **giữ nguyên ô Từ ngày**, chỉ đổi ô **Đến ngày** thành ngày cuối của tháng/quý/năm bạn chọn *(VD: đã chọn Tháng 1, bấm `📅 Đến` chọn Tháng 5 → ra luôn `01/01 – 31/05`)*.
- Script **chỉ điền ngày**, không tự bấm nút *Tra cứu* để bạn kiểm tra lại trước khi tìm.

### 3. Mở rộng bảng & Cố định tiêu đề
- Tự động giữ gọn khung bộ lọc phía trên và **mở rộng tối đa bảng kết quả bên dưới** trên cả cổng mới (`#table-container`) lẫn iframe eTax (gỡ bỏ giới hạn bảng bị phình `230%`).
- Tự động xuống dòng nội dung dài để hạn chế kéo thanh cuộn ngang và cố định dòng tiêu đề trên cùng khi cuộn dọc.

### 4. Đồng hồ đếm ngược phiên làm việc
- Xuất hiện gọn ở **góc dưới bên trái** màn hình sau khi đăng nhập (mặc định **15 phút**).
- **Tự chỉnh số phút:** Bấm trực tiếp vào đồng hồ → gõ số phút mong muốn (VD `20`) → bấm **Lưu**.
- **Cách hoạt động thông minh:**
  - Chỉ đếm lại từ đầu khi có giao tiếp thật với máy chủ thuế (chuyển trang, bấm Tra cứu...). Không reset ảo khi bạn chỉ rê chuột.
  - Còn dưới **2 phút**: chuyển **đỏ nhấp nháy** cảnh báo nhẹ (không bật cửa sổ làm phiền).
  - Còn dưới **15 giây**: tự động gửi 1 tín hiệu giữ phiên ngầm lên máy chủ để không mất dữ liệu đang nhập dở. *(Nếu máy hoàn toàn không có ai thao tác qua 3 chu kỳ liên tiếp, tính năng giữ phiên sẽ tự tạm dừng để bảo vệ an toàn tài khoản khi bạn rời bàn.)*

---

## Phần 3: Cách tự bật/tắt từng tính năng theo ý thích

1. Khi đang mở trang cổng thuế, bấm vào **biểu tượng Tampermonkey** trên thanh trình duyệt.
2. Dưới mục **eTax Helper Internal**, bạn sẽ thấy 4 dòng tương ứng 4 tính năng:
   - `✅ 1. Chọn nhanh MST & Tự điền [Đang bật]`
   - `✅ 2. Chọn nhanh khoảng thời gian [Đang bật]`
   - `✅ 3. Mở rộng bảng & Cố định tiêu đề [Đang bật]`
   - `✅ 4. Đồng hồ phiên làm việc [Đang bật]`
3. Bấm trực tiếp vào dòng nào để **Bật / Tắt độc lập** riêng tính năng đó ngay lập tức!

---

## Câu hỏi thường gặp (FAQ)
- **Hỏi: Tôi lỡ quên mã PIN thì sao?**  
  *Đáp:* Tại khung đăng nhập bấm **Quên mã PIN?** → chọn **Xóa kho cũ & Tạo mã PIN mới** (xác nhận 2 bước) → tạo PIN mới rồi Import lại file Excel dự phòng của bạn trong 10 giây. *(Khuyến nghị thỉnh thoảng vào tab **Bảo mật & Sao lưu** xuất lưu 1 file dự phòng vào thư mục cá nhân.)*
- **Hỏi: Cập nhật bản mới có bị mất danh sách công ty không?**  
  *Đáp:* **Không.** Danh sách nằm riêng trong bộ nhớ trình duyệt máy bạn và được bảo toàn tuyệt đối qua mọi bản cập nhật.
