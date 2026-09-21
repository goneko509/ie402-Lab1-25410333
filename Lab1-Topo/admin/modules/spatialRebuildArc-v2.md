# Thuật toán Tái lập Tô-pô Mạng lưới Cung và Đa giác Lũy tiến (Incremental Topological Network & Polygon Rebuilding)

**Tệp Module:** `spatialRebuildArc.js` / `spatialRebuildArc-v2.md`  
**Phiên bản:** v2 (Chuẩn SOTA - Incremental Topology & Citation Grounding)  
**Hệ quản trị CSDL:** SQL Server (`25410333_GISDB`) — Schema `TOPO_` (`TOPO_POINT`, `TOPO_NODE`, `TOPO_ARC`, `TOPO_ARC_POINT`, `TOPO_POLY`, `TOPO_POLY_ARC`, `TOPO_REGION`) [44, 46, 74-80]

---

## 1. Tổng quan & Động lực Phát triển Chuẩn SOTA

Trong các hệ thống Thông tin Địa lý (GIS) hiện đại, việc chuyển đổi từ dữ liệu mô hình hình học rời rạc (Spaghetti / Graphics Layer) sang Mô hình Dữ liệu Tô-pô (Topological Model) là yêu cầu cốt lõi nhằm đảm bảo tính toàn vẹn quan hệ không gian, triệt tiêu sự dư thừa tọa độ biên chung và tối ưu hóa hiệu năng truy vấn kề cận (Adjacency Queries) [41, 45, 50].

Phiên bản **v2 Chuẩn SOTA** nâng cấp toàn bộ quy trình tái lập mạng lưới theo cơ chế **Hợp nhất Lũy tiến (Incremental Non-Destructive Topology Rebuilding)** [41, 45]. Thuật toán giải quyết triệt để lỗi xóa trắng CSDL (Destructive Overwrite) bằng cách hợp nhất không gian giữa mạng lưới hiện có (`AppState.arcs`) với hình học mới vẽ trên Canvas, phân tách các Cung bị đâm qua thành các Cung nguyên tử (Atomic Arcs), đồng thời bảo toàn dữ liệu lịch sử [1, 41, 45].

---

## 2. Ràng buộc Mô hình Dữ liệu & Schema CSDL Quan hệ

Hệ thống tuân thủ cấu trúc dữ liệu quan hệ Tô-pô chuẩn được giảng dạy trong chương trình IE402 [7, 44, 46, 74-80]:

```
[TOPO_POINT] (#IDP, NAME, LONG, LAT)
      ▲
      │ (FK IDP)
[TOPO_NODE] (#IDN, IDP, NAME, CATEGORY)
      ▲
      │ (FK IDNB, IDNE)
[TOPO_ARC] (#IDA, IDNB, IDNE, IDPOL, IDPOR, NAME, TYPE) ◄───┐ (FK IDPOL/IDPOR)
      ▲                                                  │
      ├───────────────────────┐                          │
      │ (FK IDA)              │ (FK IDA)                 │
[TOPO_ARC_POINT]        [TOPO_POLY_ARC]                  │
(#IDA, #IDP, STT)       (#IDPO, #IDA, STT)               │
                              │                          │
                              │ (FK IDPO)                │
                        [TOPO_POLY] (#IDPO, NAME, LOCATION, IDR)
                              │
                              │ (FK IDR)
                        [TOPO_REGION] (#IDR, DESCRIPTION)
```

- **`TOPO_POINT`**: Quản lý tọa độ gốc $[x, y]$ của tất cả Nút, Điểm uốn trung gian và Điểm cô lập [44, 46, 75].
- **`TOPO_NODE`**: Chỉ quản lý các điểm đóng vai trò Nút giao (bắt đầu/kết thúc Cung hoặc giao điểm 3 Cung trở lên) [41, 44, 46, 76].
- **`TOPO_ARC`**: Lưu thông tin Cung nguyên tử nối giữa `IDNB` và `IDNE`, tích hợp sẵn hai trường khóa ngoại `IDPOL` (Đa giác bên Trái) và `IDPOR` (Đa giác bên Phải) [46, 77]. Giá trị `NULL` đại diện cho Đa giác ngoại $P_0$ (External Polygon) [41, 77].
- **`TOPO_ARC_POINT`**: Quản lý danh sách điểm uốn khúc trung gian (`Vertex`) nằm giữa 2 Node của Cung [44, 46, 78].
- **`TOPO_POLY_ARC`**: Định nghĩa Đa giác gián tiếp qua chuỗi Cung bao quanh [41, 46, 80].

