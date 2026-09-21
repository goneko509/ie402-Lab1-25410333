# Thuật toán Xây dựng lại Mạng lưới ARC và Mô hình Tô-pô (Rebuild Arc & Polygon Topology)

**File Module:** `spatialRebuildArc.js` / `spatialRebuildArc.md`  
**Chuẩn CSDL:** Schema `TOPO_` (`TOPO_POINT`, `TOPO_NODE`, `TOPO_ARC`, `TOPO_ARC_POINT`, `TOPO_POLY`, `TOPO_POLY_ARC`, `TOPO_REGION`)

---

## 1. Mục đích và Phân tích Thuật toán

Thuật toán thực hiện quá trình phân tích dữ liệu không gian 2D từ các đoạn thẳng/đường gấp khúc rời rạc, tự động phát hiện giao điểm, nâng cấp điểm thành Nút theo chuẩn lý thuyết GIS, bẻ gãy Cung thành các Cung nguyên tử (Atomic Arcs), tự động quét vòng khép kín để tái lập Đa giác (Polygons), gán quan hệ Đa giác Trái/Phải (`IDPOL`/`IDPOR`), bảo tồn các Điểm cô lập và đóng gói toàn bộ quy trình thành kịch bản SQL Server chuẩn.

---

## 2. Dữ liệu Đầu vào (Input)

- **Danh sách đồ họa 2D trên Bản đồ (`graphicsLayer`):**
  - **Polylines (Cung ban đầu):** Mỗi đối tượng chứa mảng tọa độ `path` (`[[long, lat], ...]`), tên định danh `name`, loại `type`.
  - **Points (Điểm hiện có):** Danh sách các điểm hình học `[long, lat]`.
  - **Polygons (Đa giác sẵn có nếu có):** Danh sách các vùng không gian 2D.

---

## 3. Quy trình Xử lý Kỹ thuật (Processing Steps)

### Bước 1: Tìm tất cả các Điểm giao cắt (Intersection Points)
- Duyệt qua từng cặp Cung ban đầu bằng hai vòng lặp lồng nhau.
- Với mỗi cặp Cung $A$ và $B$, duyệt qua từng đoạn thẳng thành phần (segment) đi từ $S$ đến $E$.
- Sử dụng hàm tiện ích toán học 2D `getSegmentIntersection(segA, segB)` để giải phương trình giao điểm.
- Nếu xuất hiện điểm cắt ngang hợp lệ (không trùng mút), lưu vào mảng `intersectionPoints`.

### Bước 2: Lọc và Xác định Danh sách Nút (Nodes) chuẩn Lý thuyết GIS
- **Quy tắc nhận diện Node nghiêm ngặt (theo chuẩn GIS):**
  - Một điểm hình học **CHỈ ĐƯỢC COI LÀ NODE** khi và chỉ khi:
    1. Là điểm giao cắt của **TỪ 3 CUNG TRỞ LÊN** ($\text{Degree} \ge 3$).
    2. HOẶC là **đầu mút tự do (Dangling end)** của một Cung không khép kín.
  - *Lưu ý:* Điểm nối tiếp giữa 2 Cung ($\text{Degree} = 2$) chỉ được coi là điểm trung gian (`Vertex`), **không được chèn vào bảng `TOPO_NODE`**.
- Loại bỏ các điểm lặp lại bằng sai số khoảng cách $\varepsilon = 10^{-6}$ độ.

### Bước 3: Nhúng Nút và Bẻ gãy Cung thành Cung nguyên tử (Atomic Arcs)
- Duyệt qua từng Cung ban đầu, tìm các Nút nằm trên Cung bằng hàm `pointOnSegment`.
- Sắp xếp các Nút nằm trên Cung theo khoảng cách tăng dần tính từ điểm xuất phát $S$.
- Bẻ gãy Cung ban đầu tại vị trí các Nút để sinh ra các **Cung nguyên tử (`atomicArcs`)**:
  - Mỗi Cung nguyên tử chỉ kết nối trực tiếp giữa **Node bắt đầu (`IDNB`)** và **Node kết thúc (`IDNE`)**.
  - Các điểm uốn khúc nằm giữa 2 Node được giữ nguyên làm danh sách điểm trung gian hình học (`TOPO_ARC_POINT`).

