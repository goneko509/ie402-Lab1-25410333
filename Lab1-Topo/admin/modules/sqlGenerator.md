# Module Sinh mã SQL (sqlGenerator.js)

## 1. Chức năng chính
Module `sqlGenerator.js` chịu trách nhiệm cung cấp các hàm tiện ích để biên dịch tọa độ và thuộc tính của các đối tượng không gian (Điểm, Nút, Cung, Đa giác) thành các câu lệnh SQL (T-SQL) chuẩn xác. Các câu lệnh này được dùng để cập nhật trực tiếp vào cơ sở dữ liệu SQL Server.

Đồng thời, module cũng chứa logic **khử trùng lặp tọa độ (Deduplication)** dựa trên hệ số sai số (`TOLERANCE`), giúp làm sạch dữ liệu hình học trước khi lưu, tránh lỗi Topology (các điểm quá sát nhau).

---

## 2. Các hàm xử lý

### 2.1. `deduplicatePoints(pts)`
- **Mục đích:** Loại bỏ các điểm trùng lặp hoặc quá gần nhau (khoảng cách nhỏ hơn `TOLERANCE`) trong một mảng tọa độ.
- **Đầu vào (`pts`):** Mảng các tọa độ `[longitude, latitude]`.
- **Đầu ra:** Mảng các tọa độ đã được lọc (`unique`).
- **Xử lý:**
  - Duyệt qua từng điểm trong mảng.
  - So sánh điểm hiện tại với điểm cuối cùng đã được đưa vào mảng `unique`.
  - Nếu khoảng cách tuyệt đối theo trục X (Longitude) hoặc Y (Latitude) lớn hơn `TOLERANCE`, điểm đó được chấp nhận.

### 2.2. `getPtSql(pt, ptName, idpVar)`
- **Mục đích:** Sinh mã SQL để chèn một `TOPO_POINT` mới một cách an toàn (tránh trùng lặp trong CSDL) và trả về ID của điểm đó qua biến môi trường SQL.
- **Đầu vào:**
  - `pt`: Mảng tọa độ `[longitude, latitude]`.
  - `ptName`: Tên của điểm (dùng cho trường `NAME`).
  - `idpVar`: Tên biến SQL (ví dụ: `IDP_1`) dùng để lưu trữ `SCOPE_IDENTITY()` hoặc ID tìm được.
- **Đầu ra:** Chuỗi lệnh T-SQL (kiểu `string`).
- **Xử lý:**
  - Làm tròn tọa độ tới 6 chữ số thập phân (`toFixed(6)`).
  - Khởi tạo khối `IF NOT EXISTS` kiểm tra xem trong bảng `TOPO_POINT` đã có điểm nào thỏa mãn dung sai `TOLERANCE` chưa.
  - Nếu chưa có, thực hiện `INSERT INTO TOPO_POINT`.
  - Cuối cùng, khai báo biến `DECLARE @{idpVar} INT` và `SELECT TOP 1` gán ID của điểm vào biến đó để dùng lại cho các bảng con (Node, ArcPoint).

### 2.3. `getNodeSql(idpVar, nodeName, category)`
- **Mục đích:** Sinh mã SQL để chèn một `TOPO_NODE` dựa trên ID của `TOPO_POINT` đã có.
- **Đầu vào:**
  - `idpVar`: Tên biến SQL chứa ID của Point (ví dụ: `IDP_1`).
  - `nodeName`: Tên của Nút (ví dụ: `Start_Arc_1`).
  - `category`: Phân loại Nút (ví dụ: `Junction`, `Auto`, `Loop Node`).
- **Đầu ra:** Chuỗi lệnh T-SQL (kiểu `string`).
- **Xử lý:**
  - Khởi tạo khối `IF NOT EXISTS` kiểm tra xem `IDP` này đã được gán làm `TOPO_NODE` hay chưa.
  - Nếu chưa, thực hiện `INSERT INTO TOPO_NODE` sử dụng giá trị từ biến `@idpVar`.

---

## 3. Dữ liệu tham chiếu
- **`TOLERANCE`**: Hằng số quy định sai số tọa độ (thường là `0.000001` độ, tương đương ~11cm thực tế), được import từ `config.js`.

---

## 4. Mối liên hệ với các Module khác
- **Đầu vào từ `uiEvents.js` & `spatialRebuildArc.js`**: Nhận các mảng tọa độ hình học do người dùng vẽ trên bản đồ hoặc do hệ thống tính toán (để xây dựng Topology).
- **Đầu ra cung cấp cho `AppState.sqlScriptLines`**: Các chuỗi T-SQL này được đẩy vào danh sách mã kịch bản tập trung, trước khi gửi lên API qua hàm `executeSQLScript()` để thực thi dưới DB.
