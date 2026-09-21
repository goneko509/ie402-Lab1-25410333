const fs = require('fs');
const content = '\n## PHÂN TÍCH LỖI CONSOLE\n- Các lỗi hiển thị `chrome-extension://.../background.js` (path: `/generate`, `/writing/get_template_list`) có mã `403 permission error` là lỗi xuất phát từ một **Tiện ích mở rộng (Extension) của Chrome** mà bạn đang cài đặt (có thể là một tiện ích AI, viết bài, dịch thuật, v.v.).\n- **Những lỗi này hoàn toàn không liên quan đến mã nguồn của ứng dụng Web GIS (admin.js hay server.js)**.\n- Lỗi không nằm ở những dòng log này.\n';
fs.appendFileSync('thaoluan.md', content);
