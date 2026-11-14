# Bàn giao cho Anti

Ngày: 2026-11-14. Người bàn giao: trợ lý Claude (hết quota). Chủ việc: Huy (thanhhuy3181).

## Đã đẩy lên web (main)
- `a795476`, `c8d47c4`: 135 phông chữ trong mục Phông (kể cả phông có sẵn trên máy, đánh dấu "(máy)"). Phông "(máy)" chỉ hiện đúng trên máy có cài phông đó.
- `9d42b5e`, `07e5da0`: nút Duyệt / Từ chối yêu cầu xin quyền báo lỗi thật từ máy chủ; ô chia sẻ gợi ý người dùng thật (`users_search`), không cho thêm tài khoản không tồn tại.
- Chưa kiểm tra trên web thật: gợi ý người dùng, nút Từ chối, phông mới trên điện thoại.

## Chưa làm / cần làm
1. **Sửa lỗi điện thoại (iPhone):** trang báo "Đã có sự cố" khi zoom file lớn. Đã sửa một phần trong `pdf/index.html` (giới hạn độ phân giải canvas trên thiết bị cảm ứng, chỉ vẽ trang đang hiện và giải phóng trang ngoài màn hình). Chưa thử trên iPhone thật. Thay đổi này nằm trong các commit đã đẩy, cần kiểm tra lại.
2. **Nét bút:** đã làm mềm bằng đường cong, nhưng chưa có đầu/cuối thon dần thật sự.
3. **Phông:** nhóm viết tay và thư pháp hiện chưa đẹp theo ý Huy. Nhóm dẹt cần thêm font condensed. Cần kiểm tra tiếng Việt bằng file font (bảng cmap), không dựa vào danh sách Google CSS (cách kiểm tra đó đã cho kết quả sai).
4. **Yêu cầu 100 font mới, khác loại, đủ tiếng Việt:** chưa xong. Huy muốn danh sách đa dạng: dẹt, béo, viết tay, điện tử, châu Âu, báo chí, hoạt hình.
5. **Menu toàn màn hình:** Huy muốn có nút Menu hiện đủ các nút của từng tab khi ở chế độ toàn màn hình (thanh nổi `fullBar`).
6. **Nút Chia sẻ trong cây thư mục:** hiện đang mở file trước, gây chờ lâu. Nên để hộp thoại chia sẻ nhận doc_id trực tiếp.
7. **File "Bạn là ai.pdf" đôi khi mất nét vẽ:** máy chủ chỉ còn 1 hình chữ nhật. Chưa tìm ra nguyên nhân. Cần tái hiện: vẽ, đợi "Đã lưu", F5.
8. **File "MB CẤP NƯỚC.pdf" đã chuyển cho nguyenvietksme nhưng tài khoản đó thấy trống.** Có thể file chưa được chia sẻ hoặc chuyển quyền sở hữu đúng cách.
9. **Video giới thiệu:** `scratchpad/intro-video.html` là bản nháp hoạt ảnh, không chạy được trong trình xem của trợ lý. Cần mở bằng Chrome và sửa: bàn tay chưa có hình, cảnh chưa chuyển, lớp đa giác không ẩn được.

## Lưu ý khi làm
- `pdf/xuat.js` là file của Anti, không được commit cùng thay đổi khác.
- Các file tạm không commit: `pdf/_tmp-*.pdf`, `pdf/blank-test.pdf`, `scripts/check-*.cjs`, `.codegraph/`, `BAO-CAO-ANTI.md`, `*.bat`, `plan.md`. Xóa file tạm để giải phóng dung lượng trước khi làm việc tiếp.
- Chạy kiểm thử máy chủ: `node scripts/test-pdf-rpc.cjs` (hiện 114/114 đạt).
