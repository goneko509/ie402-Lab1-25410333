const fs = require('fs');
const content = '\n## FIX LỖI RUNTIME \n- Đã sửa lỗi gọi hàm `addRowToTable` thiếu tham số `view` ở `uiEvents.js`.\n- Bổ sung event listener cho `btnRefresh`.\n- Thay thế các lời gọi `new bootstrap.Modal()` không an toàn bằng `bootstrap.Modal.getOrCreateInstance()`.\n- Gói khối code khởi tạo trong `admin.js` vào `try-catch` kèm hiển thị `alert()` để bắt bất kỳ lỗi không lường trước nào.\n';
fs.appendFileSync('thaoluan.md', content);
