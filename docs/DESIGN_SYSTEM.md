# Thiết lập giao diện dùng chung

Đây là cấu hình trình bày của FE, không phải application state. Không cần React Context/Zustand để giữ màu sắc hoặc font size.

## Nơi cần sửa

| File                              | Vai trò                                                                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/styles/tokens.css`  | Giá trị gốc: màu semantic, font family/weight/size/line-height, spacing, radius, control size, content width, shadow, motion |
| `apps/web/src/styles/theme.css`   | Ánh xạ token sang utility Tailwind v4; thường không cần sửa giá trị ở đây                                                    |
| `apps/web/src/styles/variants.ts` | Các tổ hợp class dùng chung: button, typography, surface và focus ring                                                       |
| `apps/web/src/app/globals.css`    | Import theme và base styles                                                                                                  |
| `apps/web/src/app/layout.tsx`     | Font file local; hiện tải Be Vietnam Pro 400/500/600 cho Latin và tiếng Việt                                                 |

Toast Sonner được ánh xạ về cùng token qua `apps/web/src/styles/toast.ts`; không duy trì một palette thông báo riêng.

## Màu sắc

Chọn màu theo mục đích: `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `border-border`, `border-input`, `outline-ring`.

- `primary` / `primary-hover` / `primary-foreground`: hành động chính.
- `secondary`: hành động phụ; `muted`: nền/chữ phụ; `accent`: vùng nhấn nhẹ.
- `destructive`: nền button xóa và chữ trắng tương ứng.
- `success`, `warning`, `info`, `danger`: màu chữ trạng thái; ghép với nền `*-subtle` khi cần.
- `danger` là màu chữ trên nền nhạt, khác vai trò `destructive` là nền nút có chữ trắng.

Đổi nhận diện thương hiệu bằng cách cập nhật cả `--primary`, `--primary-hover`, `--primary-foreground`, `--ring` và `--accent`/`--accent-foreground` trong tokens.css. Kiểm tra tương phản sau khi đổi.

Không viết `bg-emerald-800`, `text-slate-600`, mã hex hoặc inline màu ở feature component. Palette Tailwind vẫn tồn tại cho nhu cầu đặc biệt, nhưng quy ước dự án là ưu tiên token semantic. Đây là quy ước, chưa có lint tự động cấm palette.

## Typography

Font size dùng rem, không cố định font-size trên html để tôn trọng thiết lập chữ của người dùng.

| Utility   | Mặc định ở root 16px | Vai trò thường dùng            |
| --------- | -------------------- | ------------------------------ |
| text-xs   | 12px                 | Caption                        |
| text-sm   | 14px                 | Label, button, nội dung phụ    |
| text-base | 16px                 | Nội dung chính                 |
| text-lg   | 18px                 | Tiêu đề section                |
| text-xl   | 20px                 | Tiêu đề trung gian             |
| text-2xl  | 24px                 | Tiêu đề trang trên mobile      |
| text-3xl  | 30px                 | Tiêu đề trang từ breakpoint sm |

Sửa `--font-size-*` và `--line-height-*` trong tokens.css để thay toàn bộ class tương ứng. Các cỡ ngoài xs–3xl vẫn theo mặc định Tailwind; bổ sung token trước khi dùng chúng trong sản phẩm.

```tsx
import { typographyVariants } from '@/styles/variants';
import { cn } from '@/lib/utils';

<h1 className={typographyVariants({ variant: 'pageTitle' })}>Bài viết</h1>
<p className={cn(typographyVariants({ variant: 'bodySmall', tone: 'muted' }), 'mt-2')}>
  Quản lý nội dung của bạn.
</p>
```

Variant chỉ quyết định kiểu chữ, không quyết định thẻ HTML. Giữ đúng h1/h2/p/label theo ngữ nghĩa. Khi đổi font family hoặc thêm font weight, cập nhật font import trong layout để không dùng font giả lập.

## Component variants

### Button

- `variant`: `default`, `secondary`, `outline`, `ghost`, `destructive`, `link`.
- `size`: `sm` (32px), `default` (40px), `lg` (44px), `icon` (40px), tính ở root 16px.
- Button thật mặc định `type="button"`; submit phải ghi rõ `type="submit"`.
- Với button icon, luôn có `aria-label`; ưu tiên lg ở các thao tác mobile cần vùng chạm lớn.
- `asChild` dùng khi render link; link không hỗ trợ native disabled như button. Không truyền disabled rồi coi link đã bị khóa.

```tsx
<Button>Lưu nháp</Button>
<Button variant="outline" size="sm">Hủy</Button>
<Button variant="destructive">Xóa bài</Button>
<Button type="submit" size="lg">Lên lịch</Button>
<Button asChild variant="link"><a href="/posts">Danh sách bài</a></Button>
```

Sửa tổ hợp class của button tại `buttonVariants` trong variants.ts. Component Button giữ trách nhiệm props/semantics; `buttonVariants` cũng được export từ file button để dùng lại.

### Typography và surface

- Typography: `pageTitle`, `sectionTitle`, `body`, `bodySmall`, `caption`, `label`, `eyebrow`; tone `default`, `muted`, `primary`, `success`, `warning`, `info`, `danger`.
- Surface: `default`, `muted`, `elevated`; padding `none`, `sm`, `default`, `lg`.
- Panel elevated dùng shadow token; radius đều suy ra từ `--radius`.

```tsx
<section className={surfaceVariants({ variant: 'elevated', padding: 'lg' })}>...</section>
```

## Spacing, layout và motion

`--space-unit` điều khiển spacing scale thông thường (`p-4`, `gap-2`, ...). `--control-height-*` điều khiển chiều cao button. `--content-width` điều khiển `max-w-page`. Chỉ sửa scale spacing khi muốn thay mật độ toàn app.

`--motion-duration` điều khiển transition mặc định. Button dùng `motion-reduce:transition-none` để tôn trọng prefers-reduced-motion. Focus ring có outline riêng, không phụ thuộc màu nền nút.

## Quy trình thêm component hoặc đổi theme

1. Tái sử dụng token hiện có theo ý nghĩa; chỉ thêm token nếu có vai trò mới.
2. Nếu thêm token cần utility, ánh xạ trong theme.css.
3. Đưa các tổ hợp class tái sử dụng vào variant có type; không tạo class bằng nối chuỗi động như `bg-${color}` vì Tailwind cần thấy tên class đầy đủ.
4. Cho phép className để bổ sung layout cục bộ bằng cn(), không tùy tiện ghi đè màu/typography toàn app.
5. Kiểm tra loading/disabled/hover/focus/error, tương phản, viewport 375px và font tiếng Việt.

Chỉ có light theme trong phạm vi MVP. Cấu trúc token hỗ trợ mở rộng sau này nhưng chưa triển khai dark mode hoặc bộ chọn theme.

Tài liệu nền: [Tailwind theme variables](https://tailwindcss.com/docs/theme), [CVA variants](https://cva.style/getting-started/variants/).
