# Chánh Điện Online · 在线正殿

> **Đang chạy tại:** https://trandinhthanhofficial.github.io/Tam-An-Tu-Lux-Tech/
>
> Mở link, chọn chánh điện, nhập pháp danh là vào ngồi được. Gửi link cho người khác để họ vào cùng.

Chánh điện 2.5D chạy trên web. Mỗi người mở link là bước vào chánh điện, ngồi xuống bồ đoàn.
Ai trong phòng cũng thấy nhau theo thời gian thực: dâng hương, rải cánh sen, hoa sen, thỉnh chuông
đều phát hiệu ứng và âm thanh tới **tất cả** người đang có mặt.

Không cần server riêng, không cần tài khoản, không cần API key. Deploy lên GitHub Pages là dùng được.

---

## Đã thay đổi gì so với bản gốc

| Bản gốc | Bản này |
|---|---|
| Kết nối TikTok LIVE, đọc bình luận/quà | Bỏ hoàn toàn |
| Coin, bảng Công Đức, quà trả tiền | Bỏ hoàn toàn |
| Chạy bằng Node server trên máy phát | Chạy tĩnh, ai có link cũng vào được |
| Overlay 9:16 + bảng điều khiển riêng | Một trang duy nhất cho mọi người |
| Chỉ tiếng Việt | Chuyển Việt ⇄ Trung bằng một nút |
| Một phòng duy nhất | Nhiều chánh điện, chọn lúc vào, mỗi cái tách biệt |
| 24/36/64/100 chỗ, lấp tuỳ ý | 10 chỗ, người vào tự chọn vị trí |
| 4 món quà có giá | 4 nghi lễ miễn phí, mỗi nghi lễ một hiệu ứng + âm thanh riêng |
| Không có chat | Ô chat góc dưới, hiện bình luận trong 90 giây |
| Không có | Gõ mõ tụng kinh, đủ 99 lần được 1 công đức |

Bộ server TikTok cũ được giữ nguyên trong `_archive/live-tiktok/` để tham khảo, không còn được dùng.

---

## Deploy lên GitHub Pages

1. Tạo repository mới trên GitHub, đẩy toàn bộ thư mục này lên nhánh `main`.
2. Vào **Settings → Pages**.
3. **Source**: `Deploy from a branch` · **Branch**: `main` · **Folder**: `/ (root)` → **Save**.
4. Đợi khoảng 1 phút, link sẽ là `https://<tên-tài-khoản>.github.io/<tên-repo>/`.

Xong. Gửi link đó cho mọi người là họ vào ngồi cùng được.

Chạy thử trên máy trước khi đẩy:

```bash
python -m http.server 8000
# mở http://localhost:8000
```

> Không mở trực tiếp bằng `file://` — trình duyệt sẽ chặn WebSocket.

---

## Chánh điện (server)

Màn hình đầu tiên cho chọn chánh điện. Mỗi chánh điện là một phòng riêng trên broker — người ở
chánh điện này không thấy người ở chánh điện khác. Cạnh mỗi tên có số người đang ngồi, cập nhật
trực tiếp, nên nhìn là biết nên vào đâu.

Sau khi vào, tên chánh điện và số người hiện ở góc trên bên trái.

Danh sách nằm trong `app/config.js`, sửa là xong:

```js
window.APP_CONFIG = {
  servers: [
    { id: 'luxshare',  name: 'Luxshare-TECH',      nameZh: 'Luxshare-TECH' },
    { id: 'chungdien', name: 'Chánh Điện Chung',   nameZh: '公共正殿' },
    { id: 'thienvien', name: 'Thiền Viện Tịnh Tâm', nameZh: '静心禅院' },
  ],
  defaultServer: 'luxshare',
  capacity: 10,
};
```

`id` là tên phòng, chỉ dùng chữ thường không dấu, số, gạch dưới. Thêm bao nhiêu chánh điện cũng được.
Lựa chọn được nhớ lại lần sau, và có thể chỉ định thẳng bằng `?room=id`.

---

## Mười chỗ ngồi

```
                        ┌──────────────┐
                        │  1 · TRỤ TRÌ │  sát bàn thờ, chính giữa
                        └──────────────┘
                     ○ 2           3 ○
                   ○ 4               5 ○
                 ○ 6                   7 ○
              ○ 8                         9 ○
                          ○ 10
```

Tổng: **1 trụ trì + 9 vị = 10**.

