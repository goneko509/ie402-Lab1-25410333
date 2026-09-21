# Tài liệu hướng dẫn sử dụng phân hệ Admin - Mô hình Tô-pô

Phân hệ Admin là một giao diện web tương tác bản đồ (sử dụng ArcGIS JS API) được thiết kế đặc biệt để xây dựng, quản lý và mô phỏng cấu trúc dữ liệu không gian theo **Mô hình Tô-pô (Topology)**. Dưới đây là mô tả chi tiết tất cả các chức năng đã được tích hợp.

## Các chức năng chính trên giao diện bản đồ

### 1. Hiển thị và phân loại đối tượng không gian
Hệ thống tải dữ liệu từ CSDL (thông qua API) và tự động phân rã, hiển thị lên bản đồ và bảng điều khiển (Sidebar) thành các nhóm:
- **Điểm thô (Raw points):** Danh sách toàn bộ tọa độ điểm đang lưu trong hệ thống.
- **Điểm cô lập (Isolated points):** Những điểm không thuộc bất kỳ Cung (Arc) hay Nút (Node) nào. Trên bản đồ hiển thị dạng marker màu đỏ.
- **Nút (Nodes):** Các điểm giao cắt hoặc điểm đầu/cuối của các Cung.
- **Cung (Arcs):** Các đường thẳng/đường gấp khúc nối giữa các Nút.
- **Đa giác (Polygons):** Các vùng khép kín được tạo thành từ các Cung biên. Hệ thống hỗ trợ tra cứu Đa giác bên trái (PolyLeft) và bên phải (PolyRight) của mỗi Cung.
- **Vùng (Regions):** Tập hợp của nhiều Đa giác.

### 2. Công cụ vẽ và chỉnh sửa trực tiếp (Sketch tools)
Sử dụng công cụ ở góc phải màn hình, người dùng có thể thao tác vẽ trực tiếp lên bản đồ:
- **Vẽ điểm (Point):** Tạo Điểm cô lập hoặc Nút mới.
- **Vẽ đường (Polyline):** Tạo Cung mới.
- **Vẽ đa giác (Polygon):** Tạo Đa giác mới.
- **Tính năng Snapping:** Tự động bắt dính vào các đối tượng đã có trên bản đồ để đảm bảo tính chính xác của mạng lưới Tô-pô.
- **Chỉnh sửa tọa độ:** Kéo thả đối tượng để di chuyển hoặc thay đổi hình dáng.
- **Cập nhật thuộc tính:** Nháy đúp (Double-click) vào đối tượng trên bản đồ để mở form cập nhật Tên, Loại/Ghi chú.

## Các chức năng xử lý Tô-pô nâng cao

### 3. Sinh mã SQL tự động và thông minh
Bất kỳ thao tác thêm, sửa, xóa nào trên giao diện đều không lập tức ghi đè vào CSDL. Thay vào đó, hệ thống sẽ **phát sinh mã SQL tương ứng**.
- **Chống trùng lặp tọa độ (Deduplication):** Khi vẽ một đối tượng mới, hệ thống sẽ tự động quét và kiểm tra xem tại tọa độ đó đã tồn tại IDP (Point ID) nào chưa dựa trên mức sai số (Tolerance) `1e-6`. Nếu đã có, hệ thống sẽ tái sử dụng IDP cũ thay vì tạo mới, giúp mô hình kết nối chặt chẽ.
- **Tự động liên kết đa giác khép kín:** Nếu vẽ một đa giác, hệ thống sẽ tự động tạo Cung (với Node bắt đầu trùng Node kết thúc) và liên kết Cung đó với Đa giác mới tạo.

### 4. Dò tìm Polygon (Đa giác tiềm năng)
- Nhấn nút "Dò tìm Polygon", sau đó quét chọn một vùng trên bản đồ.
- Hệ thống sẽ trích xuất tất cả các Cung trong vùng đó, áp dụng **thuật toán tìm chu trình (Cycle Detection)** để dò tìm các vòng khép kín.
- Người dùng có thể xem danh sách các Đa giác tiềm năng và nhấn "Tạo Polygon" để hệ thống tự động sinh cấu trúc Đa giác từ các Cung đó (cập nhật IDPOL, IDPOR cho các Cung liên quan).

### 5. Bộ dựng Tô-pô tự động (Automatic topology builder)
Đây là công cụ lõi mạnh mẽ nhất của hệ thống, cho phép tự động xây dựng lưới Tô-pô từ các đường vẽ tự do:
- **Phát hiện giao cắt (Intersection detection):** Tìm tất cả các điểm giao cắt giữa các đường Line.
- **Bẻ gãy cung (Arc splitting):** Tự động ngắt các đường dài thành các Cung nguyên tử (Atomic Arcs) tại các điểm giao cắt.
- **Xây dựng cấu trúc Half-Edge (DCEL):** Tạo cấu trúc dữ liệu đồ thị có hướng để dò tìm toàn bộ các Face (Bề mặt Đa giác).
- **Tái tạo cấu trúc:** Sinh kịch bản SQL xóa toàn bộ cấu trúc cũ và INSERT lại cấu trúc Tô-pô chuẩn (Node, Arc, Poly) mới một cách hoàn toàn tự động.

### 6. Xóa đối tượng theo vùng không gian (Spatial bounding delete)
- Cho phép người dùng vẽ một hình chữ nhật (Bounding Box) trên bản đồ.
- Chọn loại đối tượng muốn xóa (Điểm, Cung, Đa giác).
- Hệ thống sẽ thống kê số lượng đối tượng nằm trong vùng và sinh mã SQL **Xóa liên đới (Cascade Delete)** an toàn. Ví dụ: Khi xóa một Node, hệ thống sẽ tự động xóa các Cung nối với Node đó, và xóa liên kết của Đa giác liên quan.

## Các chức năng hệ thống

### 7. Xuất và thực thi mã SQL
- **Xuất mã SQL:** Xem toàn bộ kịch bản SQL đã được hệ thống ghi nhận từ các thao tác của người dùng.
- **Chạy trực tiếp vào DB:** Gửi toàn bộ kịch bản SQL qua API Backend (`/api/execute-sql`) để thực thi cập nhật vào SQL Server bằng Transaction an toàn. Nút "Tải lại" giúp cập nhật giao diện sau khi CSDL thay đổi.

---
*Lưu ý: Mã nguồn của phân hệ này đã được tổ chức theo chuẩn Module (chia nhỏ thành `config.js`, `state.js`, `mapInit.js`, `apiHandler.js`, `spatialAutoTopo.js`, v.v.) giúp dễ dàng bảo trì và phát triển thêm tính năng mà không ảnh hưởng đến các thành phần khác.*
