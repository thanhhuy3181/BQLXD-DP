# AwM v1

AwM thật ở `/mobile/`, không dùng dữ liệu giả tự động. Bản mẫu cũ được giữ ở `/mobile/prototype.html`. Desktop ở `/` giữ nguyên giao diện.

Trang web tự nhận diện thiết bị trước màn hình đăng nhập: điện thoại vào AwM, máy tính vào AwD. Nhận diện theo thông tin thiết bị/trình duyệt, không dựa riêng vào chiều rộng cửa sổ. Tablet mặc định AwD. Có thể chọn thủ công bằng `?view=mobile` hoặc `?view=desktop`; liên kết mở AwD trong cài đặt AwM dùng override này. Script đồng bộ web cũng giữ router ở đầu trang. Thay đổi này chưa được triển khai online.

## Đã làm

- Google login qua API hiện có; kiểm tra issuer, audience, hạn token và liên kết Google sub. Tài khoản mới chờ duyệt.
- AwM session riêng trong sessionStorage. Drive token chỉ nằm trong bộ nhớ và kiểm tra email tài khoản Drive khớp user đăng nhập.
- Home / Mail / To do / QL / Link / Theo dõi. To do quản lý việc cá nhân; nút cài đặt góc trên phải.
- Quản lý Link: Ánh xạ 2 chiều với Desktop AwD theo Dự án và Dùng chung (__common__). Đăng nhập Google Drive linh hoạt để mở trực tiếp tài liệu hoặc quét đồng bộ toàn bộ link file/thư mục Drive vào hệ thống.
- API AwM kiểm tra Active user, quyền nghiệp vụ và dự án ở server; quyền chưa khai báo bị từ chối.
- Theo dõi đọc snapshot/server state của các module, tìm kiếm không dấu, phân trang 30 dòng, xem mọi trường hồ sơ.
- QL lưu folder riêng theo user + project + menu; Drive online, breadcrumb, phân trang và mở tệp.
- PDF.js 6.4.299: trang PDF, chuyển trang, zoom. SheetJS 0.20.3: XLSX/XLS/CSV đọc trong worker, chọn sheet, 100 dòng/trang, cuộn ngang/dọc. Không tính lại công thức hoặc chạy macro.
- DXF ASCII 2D cơ bản: LINE, LWPOLYLINE thẳng, CIRCLE, ARC; pan/zoom. Thành phần chưa hỗ trợ được báo rõ.
- Mail có trạng thái AD online/offline; API `/api/ad_mail` nhận thư text và heartbeat theo device token riêng. Offline sau 90 giây không trả nội dung Mail. Mỗi user một thiết bị đang ghép nối.
- Không cho nội dung hồ sơ/email chạy HTML/script. Đổi project hoặc rời ứng dụng đóng preview; phản hồi cũ bị bỏ qua.

## Chạy và cấu hình

Từ thư mục `vercel-app`, chạy `node dev-awm.cjs`; URL `http://127.0.0.1:8767/mobile/`. Cần DATABASE_URL (hoặc biến Postgres mà RPC hiện có hỗ trợ), GOOGLE_WEB_CLIENT_ID và OAuth client ID trong `js/runtime_config.js` khớp nhau. Google Console cần cho phép origin thực tế; bật Drive API, cấu hình consent và người thử nghiệm/phê duyệt phạm vi Drive readonly khi cần.

Triển khai chung vào Vercel như AwD. Không chạy script sync desktop để ghi đè nguồn trong quá trình review AwM. Chưa tự push/deploy trong lần tạo này; checkout Vercel đang có thay đổi dữ liệu ngoài phạm vi AwM.

## Kết nối AD

Trong AwM: Cài đặt → Liên kết thiết bị AD, lấy username và device token. AD gửi HTTPS POST `/api/ad_mail`, header `Authorization: Bearer <device_token>`, JSON:

```json
{"username":"<user>","device_name":"AD máy làm việc","items":[{"id":"mailbox:message-id","subject":"Tiêu đề","sender":"người gửi","date":"2026-10-15T08:00:00Z","body":"Nội dung text","project":"Tên dự án"}]}
```

Gửi `items` là snapshot hộp thư (tối đa 1.000 thư, payload 2 MB), không phải lô upsert. Heartbeat mỗi 30 giây có thể bỏ `items` để giữ snapshot cũ. `items: []` xóa snapshot. Token mới thay thế thiết bị cũ, thu hồi xóa dữ liệu Mail. Endpoint có thể dùng cho AwD sau khi nối module Mail AwD.

**Chưa tích hợp connector này vào AD/tray/autostart hoặc Mail AwD.** Không có dữ liệu giả làm AD online. Chưa đồng bộ đính kèm thư qua endpoint này; đọc tệp đính kèm thật cần bổ sung kho tài liệu/Drive mapping có ACL.

## Phần còn phụ thuộc nguồn/dịch vụ

- DWG, DXF có block/Xref/text/layout/3D và MSG cần dịch vụ chuyển đổi/parser; chưa phải viewer CAD/MSG đầy đủ. Có thể xem bản xuất PDF trực tiếp trong AwM.
- Các đường dẫn Z:/C:/UNC trong snapshot chưa phải URL online. QL có mapping folder cá nhân; chi tiết có thể mở link Drive có sẵn hoặc đi đến QL để chọn tài liệu. Chưa tự động ánh xạ hàng nghìn đường dẫn desktop sang file Drive ID.
- EML hiện đọc dạng text nguồn, chưa parser MIME đầy đủ.
- Đăng nhập Google, Drive và DB thật chưa được kiểm thử bằng tài khoản sống trong phiên này. Không dùng kết quả mock để xác nhận tích hợp thật.

## Xác minh

`node --test ../tests/test_awm_access.cjs`: 8 kiểm thử quyền, cô lập user, điều kiện Mail và chống đi vòng qua API workspace cũ.

`node ../scripts/check_awm_browser.cjs <node_modules chứa playwright>`: server QA dùng fixture riêng; kiểm tra gate, tab, To do, offline Mail, escape nội dung, PDF/XLSX/DXF và khổ 360/390/430. Screenshot `preview-live-home.png` dùng user QA, không phải tài khoản thật.

Các thư viện đọc tệp được lưu tại vendor và kèm giấy phép, không tải code CDN lúc mở tài liệu. Google SDK cần mạng.
