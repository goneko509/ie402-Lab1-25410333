# Tài liệu mô tả module: Chọn vùng xóa SOTA (SOTA Spatial Delete)

**Tệp tin:** `spatialDelete.js` & `sketchEvents.js`

**Chức năng chính:** Cung cấp công cụ chọn vùng không gian tự do (Lasso) để lọc và xóa hàng loạt đối tượng bản đồ theo nguyên tắc Toàn vẹn tham chiếu Tô-pô nâng cao (SOTA Topological Cascade Delete).

---

## 1. Công cụ Chọn vùng tự do (Freehand Lasso Selection)

Khác với các phương pháp cũ (chọn hình chữ nhật), module SOTA sử dụng công cụ Lasso cho phép người dùng khoanh vùng tự do bất kỳ hình thù nào:
- Sử dụng `sketchViewModel.create("polygon", { mode: "freehand" });`.
- **Chuẩn hóa Hình học Lasso SOTA:** 
  - Nét vẽ tự do thường bị lỗi tự giao cắt (self-intersection). Hệ thống sử dụng `geometryEngine.simplify(lassoGeometry)` để xử lý triệt để lỗi này.
  - Chuyển đổi lưới tọa độ Web Mercator về chuẩn tọa độ địa lý WGS84 (`wkid: 4326`) bằng `webMercatorUtils.webMercatorToGeographic`.
- Sử dụng `geometryEngine.intersects` để quét chính xác các Graphic giao cắt với vùng Lasso đã chuẩn hóa và đưa ID của chúng vào `AppState.currentSelectionState`.

---

## 2. Quy trình Xóa Dòng Thác Toàn Vẹn Tô-pô (SOTA TOPOLOGICAL CASCADE DELETE)

Hệ thống sinh ra kịch bản SQL đóng gói trong Transaction (`BEGIN TRANSACTION ... COMMIT`) tuân thủ nghiêm ngặt theo chuỗi liên kết Tô-pô (Point -> Node -> Arc -> Polygon):

### 2.1. Xóa Polygon (Đa giác)
Khi người dùng chọn xóa Đa giác:
- Xóa liên kết trong bảng chuỗi cung `TOPO_POLY_ARC`.
- Cập nhật lại các Cung đang tạo nên Đa giác này (set `IDPOL = NULL` hoặc `IDPOR = NULL`).
- Xóa trực tiếp Đa giác trong `TOPO_POLY`.

### 2.2. Xóa Arc (Cung) - SOTA Rule
Sự đột phá ở SOTA là **khả năng tự dọn dẹp các Đa giác bị hỏng ranh giới**:
- Bất kỳ Đa giác nào sử dụng Cung này làm ranh giới (`IDPOL` hoặc `IDPOR`) đều sẽ bị phá vỡ cấu trúc khép kín.
- Hệ thống tự động truy vết các Đa giác này, xóa sạch liên kết `TOPO_POLY_ARC` của chúng và xóa bỏ hoàn toàn Đa giác hỏng khỏi `TOPO_POLY`.
- Xóa các điểm trung gian của Cung (`TOPO_ARC_POINT`).
- Xóa chính Arc đó (`TOPO_ARC`).

### 2.3. Xóa Node (Nút)
Nút là điểm giao của nhiều Cung. Xóa Nút là một quy trình Cascade diện rộng:
- Truy xuất toàn bộ các Cung có Điểm đầu/Điểm cuối (`IDNB`, `IDNE`) là Nút này.
- **Cascade Đa giác:** Xóa toàn bộ Đa giác bị hỏng cấu trúc do các Cung trên biến mất.
- **Cascade Cung:** Xóa toàn bộ các Cung kết nối với Nút này.
- Xóa bản ghi Nút trong `TOPO_NODE`.
- Dọn dẹp tọa độ gốc: Điểm tọa độ (`TOPO_POINT`) của Nút sẽ bị xóa CHỈ KHI nó không còn được sử dụng bởi bất kỳ Node nào khác hay Arc_Point nào khác.

### 2.4. Xóa Điểm Cô Lập (Isolated Points)
Đơn giản là xóa bản ghi trong `TOPO_POINT` dựa trên `IDP`. Hoàn toàn không phụ thuộc vào cột dư thừa `IS_ISOLATED` ở DB.

---

## 3. Tự Động Kích Hoạt Tái Lập Tô-pô (Auto Topo Rebuild)

Thay vì yêu cầu người dùng copy kịch bản và chạy bằng tay:
- SQL Script được tự động đẩy vào hệ thống thực thi thông qua API.
- Ngay khi nhận được phản hồi thành công (`window.executeSQLScript().then(...)`), hệ thống sẽ:
  1. Gọi `refreshDashboardData()` để đồng bộ hóa bản đồ và lưới dữ liệu thời gian thực.
  2. Kích hoạt trực tiếp module `spatialRebuildArc.js` (nhấp tự động nút "Xây dựng lại ARC"). Thuật toán này sẽ quét lại toàn bộ dữ liệu Cung/Nút còn lại để phục hồi lại các Đa giác Trái/Phải (Left/Right Polygons) mới nhất trên bản đồ.
