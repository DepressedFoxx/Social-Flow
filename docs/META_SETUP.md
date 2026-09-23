# Kết nối Meta thật cho SocialFlow

## Trạng thái

Code đã có OAuth Meta, chọn Page/Instagram, lưu token mã hóa, ngắt kết nối, đăng ngay và worker đăng theo lịch. Không còn API tạo tài khoản mẫu, không tự seed tài khoản khi đăng ký, không còn publisher mô phỏng trong runtime.

Chưa thể kết nối live khi thiếu Meta App. Đăng bài chữ lên Facebook Page có thể thử trên localhost nếu Meta chấp nhận callback local; đăng ảnh cần HTTPS công khai. Kiểm thử tự động dùng provider giả chỉ trong test; không chứng minh Meta đã duyệt ứng dụng hay đăng thành công vào Page thật.

## 1. Chuẩn bị Meta App

1. Mở https://developers.facebook.com/apps/ và tạo ứng dụng với use case quản lý Facebook Page / Instagram phù hợp.
2. Thiết lập Facebook Login. Nếu dùng Facebook Login for Business, tạo cấu hình cấp **User access token** và điền Configuration ID vào META_LOGIN_CONFIG_ID.
3. Để thử Facebook Page dạng chữ, cấp các quyền pages_show_list, pages_read_engagement, pages_manage_posts. Chỉ khi bật Instagram mới cần instagram_basic và instagram_content_publish. Chỉ dùng quyền cần thiết; không cần mật khẩu Facebook của người dùng.
4. Bạn cần quyền tạo nội dung trên Page. Instagram phải là Professional (Business/Creator) liên kết với Page cho luồng Facebook Login này.
5. Khai báo Valid OAuth Redirect URI trùng tuyệt đối với META_CALLBACK_URL, gồm giao thức, domain và đường dẫn.
6. Ở giai đoạn phát triển, thử bằng người có role trong App và tài sản họ quản lý. Để phục vụ người dùng bên ngoài, hoàn tất App Review/Advanced Access, xác minh doanh nghiệp nếu Meta yêu cầu, cùng chính sách quyền riêng tư và hướng dẫn xóa dữ liệu. Không tự chuyển Live trước khi hoàn tất các yêu cầu của Meta.

Tên và vị trí mục trong Meta Dashboard phụ thuộc use case của App. Không nhập Page ID thủ công để vượt quyền: danh sách được lấy từ /me/accounts và chỉ chọn trong phiên OAuth đã xác thực.

## 2. Thử Facebook Page dạng chữ trên localhost

Bạn vẫn cần Meta App và Page do tài khoản của bạn quản lý. Để thử local, giữ WEB_ORIGIN=http://localhost:3000; đặt META_CALLBACK_URL=http://localhost:4000/api/connections/meta/callback, META_ENABLE_INSTAGRAM=false và để META_PUBLIC_API_ORIGIN trống. Khai báo callback đúng tuyệt đối trong cấu hình Facebook Login của Meta App nếu Dashboard cho phép. Meta có thể giới hạn callback HTTP tùy cấu hình App; nếu bị từ chối, dùng HTTPS tunnel như phần dưới.

Chạy frontend, API và worker; khởi động lại API/worker sau khi sửa .env. Mở /accounts, kết nối Page, tạo bài **không kèm ảnh**, bấm Đăng ngay, kiểm tra bài trên Page thật và mã bài trong lịch sử SocialFlow. Chỉ dùng Page của bạn trong App development mode. Test mã nguồn không thay thế được lần đăng live này.

## 3. HTTPS và triển khai

Dùng một origin, ví dụ https://socialflow.example:

- Reverse proxy /api/* tới NestJS tại 127.0.0.1:4000.
- Các URL còn lại tới Next.js tại 127.0.0.1:3000.
- Bật TLS; không cache OAuth callback hoặc URL ảnh có chữ ký.
- Cùng origin giúp session cookie hoạt động với cả SSR và OAuth callback. Không tách hai domain độc lập khi chưa thiết kế lại cookie.
- API và worker phải cùng database, khóa mã hóa và MEDIA_STORAGE_PATH trên volume bền vững.
- Sao lưu database, media và khóa mã hóa; không thay khóa ngẫu nhiên sau mỗi lần restart. Mất khóa đồng nghĩa phải kết nối lại các tài khoản.
- Đảm bảo reverse proxy không ghi query string chứa OAuth code / chữ ký media vào access log. Không ghi token vào log ứng dụng.

Có thể dùng địa chỉ HTTPS thử nghiệm trong quá trình phát triển, nhưng cần địa chỉ ổn định trước khi đưa sản phẩm cho người dùng.

## 4. Cấu hình

Điền trong apps/api/.env, không đưa giá trị bí mật vào Git hoặc chat:

```dotenv
META_APP_ID=
META_APP_SECRET=
META_ENABLE_INSTAGRAM=false
META_LOGIN_CONFIG_ID=
META_GRAPH_VERSION=v25.0
META_CALLBACK_URL=https://socialflow.example/api/connections/meta/callback
META_PUBLIC_API_ORIGIN=https://socialflow.example
META_TOKEN_ENCRYPTION_KEY=
WEB_ORIGIN=https://socialflow.example
```

META_GRAPH_VERSION là phiên bản được pin, không có nghĩa là phiên bản mới nhất. Kiểm tra phiên bản được App của bạn hỗ trợ trước khi bật kết nối.

Tạo khóa mã hóa một lần bằng npm run meta:key. Script chỉ thêm khóa còn thiếu vào .env backend, không in khóa ra màn hình và không ghi đè khóa đã tồn tại.

Trong apps/web/.env:

```dotenv
NEXT_PUBLIC_API_URL=/api
API_INTERNAL_URL=http://127.0.0.1:4000/api
```

Cấu hình META_PUBLIC_API_ORIGIN là origin, không có /api và không có dấu / cuối. Meta cần tải ảnh qua Internet nên localhost không dùng được để đăng ảnh. Khi chưa có public media, chỉ bài Facebook dạng chữ có thể được gửi.

## 5. Khởi chạy

```sh
npm run db:deploy
npm run build
npm run worker
```

Chạy API và frontend ở các tiến trình riêng theo hướng dẫn README. Worker phải luôn chạy (systemd, Docker restart policy hoặc trình quản lý tiến trình khi triển khai); npm run dev hiện chỉ chạy web và API.

## 6. Kiểm tra live sau khi cấu hình

1. Đăng nhập SocialFlow, mở /accounts, chọn Kết nối Meta.
2. Cấp quyền trong Meta, quay về SocialFlow, chọn đúng Page/Instagram rồi bấm Kết nối.
3. Kiểm tra tên và ID trên thẻ tài khoản đúng với tài sản bạn quản lý.
4. Tạo một bài thử rõ ràng, chọn tài khoản, lưu nháp, xác nhận Đăng ngay.
5. Đợi kết quả worker và kiểm tra bài xuất hiện trực tiếp trên Page/Instagram. Mã bài thật được lưu trong lịch sử.
6. Thử một bài hẹn giờ, đóng trình duyệt và xác minh worker vẫn xử lý.
7. Thử ngắt kết nối: token bị xóa khỏi SocialFlow, lịch và nội dung bài được giữ nguyên; nếu đến hạn khi chưa kết nối lại, bài sẽ báo lỗi. Việc này không xóa bài đã xuất bản trên Meta và không thu hồi quyền của App trong Meta Business Integrations. Người dùng có thể thu hồi quyền tại Meta.
8. Nếu đã ngắt kết nối sau khi lệnh đăng gửi đi, Meta vẫn có thể hoàn tất bài đó.

## Phạm vi xuất bản hiện tại

- Facebook Page: nội dung chữ, hoặc 1–4 ảnh được tải lên dạng chưa xuất bản rồi gắn vào bài feed.
- Instagram: 1–4 ảnh JPEG, một ảnh hoặc carousel. Meta kiểm tra thêm kích thước và tỉ lệ ảnh; ảnh không hợp lệ trả lỗi.
- Chưa triển khai video, Reels, Stories, đăng vào Facebook cá nhân hoặc Instagram consumer.
- Token lỗi/hết hạn yêu cầu kết nối lại; hệ thống không giả vờ đăng thành công.
- Worker ghi mã bài do Meta trả về. Không retry tự động một lần đăng chưa rõ kết quả: người dùng phải kiểm tra tài khoản và xác nhận bài chưa có trước khi được thử lại.
- Lease xử lý 10 phút; ảnh có URL ký số hạn 1 giờ, chỉ truy cập được khi thuộc bài của attempt tương ứng.
- Tài khoản mẫu cũ bị loại khỏi danh sách kết nối và worker, lịch và nội dung cũ giữ nguyên. Mở bài cũ, hủy lịch nếu cần, kết nối rồi chọn tài khoản thật trước khi đăng.
- Chưa triển khai webhook deauthorization/data-deletion của Meta. Trước khi phát hành công khai, cần hoàn thiện quy trình xóa dữ liệu theo chính sách sản phẩm và cấu hình URL theo yêu cầu App Review.

## Tài liệu chính thức

- [Meta — Facebook API collection](https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api)
- [Meta — Instagram API with Facebook Login](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api)
- [Facebook Login for Business](https://developers.facebook.com/docs/facebook-login/facebook-login-for-business/)
- [Pages posts](https://developers.facebook.com/docs/pages-api/posts/)
- [Instagram content publishing](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/content-publishing/)