---

## 3. Quy trình Thuật toán 6 Bước Chuẩn SOTA

### Bước 1: Tập hợp Không gian Lũy tiến (Incremental Spatial Gathering)
- Lấy toàn bộ mảng Cung hiện có từ trạng thái hệ thống (`AppState.arcs`) [1].
- Trích xuất các đường ranh giới từ đối tượng Polygon hoặc Polyline mới vẽ trên Canvas.
- Tạo tập hợp đường bao tổng hợp $L_{all} = L_{existing} \cup L_{new}$ [1, 41].
- *Đảm bảo không xóa trắng hoặc hủy bỏ các ID đối tượng sẵn có* [41, 60].

### Bước 2: Phát hiện Giao điểm & Phân loại Nút (Node Classification)
- Duyệt qua từng cặp đoạn thẳng (segments) bằng thuật toán giải hệ phương trình tuyến tính 2D `getSegmentIntersection` [2].
- Thu thập danh sách các điểm giao cắt $I = \{p_{intersect}\}$ [2, 3].
- **Quy tắc Phân loại Nút nghiêm ngặt (Strict GIS Node Rule):**
  - Một điểm $p$ được nạp vào `TOPO_NODE` khi và chỉ khi:
    1. Là điểm giao cắt của $\ge 3$ Cung ($\text{Degree}(p) \ge 3$) [41].
    2. HOẶC là đầu mút tự do (Dangling Endpoint) của một Cung không khép kín [41].
  - Điểm nối tiếp 2 Cung ($\text{Degree}(p) = 2$) chỉ là điểm uốn trung gian (`Vertex`), lưu trong `TOPO_ARC_POINT` và tuyệt đối **không tạo bản ghi trong `TOPO_NODE`** [41, 46].
- Loại bỏ các điểm trùng lắp dựa trên sai số khoảng cách không gian $\varepsilon = 10^{-6}^\circ$ ($\approx 0.11\text{m}$) [3].

### Bước 3: Nhúng Nút & Bẻ gãy Cung thành Cung Nguyên tử (Atomic Arcs)
- Chiếu các Nút tìm được lên từng Cung ban đầu bằng hàm kiểm tra `pointOnSegment` (dựa trên Tích có hướng = 0 và khoảng cách giới hạn) [3].
- Sắp xếp các Nút trên Cung theo khoảng cách tăng dần từ điểm bắt đầu $S$ [3].
- Bẻ gãy đường dẫn Cung tại các vị trí Nút để tạo thành các **Cung nguyên tử (`Atomic Arcs`)** [4, 41]:
  - Mỗi Cung nguyên tử nối trực tiếp từ `IDNB` đến `IDNE` [4, 44, 46].
  - Giữ lại các điểm uốn khúc nằm giữa 2 Node để lưu vào `TOPO_ARC_POINT` với số thứ tự `STT` [4, 46, 78].

### Bước 4: Duyệt Vòng Khép kín Phẳng & Gán Đa giác Trái/Phải (Planar Cycle Traversal)
- Dựng đồ thị phẳng từ tập hợp Cung nguyên tử và Node [41].
- Áp dụng thuật toán **Bàn tay phải (Right-Hand Rule / Minimal Face Traversal)** để quét các chuỗi Cung khép kín có diện tích $> 0$ [41].
- Tạo các bản ghi Đa giác mới trong `TOPO_POLY` [41, 46].
- **Gán Đa giác Trái / Phải (`IDPOL` / `IDPOR`):**
  - Với mỗi Cung đi từ `IDNB` $\rightarrow$ `IDNE`:
    - `IDPOL`: Mã ID Đa giác nằm ở phía bên Trái hướng đi [46, 77].
    - `IDPOR`: Mã ID Đa giác nằm ở phía bên Phải hướng đi [46, 77].
    - Nếu phía bên không có Đa giác khép kín (không gian tự do / Cung râu ria), gán giá trị `NULL` (Đa giác ngoại $P_0$) [41, 77].