Toạ độ từng ghế được đo trực tiếp từ `assets/hall.jpg` để nhân vật ngồi đúng tâm bồ đoàn đã vẽ
trong tranh: tám ghế ở hai cột hai bên lối đi, cộng một ghế ở đầu lối đi gần camera. Ghế 1 (trụ trì)
và ghế 10 nằm trên sàn trống nên được vẽ thêm đệm riêng.

Những bồ đoàn còn lại trong tranh để trống — đúng như một chánh điện lúc vắng người.

Muốn đổi số ghế, sửa mảng `SEATS` ở đầu `app/hall.js` và `capacity` trong `app/config.js`.

---

## Vào chánh điện: tự chọn chỗ

Sau khi nhập pháp danh, chánh điện hiện ra với **số thứ tự trên từng chỗ còn trống**. Bấm vào một
số là nhân vật bước từ cửa, đi lên lối giữa, rẽ vào chỗ rồi ngồi xuống.

- Chỗ đã có người thì không hiện số; bấm vào sẽ báo "chỗ này đã có người ngồi".
- Hai người cùng bấm một chỗ: máy nào vào phòng trước thắng, máy kia được mời chọn lại.
- Hết chỗ thì chỉ xem được, không có ghế.

Người vào đầu tiên thường chọn ghế 1 và thành trụ trì — nhưng không bắt buộc, ai thích ngồi đâu
cũng được miễn còn trống.

---

## Bốn nghi lễ

Mỗi nghi lễ có hiệu ứng vẽ riêng và âm thanh tổng hợp riêng (không dùng file âm thanh), và
được phát tới mọi người trong phòng qua MQTT.

| Nghi lễ | Hiệu ứng | Âm thanh |
|---|---|---|
| **Dâng hương** | Người dâng chắp tay bái ba lần, quầng sáng ấm trên bàn thờ, khói hương cuộn lên | Tiếng gió lọc + ba tiếng tàn hương lách tách + trầm ấm |
| **Cánh sen** | 18 cánh sen xoay và bay lên quanh người dâng | Chuông pha lê bốn nốt + tiếng cánh rung |
| **Hoa sen** | Đoá sen lớn nở trước Phật, toả tia sáng, hoa rơi | Hợp âm ngũ cung dâng lên + chuông nhẹ |
| **Thỉnh chuông** | Chuông lớn treo trên khán thờ, ba vòng sóng lan trên sàn | Chuông đồng 6 hài âm, ngân dài ~7 giây |

Bấm vào chánh điện bất kỳ đâu để cúi đầu một cái (chỉ hiện trên máy bạn).

Dâng hương là nghi lễ duy nhất có động tác bái: nhân vật chắp tay cúi xuống ba lần, mỗi lần
khoảng 0,9 giây, thân người hạ xuống và hơi nở ra như đang cúi về phía bàn thờ.

### Câu chúc phúc

Mỗi lần **dâng hương** hoặc **hoa sen**, một câu chúc phúc ngẫu nhiên hiện lên trên đầu người
dâng rồi bay nhẹ và tan dần — ví dụ *Bình an tự tại*, *Tâm tịnh như sen*, *Vạn sự cát tường*,
*Thiện duyên hội đủ*… (10 câu, xem `bless.0`–`bless.9` trong `app/i18n.js`).

Chữ nhỏ, chỉ có viền tối chứ không có nền, nên không che người phía sau. Câu chúc được phát cho
mọi người trong phòng, nhưng mỗi máy hiện bằng ngôn ngữ của mình — chỉ số câu được truyền đi,
không truyền chữ.

---

## Gõ mõ tụng kinh

Nút gõ mõ nằm cạnh nút chat ở góc dưới bên phải. Bấm vào mở bảng gõ mõ:

- Mỗi lần gõ: tiếng mõ vang lên (cao độ hơi ngẫu nhiên để không nghe như máy đếm nhịp), một vòng
  sáng loang ra, số đếm tăng 1. **Không gõ thì không có tiếng** — không có nhịp mõ tự động.
- Thanh tiến trình chạy tới **99**.
- Đủ 99 lần: cộng **1 công đức**, số đếm quay về 0, chuông ngân và một đoá sen nở giữa chánh điện.
  Người khác trong phòng cũng thấy hoa sen và dòng "đã gõ đủ 99 lần" trong khung chat.
- Số lần đang gõ và tổng công đức được lưu trên máy, đóng trình duyệt mở lại vẫn còn.

Phím `Esc` đóng bảng. Gõ liên tục không bị giới hạn — đây là phép tuỳ ý, không phải nhiệm vụ.

---

## Giao diện