### Bước 4: Quét Vòng khép kín & Tái lập Mô hình Tô-pô Đa giác (Planar Cycle Traversal)
- Dựng đồ thị phẳng (Planar Graph) từ danh sách các Cung nguyên tử và Node.
- Áp dụng thuật toán **Tìm mặt phẳng nhỏ nhất (Minimal Face / Right-Hand Rule)** để tìm các chuỗi Cung khép kín có diện tích $> 0$ và có ít nhất 3 điểm độc lập.
- Khởi tạo các Đa giác mới (`TOPO_POLY`).
- **Gán Đa giác Trái/Phải:** Với mỗi Cung nguyên tử theo hướng đi từ `IDNB` $\rightarrow$ `IDNE`:
  - Gán `IDPOL` bằng mã Đa giác nằm ở phía bên Trái.
  - Gán `IDPOR` bằng mã Đa giác nằm ở phía bên Phải.
  - Các Cung tự do / Cung râu ria hướng ra ngoài không gian tự do gán Đa giác tương ứng là `NULL` (hoặc $P_0$).
- Cập nhật bảng liên kết `TOPO_POLY_ARC` biểu diễn mối quan hệ Đa giác - Chuỗi Cung bao quanh.

### Bước 5: Bảo tồn Điểm cô lập (Isolated Points)
- Quét các Điểm không thuộc bất kỳ Nút hay Cung nguyên tử nào (không trùng tọa độ với Node/Vertex).
- Giữ nguyên các điểm này là **Điểm cô lập** trong bảng `TOPO_POINT` và tuyệt đối **không tạo bản ghi trong `TOPO_NODE`**.

### Bước 6: Sinh Kịch bản SQL Server Khôi phục CSDL (`TOPO_` Schema)
Đóng gói toàn bộ câu lệnh trong giao dịch `BEGIN TRANSACTION ... COMMIT`:

```sql
BEGIN TRANSACTION;

-- 1. Xóa sạch dữ liệu cũ để tái lập quan hệ Tô-pô
DELETE FROM TOPO_POLY_ARC;
DELETE FROM TOPO_ARC_POINT;
DELETE FROM TOPO_ARC;
DELETE FROM TOPO_POLY;
DELETE FROM TOPO_NODE;
DELETE FROM TOPO_POINT;

-- 2. Chèn toàn bộ Điểm hình học (Nút, Điểm trung gian, Điểm cô lập) vào TOPO_POINT
INSERT INTO TOPO_POINT (NAME, LONG, LAT) VALUES ...;

-- 3. Chèn các Nút hợp lệ vào TOPO_NODE
INSERT INTO TOPO_NODE (IDP, NAME, CATEGORY) VALUES ...;

-- 4. Chèn danh sách Cung nguyên tử vào TOPO_ARC
INSERT INTO TOPO_ARC (IDA, IDNB, IDNE, IDPOL, IDPOR, NAME, TYPE) VALUES ...;

-- 5. Chèn các điểm trung gian uốn khúc vào TOPO_ARC_POINT
INSERT INTO TOPO_ARC_POINT (IDA, IDP, STT) VALUES ...;

-- 6. Chèn các Đa giác nhận diện được vào TOPO_POLY
INSERT INTO TOPO_POLY (IDPO, NAME, LOCATION, IDR) VALUES ...;

-- 7. Chèn chuỗi Cung khép kín cấu thành từng Đa giác vào TOPO_POLY_ARC
INSERT INTO TOPO_POLY_ARC (IDPO, IDA, STT) VALUES ...;

COMMIT;
```

---

## 4. Dữ liệu Đầu ra (Output)

1. **Cấu trúc dữ liệu trong bộ nhớ (AppState):**
   - Mảng `nodes`: Chứa danh sách các Nút giao hợp lệ.
   - Mảng `atomicArcs`: Chứa danh sách Cung nguyên tử không bị chồng lấp.
   - Mảng `polygons`: Chứa danh sách các Đa giác được nhận diện.
   - Mảng `isolatedPoints`: Chứa danh sách các Điểm cô lập.
2. **Hiển thị trên Dashboard:**
   - Cập nhật các nhãn số lượng Nút (`lblTopoNodes`), Cung (`lblTopoArcs`) và Đa giác (`lblTopoPolys`).
3. **Kịch bản SQL thực thi (`AppState.autoTopoSQL`):**
   - Khối lệnh SQL hoàn chỉnh sẵn sàng đẩy vào CSDL SQL Server khi bấm nút **"Lưu DB"** (`btnConfirmAutoTopo`).
