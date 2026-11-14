const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('pdf/index.html', 'utf8');

// Check markup
assert(html.includes('id="float" data-fullbar="true"'), 'Thanh nổi phải có data-fullbar');
assert(html.includes('id="floatMenuPop"'), 'Markup floatMenuPop phải tồn tại');
assert(html.includes('id="floatMenuTabs"'), 'Markup floatMenuTabs phải tồn tại');
assert(html.includes('id="floatMenuBody"'), 'Markup floatMenuBody phải tồn tại');
assert(html.includes('id="btnCloseFloatMenu"'), 'Nút đóng btnCloseFloatMenu phải tồn tại');

// Check Float Bar buttons: Kéo, chọn ghi chú, tô vùng, viết chữ, callout, đường thẳng, ghi chú, bút, nhỏ, to, thoát, Menu
const expectedTools = ['hand', 'pick', 'rect', 'text', 'callout', 'line', 'note', 'pen', 'zout', 'zin', 'exit', 'menu'];
expectedTools.forEach(t => {
  assert(html.includes(`'${t}'`), `Công cụ ${t} phải có trong FLOAT_BOTTOM_TOOLS`);
});

// Check styling: icon only (no text), bigger icons
assert(html.includes('.float .tool span,.float button span{display:none!important}'), 'Không hiển thị chữ');
assert(html.includes('.float .tool svg.i,.float button svg.i{width:24px!important;height:24px!important'), 'Biểu tượng to lên 24px');
assert(html.includes('.float .tool,.float button{width:42px;height:42px'), 'Kích thước nút vuông gọn 42px');

// Check active tool sync
assert(html.includes('updateFloatActiveTool'), 'Hàm updateFloatActiveTool phải tồn tại');

console.log('PASS: Tất cả 12 nút thanh nổi toàn màn hình & hiển thị icon to KHÔNG chữ đạt 100%!');
