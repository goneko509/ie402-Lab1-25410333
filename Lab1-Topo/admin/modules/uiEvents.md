# Module Giao diện và Sự kiện (uiEvents.js)

## 1. Chức năng chính
Module `uiEvents.js` chịu trách nhiệm khởi tạo và lắng nghe các sự kiện tương tác từ giao diện người dùng (UI), bao gồm:
- **Export/Import SQL**: Sao lưu (Backup) và Phục hồi (Restore) toàn bộ cơ sở dữ liệu không gian.
- **Lưu thuộc tính**: Cập nhật thông tin và hình học của đối tượng khi người dùng chỉnh sửa trên form.
- **Thực thi SQL**: Đóng gói các tập lệnh SQL gia tăng và gửi lên server để thực thi (Save to DB).

---

## 2. Các chức năng cụ thể

### 2.1. Export và Import CSDL (Backup & Restore)
- **Export SQL (`btnExportSQL`)**:
  - **Xử lý**: Gửi GET request đến `/api/export-sql`.
  - **Đầu ra**: Trình duyệt tải về một file `.sql` chứa mã DDL và DML của toàn bộ cấu trúc DB hiện tại.
- **Import SQL (`fileImportSQL`)**:
  - **Đầu vào**: File `.sql` do người dùng chọn.
  - **Xử lý**: Đọc nội dung file, tách thành mảng các câu lệnh bằng dấu xuống dòng `\n`. Gửi POST request đến `/api/execute-sql` để khôi phục dữ liệu. Xóa bỏ dữ liệu cũ hiện có trên bản đồ.
  - **Đầu ra**: Trạng thái thành công/thất bại và gọi `refreshDashboardData()` để tải lại bản đồ.

### 2.2. Lưu Thuộc tính và Hình học (`btnSaveAttr`)
- **Đầu vào**: Đối tượng đồ họa hiện hành (`AppState.currentNewGraphic`) và dữ liệu từ form (Tên, Phân loại).
- **Xử lý**:
  - **Cập nhật (Update)**: Nếu đồ họa đã có `db_id` (`isFromDB = true`), sinh mã `UPDATE` tương ứng cho `TOPO_POINT`, `TOPO_NODE`, `TOPO_ARC` hoặc `TOPO_POLY`. 
  - **Thêm mới (Insert)**: Nếu đồ họa vẽ mới hoàn toàn, tính toán `db_id` giả lập mới nhất (`AppState.maxIdP`, `AppState.maxIdA`), sinh mã `INSERT INTO` kèm theo `BEGIN TRAN ... COMMIT`.
  - Đặc biệt: Đối với `Polygon` vẽ mới bằng công cụ phát hiện tự động (từ `spatialDetectPoly`), tự động tính toán và lưu `IDPOL`, `IDPOR` cho các cung viền và cập nhật bảng liên kết `TOPO_POLY_ARC`.
- **Đầu ra**: Mảng chuỗi SQL được nạp vào `AppState.sqlScriptLines`. Đóng modal và kích hoạt `executeSQLScript()`.

### 2.3. Thực thi Kịch bản SQL (`window.executeSQLScript`)
- **Mục đích**: Chuyển đổi mã sinh từ Frontend thành Transaction hợp lệ và gửi tới Backend.
- **Xử lý logic**:
  - Ghép mảng `AppState.sqlScriptLines` thành chuỗi.
  - Dùng Biểu thức chính quy (Regex) để trích xuất và đẩy tất cả các lệnh `DECLARE @var INT;` lên đầu Script. (Giải quyết vấn đề scope biến trong T-SQL).
  - Gửi POST request dạng JSON tới `/api/execute-sql`.
- **Đầu ra**: CSDL được cập nhật. Xóa rỗng mảng `sqlScriptLines` và hiển thị Toast thông báo thành công. Màn hình tự động tải lại trạng thái mới nhất.

---

## 3. Quản lý Trạng thái (Dependencies)
- **AppState**: Nơi lưu trữ trạng thái cục bộ (ID lớn nhất, danh sách SQL chờ thực thi, Đồ họa đang vẽ).
- **API Server (`API_BASE`)**: Node.js Backend xử lý các thao tác tương tác trực tiếp tới SQL Server.
