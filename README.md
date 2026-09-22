# SocialFlow

Monorepo gồm hai npm workspace độc lập: **Frontend Next.js** và **Backend NestJS**.

## Tài liệu dự án

- [Thiết lập giao diện](docs/DESIGN_SYSTEM.md): token màu/chữ, kích thước và variant dùng chung.

- [Tổng quan dự án](docs/PROJECT_OVERVIEW.md): mục tiêu, phạm vi, kiến trúc FE/BE, tech stack và lộ trình.
- [Yêu cầu MVP](docs/MVP_REQUIREMENTS.md): màn hình, flow, quy tắc nghiệp vụ, API, dữ liệu và checklist nghiệm thu.

## Yêu cầu

- Node.js 24.14 trở lên trong nhánh 24, npm 11.19.1 trở lên (bản npm 11.11 trên máy có lỗi xử lý overrides trong workspaces).
- Docker Desktop đang chạy nếu cần PostgreSQL local. Không cần database để mở trang base và health liveness.

## Chạy local

Chạy tại root repository (PowerShell trên Windows dùng npm.cmd thay cho npm nếu shim gặp lỗi):

```sh
npx --yes npm@11.19.1 ci
npm run env:setup
npm run db:up
npm run db:deploy
npm run dev
```

Khi thay đổi schema và cần tạo migration mới: `npm run db:migrate --workspace=@social-flow/api -- --name init`.
`env:setup` không ghi đè file .env đã tồn tại. Docker lưu dữ liệu trong named volume; `db:down` giữ nguyên dữ liệu.

- Web: http://localhost:3000
- API liveness: http://localhost:4000/api/health (chỉ kiểm tra server)
- API readiness: http://localhost:4000/api/health/ready (kiểm tra PostgreSQL, trả 503 khi không kết nối được)
- Swagger: http://localhost:4000/api/docs (chỉ ngoài production)

## Cấu trúc

```text
apps/
  web/                 # Next.js, Tailwind, TanStack Query/Table, RHF, Zod
    src/app/           # Routes và layout
    src/components/ui/ # Component theo cấu trúc shadcn/ui
    src/features/      # UI theo tính năng
    src/lib/           # HTTP client và utilities
  api/                 # NestJS, Prisma, PostgreSQL
    src/config/        # Validate biến môi trường
    src/database/      # Prisma service
    src/modules/       # Module nghiệp vụ
    prisma/            # Schema và migrations
scripts/               # Công cụ chung
tests/e2e/             # Test browser FE → BE
```

Mở `social-flow.code-workspace` trong VS Code để thấy Frontend/Backend riêng. Cài dependency từ root, dùng một package-lock.json. node_modules có thể được npm hoist lên root; dependency vẫn được khai báo riêng cho từng app.

## Lệnh thường dùng

| Lệnh                            | Chức năng                                       |
| ------------------------------- | ----------------------------------------------- |
| npm run dev                     | Chạy cả FE và BE                                |
| npm run dev:web                 | Chỉ chạy FE                                     |
| npm run dev:api                 | Chỉ chạy BE                                     |
| npm run check                   | Format, lint, typecheck, unit test, build       |
| npm run format                  | Format source                                   |
| npm run db:generate             | Sinh Prisma client                              |
| npm run db:studio               | Xem database                                    |
| npx playwright install chromium | Tải browser phục vụ E2E                         |
| npm run test:e2e                | Test sau khi đã build; cần port 3017/4018 trống |

## Quyết định kiến trúc

- Next.js chỉ phụ trách FE; nghiệp vụ/API được chuyển sang NestJS theo yêu cầu tách workspace.
- Auth do BE quản lý: email/mật khẩu và Google OAuth, dùng session cookie HttpOnly. Xem [hướng dẫn đăng nhập](docs/AUTHENTICATION.md).
- Đã cài SDK S3, form, calendar drag-and-drop và testing để xây tiếp; chưa kết nối dịch vụ ngoài.
- User sở hữu workspace; API lấy quyền truy cập từ phiên. Tạo tài khoản kèm hai kênh mock trong transaction.
- Đã có CRUD bản nháp, danh sách search/filter/sort/phân trang và chống ghi đè bằng version.
- Chưa triển khai media, lịch đăng, publisher/worker hoặc social API thật.
- Prisma client được sinh tự động trước dev/build/typecheck, không commit generated code.
- File .env.example chỉ chứa cấu hình local. Không dùng mật khẩu Docker demo ở production.
- Đây là base local: API bind loopback. Cần cấu hình host, secrets và hạ tầng riêng khi deploy.

## Tài liệu

- https://nextjs.org/docs
- https://docs.nestjs.com
- https://www.prisma.io/docs
- https://tanstack.com/query/latest/docs/framework/react/overview

## Dependency overrides

Root package.json pins patched transitive versions of multer (2.4.0), deepmerge-ts (8.0.2), and mysql2 (3.24.4) because NestJS 11 / Prisma 7 currently pin vulnerable versions. Revisit these overrides when upstream dependencies are updated. Prisma generation, migration, build and runtime health are checked against these versions.

Để thêm dependency trên máy đang dùng npm cũ, dùng `npx --yes npm@11.19.1 install <package> --workspace=@social-flow/web` (hoặc `@social-flow/api`). Không cần thay npm toàn máy. Dùng `npx --yes npm@11.19.1 ls` khi kiểm tra cây dependency để tránh cảnh báo invalid giả từ npm 11.11.
