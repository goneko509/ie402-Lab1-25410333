# Tài liệu Đặc tả Kỹ thuật: Module Xây dựng lại ARC và Polygon Cục bộ (Local Topology Rebuild)

**Tên Module:** `rebuildLocalArc.js` / `rebuildLocalPolygon.md`  
**Phạm vi áp dụng:** Xử lý Tô-pô không gian cục bộ theo vùng chọn Lasso  
**Chuẩn CSDL:** Schema `TOPO_` (`TOPO_POINT`, `TOPO_NODE`, `TOPO_ARC`, `TOPO_ARC_POINT`, `TOPO_POLY`, `TOPO_POLY_ARC`)

---

## 1. Mục tiêu và Nguyên tắc Kiến trúc

### 1.1. Mục tiêu
Nâng cấp hệ thống Web GIS cho phép người dùng khoanh vùng bằng công cụ **Lasso** và chỉ thực hiện **Tái lập Mạng lưới Tô-pô (Arc & Polygon) cục bộ** đối với các đối tượng nằm trong hoặc bị cắt qua bởi vùng Lasso, đồng thời **bảo tồn nguyên vẹn 100%** các đối tượng nằm ngoài phạm vi này.

### 1.2. Nguyên tắc Bắt buộc (Non-Negotiable Constraints)
1. **Bảo tồn đối tượng ngoài phạm vi:** Tất cả các Cung (`TOPO_ARC`), Nút (`TOPO_NODE`) và Đa giác (`TOPO_POLY`) nằm hoàn toàn ngoài vùng Lasso phải được giữ nguyên mã định danh (`IDA`, `IDP`, `IDPO`), hình học và các quan hệ trong CSDL.
2. **Kịch bản SQL không phá hủy (Non-Destructive T-SQL):** Tuyệt đối KHÔNG sử dụng `TRUNCATE TABLE` hoặc `DELETE FROM TOPO_ARC` / `DELETE FROM TOPO_POLY` toàn bộ. Chỉ thực hiện xóa và thay thế có điều kiện theo danh sách ID thuộc phạm vi Lasso.
3. **Tính độc lập Module:** Không làm xáo trộn hoặc làm hỏng các module hệ thống đã vận hành ổn định (`apiHandler.js`, `mapInit.js`, `spatialDelete.js`...).

---

## 2. Quy trình Thuật toán 1: Xây dựng lại ARC Cục bộ (`rebuildLocalArc.js`)

### Bước 1: Phân lập Không gian (Spatial Partitioning)
- Khi người dùng vẽ vùng chọn Lasso (`lassoPolygon`), hệ thống quét toàn bộ đối tượng đồ họa trên `GraphicsLayer` bằng `geometryEngine.intersects(lassoPolygon, graphic)`:
  - **`TargetArcIDs`:** Tập hợp các mã Cung nằm hoàn toàn bên trong hoặc bị ranh giới Lasso đâm qua.
  - **`PreservedArcs`:** Tập hợp các Cung nằm hoàn toàn bên ngoài Lasso.
  - **`TargetPolyIDs`:** Tập hợp các Đa giác có ranh giới chứa ít nhất 1 Cung thuộc `TargetArcIDs`.

### Bước 2: Xác định Nút giao và Nút biên (Boundary & Local Nodes)
- Tìm tất cả các giao điểm giữa các Cung thuộc `TargetArcIDs` với nhau bằng `geometryEngine.intersects()`.
- Tìm các giao điểm giữa `TargetArcIDs` với ranh giới vùng Lasso hoặc với `PreservedArcs`.
- Cố định các giao điểm ranh giới làm **Nút biên (Boundary Anchor Nodes)**. Các Nút biên này đóng vai trò điểm kết nối cố định giữa mạng lưới Tô-pô mới tái lập bên trong và mạng lưới cũ bên ngoài.

### Bước 3: Bẻ Cung nguyên tử Cục bộ (Local Atomic Arc Splitting)
- Chỉ thực hiện bẻ gãy các Cung thuộc `TargetArcIDs` dựa trên danh sách Nút mới sinh ra tại Bước 2.
- Tạo tập **`LocalAtomicArcs`**: Mỗi Cung nguyên tử mới chỉ nối trực tiếp giữa đúng 2 Node (`IDNB` và `IDNE`).
- Các Cung thuộc `PreservedArcs` giữ nguyên cấu trúc, điểm uốn trung gian (`TOPO_ARC_POINT`) và không bị thay đổi `IDA`.

