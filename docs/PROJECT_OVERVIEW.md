> Cập nhật 23/09/2026: luồng kết nối và publisher đã chuyển sang Meta thật; tài khoản mẫu không còn được tạo hoặc xử lý bởi worker. Cần Meta App, HTTPS và kiểm thử live. Xem [META_SETUP.md](META_SETUP.md) để cấu hình và biết giới hạn hiện tại.

# SocialFlow — Tổng quan dự án

Ngày chốt tài liệu: 21/09/2026. Phạm vi: MVP v1.

> Tài liệu này mô tả định hướng sản phẩm và kiến trúc mục tiêu. Trạng thái triển khai được tách riêng bên dưới; các tính năng MVP chưa được coi là hoàn thành chỉ vì đã có thư viện hoặc cấu hình.

## 1. Mục tiêu

SocialFlow là ứng dụng quản lý và lên lịch nội dung dành cho người phụ trách nội dung của một nhóm marketing nhỏ. Dự án portfolio tập trung chứng minh khả năng xây dựng luồng FE hoàn chỉnh: form, upload, URL state, server state, xử lý lỗi, concurrency, responsive và kiểm thử hành vi.

Luồng chính:

**Đăng nhập → tạo bài → upload ảnh → xem trước → lên lịch → worker gửi bài lên Meta → xem kết quả hoặc thử lại.**

MVP có một chủ sở hữu cho mỗi workspace. Bối cảnh sử dụng là nhóm marketing, nhưng cộng tác nhiều thành viên và phân quyền nhóm thuộc giai đoạn sau.

## 2. Phạm vi và ranh giới

| Nội dung  | MVP v1                                                                                    |
| --------- | ----------------------------------------------------------------------------------------- |
| Workspace | Tự tạo một workspace riêng cho mỗi người dùng khi đăng nhập lần đầu                       |
| Kênh      | Facebook Page và Instagram Professional kết nối qua Meta OAuth                            |
| Bài viết  | Một bài thuộc một kênh; văn bản và tối đa 4 ảnh                                           |
| Quản lý   | CRUD nháp, tìm kiếm, lọc, sắp xếp, phân trang phía server                                 |
| Lịch      | Lịch tháng trên desktop, danh sách theo ngày trên mobile, đổi lịch bằng form hoặc kéo thả |
| Xuất bản  | Worker chạy độc lập, publisher Meta Graph API, lưu kết quả và lịch sử                     |
| Dashboard | Thống kê trạng thái và 5 bài sắp đăng từ dữ liệu thật trong database                      |
| Giao diện | Tiếng Việt, hỗ trợ desktop/mobile và bàn phím                                             |

Làm thật: authentication, database, upload, CRUD, scheduling, xử lý job và lưu kết quả.

Kết nối và đăng bài dùng Meta Graph API khi App/HTTPS đã cấu hình. Chưa kiểm thử live do thiếu Meta App và domain; không hiển thị số liệu reach/engagement giả.

Ngoài MVP: TikTok, video, đăng nhiều kênh trong cùng một bài, nhiều thành viên/role, duyệt bài, AI, billing, notification center, dark mode, i18n, autosave và realtime qua WebSocket/SSE.

## 3. Kiến trúc đã chốt

Repository dùng npm workspaces với hai ứng dụng:

| Workspace                       | Trách nhiệm                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `apps/web` — `@social-flow/web` | Next.js: routing, layout, UI, form, query/cache và tương tác người dùng            |
| `apps/api` — `@social-flow/api` | NestJS: authentication, authorization, validation, API nghiệp vụ, Prisma và worker |

Quyết định tách FE/BE thay thế phương án ban đầu dùng Next.js Route Handlers cho nghiệp vụ. Backend NestJS sở hữu authentication; không triển khai Auth.js ở FE song song.

Worker là entrypoint riêng trong workspace backend, chạy cùng code service nhưng là tiến trình riêng với HTTP server. Chưa cần thêm workspace thứ ba hoặc Redis trong MVP.

```mermaid
flowchart TD
  User[Người dùng] --> Web[Next.js / apps/web]
  Web --> Query[TanStack Query]
  Query --> API[NestJS / apps/api]
  API --> Guard[Session và quyền workspace]
  Guard --> Service[Validation và service nghiệp vụ]
  Service --> Prisma[Prisma]
  Prisma --> DB[(PostgreSQL)]
  Web -->|Xin URL upload| API
  Web -->|Upload qua signed URL| Storage[Object storage tương thích S3]
  Worker[Worker độc lập trong apps/api] -->|Nhận bài đến hạn| DB
  Worker --> Publisher[MockPublisher]
  Publisher -->|Kết quả và lịch sử| DB
```

## 4. Tech stack

