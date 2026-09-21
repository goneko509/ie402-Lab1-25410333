# 🗺️ WebGIS Lab 1: Topological Model Implementation

**Thông tin bài tập:**
- **Môn học:** Hệ thống thông tin địa lý 3 chiều (IE402)
- **Giảng viên hướng dẫn:** Phan Thanh Vũ
- **Sinh viên thực hiện (MSSV):** 25410333
- **Nhiệm vụ:** Bài Lab 1 - Triển khai và áp dụng mô hình Tô-pô (Topological Model)


Dự án WebGIS mô phỏng 2D thực hành hệ thống thông tin địa lý, tập trung vào việc áp dụng và triển khai **mô hình Tô-pô (Topological Model)**. Dự án kết xuất dữ liệu không gian trực quan từ cơ sở dữ liệu quan hệ, giúp triệt tiêu dư thừa tọa độ và đảm bảo tính toàn vẹn hình học.

## 📂 Cấu trúc thư mục dự án

- 📁 **db/**: Thư mục chứa cấu hình và script CSDL
  - 📄 `dbconfig.json`: File cấu hình kết nối CSDL chung (chứa thông tin user, pass, server, port)
  - 📄 `topo_db.sql`: Script chứa dữ liệu mẫu của mô hình Tô-pô
  - 📄 `topo_db_creator.sql`: Script tạo bảng và các cấu trúc quan hệ Tô-pô
- 📁 **Lab1-Topo/**: Thư mục chính của dự án WebGIS
  - 📄 `server.js`: Mã nguồn Backend (Node.js/Express REST API)
  - 📄 `index.html`: Mã nguồn Frontend (HTML/JS/Bootstrap/ArcGIS)
  - 📄 `package.json`: Cấu hình project Node.js và các dependencies
  - 📄 `README.md`: Tài liệu mô tả dự án


## 🏗️ Kiến trúc hệ thống
Hệ thống được thiết kế theo mô hình **Client - Server** 3 lớp:
1. **Lớp Data (Database):** Lưu trữ dữ liệu cấu trúc không gian Tô-pô (Point, Node, Arc, Polygon, Region) bằng **MS SQL Server**.
2. **Lớp Backend (Server):** Xây dựng bằng **Node.js** và **Express.js**, đóng vai trò là RESTful API kết nối với CSDL qua thư viện `mssql` / `msnodesqlv8`.
3. **Lớp Frontend (Client):** Sử dụng **HTML/CSS/JS thuần**, kết hợp **Bootstrap 5** cho giao diện tương tác và **ArcGIS Maps SDK for JavaScript 4.26** để kết xuất bản đồ 2D.

## 🚀 Công nghệ sử dụng
- **Backend:** Node.js, Express.js, cors
- **Database:** Microsoft SQL Server
- **Frontend:** ArcGIS JS API 4.26, Bootstrap 5
- **Cấu hình:** File `dbconfig.json` quản lý chuỗi kết nối tự động.

## 🗄️ Cấu trúc Cơ sở dữ liệu (Tô-pô)
Hệ thống lưu trữ dữ liệu thông qua 7 bảng chuẩn hóa:
- **TOPO_POINT:** Tọa độ điểm gốc (IDP, LONG, LAT).
- **TOPO_NODE:** Các điểm nút, giao điểm (IDN).
- **TOPO_ARC:** Các cung chứa Node đầu (`IDNB`), Node cuối (`IDNE`) và xác định ranh giới kề nhau (`IDPOL`, `IDPOR`).
- **TOPO_ARC_POINT:** Danh sách điểm tọa độ trung gian định hình cung.
- **TOPO_POLY:** Đa giác khu vực.
- **TOPO_POLY_ARC:** Liên kết cung cấu thành đa giác.
- **TOPO_REGION:** Vùng chứa các đa giác.

## 🔄 Luồng xử lý dữ liệu (Data Flow)
1. **Client gửi yêu cầu:** Vòng lặp HTTP GET `setInterval` gọi API `/api/topo` mỗi 5 giây.
2. **Backend xử lý không gian:** 
   - Quét điểm cô lập.
   - Nối điểm tạo đường (Arcs).
   - Tái tạo đa giác (Polygons) sử dụng thuật toán **Distance Matching** để tự động đảo chiều cung (`reverse()`) tạo thành chuỗi khép kín.
3. **Frontend Rendering:**
   - Dữ liệu JSON được phân tách thành đối tượng `Graphic` (Point, Polyline, Polygon) trong ArcGIS `GraphicsLayer`.
   - Cung cấp tính năng tương tác **Click-to-Zoom** giữa Sidebar Bootstrap và Bản đồ.

