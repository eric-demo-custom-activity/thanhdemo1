# Salesforce Custom Activity - Notification Hub

Tài liệu này là bản tiếng Việt tóm tắt. Nội dung chi tiết, kiến trúc và các bước kiểm thử trực tiếp nằm trong `README.md`.

## 1. Trạng thái hiện tại

- **Kho mã đã sẵn sàng để triển khai** khi lệnh `npm run verify:deployment` và `npm test` đều thành công.
- **Chưa xác minh trên Journey Builder.** Năm cổng kiểm thử trực tiếp (A đến E trong README) chưa được thực hiện.
- **Chưa triển khai công khai.** Repository chưa được đưa lên máy chủ HTTPS nào.

## 2. Chế độ chạy

Chế độ được quyết định bởi `NODE_ENV`, không phải tên miền.

| Cấu hình | Phát triển | Production |
|---|---|---|
| `PUBLIC_BASE_URL` | mặc định `http://localhost:3000` | bắt buộc, dùng `https://`, không dùng localhost |
| `SFMC_REQUIRE_JWT` | mặc định `false` | bắt buộc `true` |
| `SFMC_JWT_SECRET` | tùy chọn | bắt buộc, tối thiểu 32 ký tự |
| `NOTIFICATION_HUB_MODE` | mặc định `simulation` | bắt buộc `http`, không cho phép `simulation` |

Nếu cấu hình không an toàn, ứng dụng không khởi động và liệt kê các lỗi. Secret chỉ được ghi trong log dưới dạng `(set, N characters)`.

## 3. Các endpoint chính

- `GET /config.json`: định nghĩa activity, mọi URL được tạo từ `PUBLIC_BASE_URL`.
- `GET /health`, `GET /ready`: kiểm tra tiến trình và cấu hình.
- `POST /journey/save`, `validate`, `publish`, `stop`, `execute`: trả về 200 khi hợp lệ, 400 khi cấu hình sai, 401 khi JWT không hợp lệ.

Không còn endpoint nào trả về 404 hoặc 501 với các lệnh gọi hợp lệ.

## 4. Thiết kế dữ liệu

- **Runtime `inArguments`:** danh sách phẳng, mỗi phần tử một khóa, ví dụ `address__phone`, `param__customerName`.
- **Binding sự kiện:** dạng có dấu nháy kép `{{Event.<key>."<Field>"}}`, theo mẫu chính thức của Salesforce.
- **Trạng thái trình chỉnh sửa:** lưu tại `metaData.customActivityConfig`, không ghi đè `configurationArguments` ở cấp activity.
- **Schema:** chỉ khai báo các khóa cố định. Các khóa động theo template cần kiểm thử trực tiếp (cổng E).

## 5. Triển khai và cài đặt Installed Package

1. Triển khai dịch vụ lên máy chủ HTTPS công khai và đặt `PUBLIC_BASE_URL`.
2. Kiểm tra `/health`, `/ready` và `/config.json`.
3. Tạo Installed Package, thêm Journey Builder Activity, đặt endpoint là URL gốc công khai.
4. Lưu `SFMC_JWT_SECRET` trong kho bí mật của nền tảng triển khai. Không đưa vào mã nguồn.
5. Thêm activity vào một hành trình thử nghiệm, cấu hình Entry Data Extension.
6. Kiểm tra lưu, xác thực, xuất bản (chỉ trên hành trình thử), thực thi với một contact, dừng hành trình.
7. Đóng và mở lại activity, xác nhận kênh, template và mapping được khôi phục.
8. Kiểm tra log: không được có dữ liệu khách hàng, số điện thoại, token hay secret.

Các bước trên dựa trên tài liệu của Salesforce. Trong quá trình phát triển, không thể tải trang tài liệu chính thức, vì vậy cần kiểm tra lại từng bước với tài liệu hiện hành.

## 6. Giới hạn đã biết

- Chưa có hàng đợi bền vững cho các thông điệp đã chấp nhận.
- Hợp đồng gửi tới Notification Hub chưa được xác minh; đường dẫn gửi là cấu hình bắt buộc, không được đoán.
- Tên sự kiện Postmonger `requestInteraction` và `requestedInteraction` chưa được xác minh trên Journey Builder thật.
- Thư viện Postmonger được khôi phục từ gói npm `postmonger@0.0.16`. Cần đối chiếu checksum với bản gốc trước khi tin tưởng.
- Thư mục `original-ui` được nhắc đến trong yêu cầu không tồn tại trong repository này.

## 7. Lệnh kiểm tra

```bash
npm install
npm test                    # kiểm thử đơn vị và tích hợp
npm run verify:deployment   # kiểm tra sẵn sàng triển khai, trả về mã lỗi khác 0 nếu có lỗi
```