| Mảng         | Công nghệ                                                | Mục đích                                          |
| ------------ | -------------------------------------------------------- | ------------------------------------------------- |
| FE           | Next.js App Router, React, TypeScript                    | Giao diện và routing                              |
| UI           | Tailwind CSS, cấu trúc shadcn/ui, Radix, Lucide, Sonner  | Component, icon và thông báo                      |
| Font         | Be Vietnam Pro cài local                                 | Hiển thị tiếng Việt                               |
| Server state | TanStack Query                                           | Fetch, cache, mutation, invalidation, polling     |
| Bảng         | TanStack Table                                           | Cấu hình bảng, lọc/sort/phân trang phía server    |
| Form         | React Hook Form, Zod                                     | Dữ liệu form và validation FE                     |
| Calendar     | date-fns, dnd-kit                                        | Xử lý ngày và kéo thả                             |
| BE           | NestJS, ConfigModule, class-validator, class-transformer | Module, cấu hình, DTO và validation server        |
| Auth         | scrypt + google-auth-library; session phía BE            | Email/mật khẩu và Google; session cookie HttpOnly |
| Database     | PostgreSQL, Prisma                                       | Dữ liệu, migration và transaction                 |
| Storage      | Local signed-upload adapter; AWS SDK đã cài              | Local dev hoạt động; S3 production chưa cấu hình  |
| API docs     | Swagger                                                  | Tài liệu endpoint                                 |
| Testing      | Vitest, React Testing Library, Playwright                | Unit/component và E2E                             |
| Tooling      | npm workspaces, ESLint, Prettier, GitHub Actions         | Quản lý dependency và kiểm tra chất lượng         |

Phiên bản cài đặt được xác định bằng `package-lock.json`; không nâng major tự động theo thông báo của CLI. Repo chốt npm 11.19.1 để xử lý dependency overrides đúng. Cách cài và chạy nằm trong [README](../README.md).

### Phân chia state

| Dữ liệu                                 | Nơi quản lý     |
| --------------------------------------- | --------------- |
| Bài viết, dashboard, lịch sử xử lý      | TanStack Query  |
| Search, filter, sort, trang, tháng lịch | URL             |
| Nội dung đang soạn và lỗi trường        | React Hook Form |
| Dialog và tab preview                   | React state     |
| Session và quyền sở hữu                 | Backend         |

Không đưa server state sang Redux/Zustand trong MVP. Optimistic update áp dụng cho đổi lịch, kèm rollback và đồng bộ lại dữ liệu khi lỗi.

## 5. Trạng thái triển khai hiện tại

Đã có bộ khung, đăng nhập email/Google, ownership theo workspace, dashboard nghiệp vụ và module nội dung. Dashboard đọc số lượng bài theo trạng thái và tối đa năm bài sắp đăng từ PostgreSQL, có loading, empty, lỗi/retry và kiểm thử cách ly workspace.

Module nội dung đã có danh sách search/filter/sort/phân trang theo URL, tạo/sửa/xóa bản nháp, preview, cảnh báo thay đổi chưa lưu, idempotency khi tạo và version conflict khi sửa/xóa. API luôn scope theo workspace của session; `404` không tiết lộ tài nguyên workspace khác.

POST-02 và MEDIA-01 đã hỗ trợ tối đa bốn ảnh JPEG/PNG/WebP, giới hạn 5 MB, preview, retry, xóa, sắp thứ tự, xác nhận magic bytes và kiểm tra ownership trước khi gắn vào draft. Local dùng URL upload có token hết hạn và lưu file ngoài Git; adapter S3 production chưa được nối.

Trang `/media` quản lý thư viện và tổng dung lượng theo workspace. Mỗi workspace lưu `planCode` và `mediaQuotaBytes`; gói Personal hiện mặc định 250 MB. API tính cả dung lượng đã dùng và phần giữ chỗ của upload pending, đồng thời khóa workspace khi cấp upload để không vượt quota do request song song. Billing và bảng giá chưa thuộc phạm vi hiện tại.

Đã có kết nối Meta, lịch tháng, lên lịch/đăng ngay, worker gọi Meta và lịch sử attempt. Cần App/HTTPS để kiểm thử live; chưa có kéo thả đổi lịch. Các test hiện có xác minh auth/session, ownership, dashboard, CRUD Post, idempotency, conflict, upload media, bộ lọc URL và chiều rộng desktop/mobile.

## 6. Thứ tự xây dựng

| Giai đoạn     | Kết quả cần có                                                        |
| ------------- | --------------------------------------------------------------------- |
| 1. Identity   | Login/logout, session, workspace thuộc user, hai kênh mẫu             |
| 2. Nội dung   | Danh sách, URL filters, pagination, CRUD nháp, chống ghi đè phiên bản |
| 3. Media      | Upload, xác nhận file, preview và xử lý lỗi                           |
| 4. Scheduling | State machine, lên/hủy lịch, worker, attempt và retry                 |
| 5. Calendar   | Lịch tháng, mobile list, đổi lịch và rollback                         |
| 6. Hoàn thiện | Dashboard, E2E, accessibility, deploy và tài liệu demo                |

Ước lượng tham khảo từ kế hoạch ban đầu: 6–8 tuần với 10–12 giờ/tuần. Đây là ước lượng lập kế hoạch, không phải cam kết tiến độ.

## 7. Bàn giao MVP

- Demo online, repository có hướng dẫn setup, env mẫu và migration.
- FE, API và worker được triển khai với cấu hình môi trường riêng; lựa chọn hosting chưa chốt.
- Video demo 3–5 phút: tạo bài, đổi lịch, lỗi xuất bản, thử lại và mobile.
- Case study giải thích state, concurrency, kiểm thử và giới hạn tích hợp Meta.
- Hoàn thành tiêu chí trong [Yêu cầu MVP](./MVP_REQUIREMENTS.md).
