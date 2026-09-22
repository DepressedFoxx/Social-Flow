# Đăng nhập SocialFlow

## Phạm vi đã triển khai

- Đăng ký email/mật khẩu, đăng nhập, đăng xuất, kiểm tra phiên; email được trim và chuyển chữ thường.
- Mật khẩu 8–128 ký tự, có ít nhất một chữ hoa và một ký tự đặc biệt; hash scrypt với salt riêng (N=131072, r=8, p=1).
- Google OAuth Authorization Code + PKCE, state một lần trong 10 phút, kiểm tra chữ ký ID token, audience và nonce.
- Tạo user, workspace và hai kênh mock Facebook/Instagram trong transaction.
- Dashboard yêu cầu phiên hợp lệ; API lấy workspace từ phiên phía server.
- Không tự gộp tài khoản Google có email trùng tài khoản mật khẩu. Dùng phương thức đăng ký ban đầu.

## Chạy local

FE: http://localhost:3000/login. BE: http://localhost:4000/api.
Chạy `npm run db:up`, `npm run db:deploy`, `npm run dev` từ root.
Đăng ký tại /register để tạo tài khoản; không có mật khẩu mặc định.

## Cấu hình Google

Tạo OAuth client loại Web application trong Google Cloud, cấu hình consent screen và test users nếu ứng dụng ở chế độ testing.
Authorized redirect URI phải là `http://localhost:4000/api/auth/google/callback`.
Điền trong `apps/api/.env`, không gửi secret vào chat hoặc commit:

```dotenv
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:4000/api/auth/google/callback
WEB_ORIGIN=http://localhost:3000
```

Restart BE sau khi thay đổi. Nút Google chỉ bật khi đã có client ID và secret.
Đăng nhập Google xác thực người dùng SocialFlow, không cấp quyền đăng bài Facebook/Instagram.
Tài liệu chính thức: [Google OAuth web server](https://developers.google.com/identity/protocols/oauth2/web-server).

## API và phiên

| Method | Endpoint                  | Mục đích                                           |
| ------ | ------------------------- | -------------------------------------------------- |
| GET    | /api/auth/config          | Trạng thái cấu hình Google                         |
| POST   | /api/auth/register        | Body name, email, password; tạo tài khoản và phiên |
| POST   | /api/auth/login           | Body email, password; tạo phiên                    |
| GET    | /api/auth/google          | Bắt đầu OAuth                                      |
| GET    | /api/auth/google/callback | Callback OAuth                                     |
| GET    | /api/auth/me              | User, workspace, thời hạn, CSRF token              |
| POST   | /api/auth/logout          | Thu hồi phiên hiện tại                             |
| GET    | /api/channels             | Các kênh của workspace đang đăng nhập              |

Cookie `sf_session`: HttpOnly, SameSite=Lax, Secure ở production, thời hạn cố định 7 ngày; database chỉ giữ SHA-256 của token ngẫu nhiên. FE không lưu token vào localStorage.
POST login/register yêu cầu Origin khớp WEB_ORIGIN. Logout yêu cầu thêm header `x-csrf-token` lấy từ /auth/me. FE gửi credentials: include.
OAuth/session response không cache. FE kiểm tra phiên khi focus và mỗi 60 giây; lỗi mạng cho phép thử lại, 401 đưa về đăng nhập. Logout thông báo các tab khác qua BroadcastChannel.
Production cần HTTPS, FE/BE cùng site, hostname cookie phù hợp với SSR; triển khai khác site cần thiết kế lại proxy/cookie. Rate limit hiện tại 10 lần/phút/IP trong một process; nhiều instance cần kho giới hạn dùng chung.

## Kiểm thử

`npm run test:api` build BE, tạo database riêng socialflow_auth_test và chạy HTTP integration với Google provider thay thế trong test. Có thể cấu hình AUTH_TEST_DATABASE_URL (tên DB phải kết thúc _test, tài khoản cần quyền tạo DB nếu chưa có).
`npm run test:e2e` chạy FE riêng ở 3017, API 4018, dùng database test; kiểm tra luồng email trên desktop/mobile, lỗi mạng và hết hạn phiên.
Các test kiểm tra đăng ký, password hash, đăng nhập sai, CSRF, thu hồi/hết hạn phiên, cách ly workspace, OAuth lỗi/hủy/replay và rate limit. Google thật cần credentials và kiểm tra thủ công callback sau khi cấu hình.

Chưa thuộc module này: xác minh email, quên/đổi mật khẩu, liên kết nhiều phương thức đăng nhập, quản lý thiết bị, MFA. Chưa nên mở đăng ký công khai trước khi bổ sung các luồng khôi phục và xác minh email.