- **Nút ngôn ngữ** góc trên phải: `中文` ⇄ `Tiếng Việt`. Lựa chọn được nhớ lại lần sau, đổi cả
  tên chánh điện.
- **Ô chat** góc dưới phải: bấm icon để mở. Chỉ hiện bình luận trong **90 giây** gần nhất, tự
  cuộn xuống cuối, có số tin chưa đọc trên icon. Nội dung chat được phát cho mọi người trong phòng.
- **Nút nhạc** bật/tắt nhạc nền. Nhạc tự giảm âm lượng khi có nghi lễ.
- **Nút rời** đưa về màn hình chọn chánh điện.

### Xem thử chánh điện đầy người

Thêm `?preview=9` vào URL để lấp đầy 9 ghế còn lại bằng người mẫu **chỉ hiện trên máy bạn**
(không gửi lên mạng). Dùng để chụp ảnh hoặc xem bố cục:

```
http://localhost:8000/?preview=9
```

---

## Vì sao không cần server

GitHub Pages chỉ trả file tĩnh, không giữ được kết nối. Nên mỗi trình duyệt tự kết nối tới một
**MQTT broker công khai** qua WSS và cùng nói chuyện trên topic riêng của từng chánh điện:

```
wss://broker.emqx.io:8084/mqtt      ← thử trước
wss://broker.hivemq.com:8884/mqtt   ← dự phòng
wss://test.mosquitto.org:8081/mqtt  ← dự phòng
```

Cả ba đều miễn phí, không cần đăng ký. Trình duyệt đăng ký nghe **tất cả** chánh điện cùng lúc
(để hiện số người ở màn hình chọn) nhưng chỉ gửi dữ liệu vào chánh điện mình đang ngồi.

Nếu cả ba broker đều không tới được (mạng công ty chặn, broker sập), ứng dụng tự chuyển sang
**BroadcastChannel** — vẫn chạy nhưng chỉ đồng bộ giữa các tab của cùng một máy.

Trạng thái hiện ở góc trên bên trái: chấm xanh là đang trực tuyến, chấm vàng là chế độ cục bộ.

---

## Cấu trúc

```
index.html          khung trang + toàn bộ markup
app/
  config.js         danh sách chánh điện — file duy nhất bạn thường cần sửa
  styles.css        giao diện, khung 9:16
  i18n.js           từ điển Việt/Trung + hàm t()
  net.js            MQTT qua WSS, nhiều phòng, 3 broker dự phòng
  audio.js          WebAudio: nhạc, chuông, mõ, 4 âm thanh nghi lễ
  hall.js           engine vẽ canvas: 10 ghế, sprite, hiệu ứng
  main.js           server, presence, chat, nghi lễ, gõ mõ
vendor/
  mqtt.min.js       mqtt.js 5.10.1 (đã vendor, không gọi CDN)
assets/             tranh nền, sprite, nhạc
_archive/           bộ server TikTok cũ, không dùng nữa
LogAI/              nhật ký các phiên làm việc
```

Không có bước build. Sửa file là xong.

---

## Giới hạn cần biết

- **Broker công khai.** Topic nằm trên broker công cộng, về lý thuyết người ngoài đọc được nếu
  biết đúng tên topic. Đừng gửi thông tin riêng tư vào chat. Muốn riêng tư thật thì cần broker
  riêng có mật khẩu, hoặc backend riêng.
- **Không có đăng nhập.** Ai có link cũng vào được, tên là tự khai, không ai xác thực.
- **Tối đa 10 người có ghế mỗi chánh điện.** Người thứ 11 trở đi chỉ xem.
- **Đồng hồ máy.** Thứ tự ngồi dựa trên thời điểm vào phòng do từng máy tự khai. Máy nào chỉnh
  giờ lệch nhiều có thể bị xếp chỗ khác thường.
- **Giọng đọc:** bản này bỏ phần đọc thành tiếng (bản gốc dùng Edge TTS qua server). Âm thanh
  chỉ còn nhạc nền, chuông, mõ và bốn hiệu ứng nghi lễ.

---

## Nguồn gốc và giấy phép

Dựa trên dự án **Chánh Điện Tịnh Tâm** của **Kent Juno** (MIT). Bản này giữ nguyên tranh nền,
sprite và nhạc của bản gốc, thay toàn bộ phần mạng và giao diện.

MIT — xem `LICENSE`.

Hình ảnh trong `assets/` do tác giả bản gốc tạo bằng Google Flow, nhạc bằng Gemini. Kiểm tra
điều khoản của các dịch vụ đó trước khi dùng thương mại, hoặc thay bằng tài nguyên của bạn.
