const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('pdf/index.html', 'utf8');

// Check markup
assert(html.includes('id="float" data-fullbar="true"'), 'Thanh nổi phải có data-fullbar');
assert(html.includes('id="floatMenuPop"'), 'Markup floatMenuPop phải tồn tại');
assert(html.includes('id="floatMenuTabs"'), 'Markup floatMenuTabs phải tồn tại');
assert(html.includes('id="floatMenuBody"'), 'Markup floatMenuBody phải tồn tại');
assert(html.includes('id="btnCloseFloatMenu"'), 'Nút đóng btnCloseFloatMenu phải tồn tại');

// Check CSS
assert(html.includes('.float-menu-pop'), 'CSS .float-menu-pop phải tồn tại');
assert(html.includes('max-height:calc(100vh - 90px)'), 'CSS max-height phải được khai báo để không bị che');
assert(html.includes('overflow-y:auto'), 'CSS overflow-y:auto phải được khai báo');
assert(html.includes('touch-action:pan-y'), 'CSS touch-action:pan-y phải được khai báo');
assert(html.includes('@media (max-width: 600px)'), 'CSS responsive mobile phải được khai báo');

// Check JS
assert(html.includes('FULL_MENU_TABS = [\'Trang chủ\', \'Ghi chú\', \'Bình luận\', \'Xem\', \'Trang\', \'Bảo vệ\', \'Biểu mẫu\', \'Xuất\']'), 'FULL_MENU_TABS phải đủ 8 tab');
assert(html.includes('function renderFloatMenuTabs'), 'Hàm renderFloatMenuTabs phải tồn tại');
assert(html.includes('function renderFloatMenuBody'), 'Hàm renderFloatMenuBody phải tồn tại');
assert(html.includes('function openFloatMenu'), 'Hàm openFloatMenu phải tồn tại');
assert(html.includes('function closeFloatMenu'), 'Hàm closeFloatMenu phải tồn tại');
assert(html.includes('function toggleFloatMenu'), 'Hàm toggleFloatMenu phải tồn tại');
assert(html.includes('m.id = \'fullMenuBtn\''), 'Nút Menu id fullMenuBtn phải được tạo trong renderFloat');
assert(html.includes('buildRibbonGroup(name, items)'), 'Nút phải lấy từ RIB thông qua buildRibbonGroup');

console.log('PASS: Tất cả các kiểm tra Fullscreen Menu đều ĐẠT 100%!');