### Bước 4: Tái lập Quan hệ Trái/Phải (`IDPOL` / `IDPOR`) Cục bộ
- Cập nhật lại mã Đa giác Trái (`IDPOL`) và Phải (`IDPOR`) cho các `LocalAtomicArcs` mới sinh ra.
- Với các Cung nằm ở ranh giới Lasso, giữ nguyên liên kết `IDPOL`/`IDPOR` hướng ra phía các Đa giác ngoài vùng Lasso.

---

## 3. Quy trình Thuật toán 2: Xây dựng Polygon Cục bộ (`rebuildLocalPolygon.js`)

### Bước 1: Gom Cung bao quanh Cục bộ
- Tập hợp tất cả các Cung nguyên tử mới `LocalAtomicArcs` nằm trong Lasso cùng các đoạn Cung ranh giới biên Lasso.

### Bước 2: Quét Vòng khép kín Nội vùng (Localized Minimal Face Traversal)
- Áp dụng thuật toán tìm mặt phẳng nhỏ nhất theo Quy tắc Bàn tay phải (Right-Hand Rule) **chỉ trên tập Cung thuộc vùng Lasso**.
- Phát hiện tất cả các chuỗi Cung khép kín có diện tích $> 0$ và có ít nhất 3 điểm độc lập.

### Bước 3: Tái tạo Đa giác Cục bộ
- Khởi tạo các bản ghi `TOPO_POLY` mới đại diện cho các vùng khép kín vừa phát hiện bên trong Lasso.
- Cập nhật bảng liên kết `TOPO_POLY_ARC` liên kết mã Đa giác mới với các Cung thành phần trong vùng Lasso.
- Giữ nguyên các bản ghi `TOPO_POLY` và `TOPO_POLY_ARC` của các Đa giác nằm ngoài Lasso.

---

## 4. Kịch bản T-SQL Xuất CSDL Cục bộ (Local T-SQL Exporter)

Kịch bản SQL được đóng gói trong giao dịch an toàn (`BEGIN TRANSACTION ... COMMIT`), chỉ thao tác trên các bản ghi thuộc phạm vi bị tác động:

```sql
BEGIN TRANSACTION;

-- 1. Xóa liên kết Cung - Đa giác CỤC BỘ của các đối tượng bị tác động trong Lasso
DELETE FROM TOPO_POLY_ARC 
WHERE IDPO IN (SELECT IDPO FROM TOPO_POLY WHERE IDPO IN (@TargetPolyIDs))
   OR IDA IN (@TargetArcIDs);

-- 2. Xóa các điểm trung gian của các Cung bị bẻ gãy trong Lasso
DELETE FROM TOPO_ARC_POINT 
WHERE IDA IN (@TargetArcIDs);

-- 3. Xóa các Cung và Đa giác cũ thuộc vùng Lasso để thay thế
DELETE FROM TOPO_POLY 
WHERE IDPO IN (@TargetPolyIDs);

DELETE FROM TOPO_ARC 
WHERE IDA IN (@TargetArcIDs);

-- 4. Chèn các Nút mới (TOPO_NODE) và Điểm (TOPO_POINT) sinh ra trong vùng Lasso
INSERT INTO TOPO_POINT (NAME, LONG, LAT) VALUES ...;
INSERT INTO TOPO_NODE (IDP, NAME, CATEGORY) VALUES ...;

-- 5. Chèn các Cung nguyên tử mới tái lập vào TOPO_ARC và TOPO_ARC_POINT
INSERT INTO TOPO_ARC (IDA, IDNB, IDNE, IDPOL, IDPOR, NAME, TYPE) VALUES ...;
INSERT INTO TOPO_ARC_POINT (IDA, IDP, STT) VALUES ...;

-- 6. Chèn các Đa giác mới tái lập vào TOPO_POLY và TOPO_POLY_ARC
INSERT INTO TOPO_POLY (NAME, LOCATION, IDR) VALUES ...;
INSERT INTO TOPO_POLY_ARC (IDPO, IDA, STT) VALUES ...;

COMMIT;
```

---

## 5. Đồng bộ Giao diện và Trạng thái (`refreshDashboardData`)

1. Sau khi tính toán xong trên Canvas, hệ thống tự động cập nhật lại `AppState.arcs`, `AppState.polygons` và `AppState.nodes`.
2. Gọi hàm `refreshDashboardData()` để tải lại các lớp đồ họa trên `GraphicsLayer` và số lượng hiển thị ở các Tab Sidebar mà không gây giật lag hay làm biến mất các đối tượng ngoài Lasso.
