const fs = require('fs');
const content = '\n## THEO DÕI LUỒNG KHỞI TẠO (TRACING)\n- Đã gắn các `alert()` vào từng bước khởi tạo của `admin.js` để tìm xem quá trình nạp bị mắc kẹt hay bị chặn ngầm ở vị trí nào.\n';
fs.appendFileSync('thaoluan.md', content);
