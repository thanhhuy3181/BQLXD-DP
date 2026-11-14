const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('pdf/index.html', 'utf8');

assert(html.includes('id="btnMinFloatProp"'), 'Nút thu nhỏ btnMinFloatProp phải tồn tại trong propFloating');
assert(html.includes('.prop-floating.minimized'), 'CSS class .prop-floating.minimized phải tồn tại');
assert(html.includes('.prop-floating.minimized .prop-box{display:none!important}'), 'CSS phải ẩn prop-box khi minimized');
assert(html.includes('function toggleMinFloatProp'), 'Hàm toggleMinFloatProp phải tồn tại');
assert(html.includes('function openFloatingPropForTool'), 'Hàm openFloatingPropForTool phải tồn tại');
assert(html.includes("openFloatingPropForTool('pen')"), 'act() phải gọi openFloatingPropForTool khi bấm pen');

console.log('PASS: Tất cả kiểm tra bảng thuộc tính nổi & nút thu nhỏ/phóng to đạt 100%!');
