# Tích hợp thuật toán Tách Cung (Arc Splitting) và Khép kín Đa giác

Tính năng này nhằm giải quyết bài toán: Khi người dùng vẽ một Cung (Arc A) gồm nhiều điểm (>= 3 point), và 2 đầu của Arc A chạm vào biên của một đa giác đã có (nằm trên một Arc C hiện hữu), hệ thống sẽ tự động tách Arc C và tạo Đa giác mới.

## User Review Required

> [!IMPORTANT]
> Vui lòng xem xét các bước xử lý dưới đây xem đã đúng với logic Toán học / GIS mà bạn mong muốn chưa trước khi tôi tiến hành code.

## Phân tích Thuật toán đề xuất

Giả sử chúng ta có Arc đang xét là **Arc A** (chứa các điểm `[S, p1, p2, ..., E]`).

1. **Điều kiện lọc**: Lấy các Arc A có từ 3 điểm trở lên (`paths.length >= 3`).
2. **Xác định đường đi**: Tìm xem điểm đầu (S) và điểm cuối (E) của Arc A có nằm trên cùng một **Arc C** (thuộc một Đa giác cũ D) nào đó hay không.
3. **Thực thi nếu thỏa mãn**:
   - Thăng cấp S và E thành **NODE** (nếu chưa phải).
   - Tách **Arc C** thành các đoạn:
     - Đoạn 1: Từ Node Start của C đến S.
     - Đoạn 2 (Đường đi dùng chung): Từ S đến E. Đoạn này được biến thành 1 **ARC mới**.
     - Đoạn 3: Từ E đến Node End của C.
   - **Tạo Polygon mới**: Ghép Arc A và đoạn ARC mới (từ S đến E) thành một Polygon khép kín.
   - **Cập nhật Arc liền kề**: Cập nhật lại `IDNB` (Node đầu) và `IDNE` (Node cuối) cho Đoạn 1 và Đoạn 3 (bây giờ sẽ nhận S và E làm Node đầu/cuối mới).

## Open Questions

> [!WARNING]
> 1. Có phải Arc A do người dùng **mới vẽ ra** (chưa lưu vào DB) hay chức năng này sẽ quyét **toàn bộ csdl** để tìm các Arc đã lưu thỏa mãn điều kiện?
> 2. Việc "Sửa điểm đầu và điểm cuối (2 NODE) của Arc liền kề" có phải chính là việc cắt đôi/cắt ba Arc ban đầu (Arc bị đè lên) thành các Arc nhỏ hơn và gán lại NODE không?

## Kế hoạch Cập nhật Code

- **UI**: Thêm nút `Tách Cung & Tạo Poly` trên giao diện.
- **Client JS (`admin.js`)**: Viết hàm `detectAndSplitArcs()` thực hiện nội suy tọa độ không gian để tìm Arc bị giao cắt.
- **SQL Generation**: Tạo ra kịch bản SQL phức tạp chứa `DELETE` Arc cũ, `INSERT` các Node mới, Arc mới và Polygon mới (sử dụng biến `@ID...`).