- Cập nhật bảng liên kết `TOPO_POLY_ARC` để biểu diễn mối quan hệ Đa giác - Cung [46, 80].

### Bước 5: Bảo tồn Điểm Cô lập (Isolated Points)
- Quét danh sách các điểm $p \in \text{TOPO\_POINT}$ không thuộc bất kỳ Node hay Arc nào [41, 47, 50].
- Giữ nguyên các điểm này là **Điểm cô lập** trong `TOPO_POINT` và không sinh dữ liệu rác trong `TOPO_NODE` hay `TOPO_ARC` [41, 47, 50].

### Bước 6: Biên dịch T-SQL Giao dịch Lũy tiến (Non-Destructive T-SQL Exporter)
Đóng gói toàn bộ kịch bản cập nhật CSDL trong khối giao dịch an toàn `BEGIN TRANSACTION ... COMMIT` [5, 63, 65]:

```sql
BEGIN TRANSACTION;

-- 1. Cập nhật / Chèn mới các Điểm hình học vào TOPO_POINT
INSERT INTO TOPO_POINT (NAME, LONG, LAT) VALUES ...;

-- 2. Cập nhật / Chèn mới các Nút hợp lệ vào TOPO_NODE
INSERT INTO TOPO_NODE (IDP, NAME, CATEGORY) VALUES ...;

-- 3. Xóa các liên kết Cung-Đa giác cũ bị ảnh hưởng bởi vết cắt mới
DELETE FROM TOPO_POLY_ARC WHERE IDA IN (@ModifiedArcIDs);

-- 4. Cập nhật / Chèn danh sách Cung nguyên tử mới vào TOPO_ARC
INSERT INTO TOPO_ARC (IDA, IDNB, IDNE, IDPOL, IDPOR, NAME, TYPE) VALUES ...;

-- 5. Chèn các điểm uốn khúc trung gian vào TOPO_ARC_POINT
INSERT INTO TOPO_ARC_POINT (IDA, IDP, STT) VALUES ...;

-- 6. Cập nhật / Chèn Đa giác mới vào TOPO_POLY và TOPO_POLY_ARC
INSERT INTO TOPO_POLY (NAME, LOCATION, IDR) VALUES ...;
INSERT INTO TOPO_POLY_ARC (IDPO, IDA, STT) VALUES ...;

COMMIT;
```

---

## 4. Tài liệu Trích dẫn & Nguồn Tham khảo (Source Citations)

Artifact này được tổng hợp và đối chiếu trực tiếp từ các nguồn tài liệu thuộc môn học IE402 - Hệ thống Thông tin Địa lý 3 Chiều:

1. **`# Thuật toán Xây dựng lại mạng lưới ARC`**: Quy trình bẻ gãy đường gấp khúc thành Cung nguyên tử và nhúng Node [1-6].
2. **`GIS_Mang_va_ToPo_IE402.md`**: Nguyên lý bóc tách thực thể 2D, quy tắc phân loại Node, gán Đa giác Trái/Phải `IDPOL`/`IDPOR` và bài toán so sánh hiệu năng bộ nhớ [41-50].
3. **`sql dữ liệu`**: Thiết kế Schema T-SQL chuẩn `25410333_GISDB` cho mô hình Tô-pô trên SQL Server [65-80].
4. **`spatialDelete.md`**: Nguyên tắc Xóa dòng thác (Cascade Delete) và đảm bảo toàn vẹn tham chiếu khóa ngoại [59-64].
5. **`Vi du bieu dien du lieu.pdf`**: Ví dụ tính toán dung lượng và cấu trúc bảng quan hệ CSDL Tô-pô [51-56].
6. **`(8.2020)IE402_He_thong_Thong_tin_Dia_ly_3_Chieu.CDIO.pdf`**: Đề cương chi tiết và chuẩn đầu ra môn học GIS 3D [7-9].
