# SPAWN — 3D link-in-bio profile (Templates: `prism` · `skyline`)

โปรไฟล์ 3D สำหรับ link-in-bio — รูป ข้อมูล โซเชียล และลิงก์ทั้งหมดอยู่ใน "โลก" ที่เรนเดอร์จริงบน GPU
(Nuxt 4 + three.js + dither pipeline แบบ PSX)

## Routes

| Path | คำอธิบาย |
| --- | --- |
| `/` | Landing (CSS-only, ไม่มี WebGL) |
| `/studio` | **Studio** — เลือก template, กรอกข้อมูล, อัปโหลดรูป, save ลง local folder, คัดลอกลิงก์แชร์ |
| `/p/[username]` | โปรไฟล์ 3D + entrance "particle name" — เส้นทางแชร์ |
| `/api/profiles/[username]` | อ่านข้อมูลจาก `data/profiles/*.json` (Nitro, filesystem-first) |
| `POST /api/studio/profiles` | บันทึก/อัปเดตโปรไฟล์ → เขียน `data/profiles/{username}.json` |
| `GET /api/studio/profiles` | รายการโปรไฟล์ทั้งหมด |
| `DELETE /api/studio/profiles/[username]` | ลบโปรไฟล์ |
| `POST /api/studio/upload` | อัปโหลดรูปโปรไฟล์ → `public/uploads/{username}/avatar.<ext>` |

Demo: `/p/michael` (เทมเพลต `skyline`, ธีมทอง, EN) · `/p/fern` (เทมเพลต `prism`, ธีม aurora, TH)

> ⚠️ Studio ยังไม่มีการป้องกันการเข้าถึง (เปิด public) — ถ้าแชร์ผ่าน tunnel ใครมีลิงก์ก็เข้า `/studio` ได้ ตั้งใจรอปรับทีหลัง

## เทมเพลต PRISM (Template #1)

Entrance แนว samsy.ninja — ชื่อโปรไฟล์ถูก "ประกอบ" จากอนุภาคนับพัน (สกัดจากตัวอักษรจริง
รวมถึงภาษาไทย) ร่ายเข้าหากล้องแล้วก่อตัวเป็นชื่อกลางอากาศ ตามด้วย grid horizon,
shockwave และ social glyphs บินเข้าล็อกวงโคจร ก่อน DOM ค่อย ๆ เปิดขึ้นมาทับ
ทุกเฟรมผ่าน post-process dither + quantize 15-bit

### การเดินทาง — เลื่อน = เดินตะลุยถนน

พอ entrance จบ การเลื่อนหน้าจะกลายเป็นการ "เดิน" ของกล้องไปตามถนนหนึ่งสายที่มี
**5 สถานี**: `PROFILE → INFO → LINKS → MUSIC → OUTRO` แต่ละสถานีเป็นป้ายบิลบอร์ด 3D
ของตัวเอง (รูปโปรไฟล์คือป้าย ID กลางถนน, badge/สถิติ, ลิงก์ทีละป้าย, เพลง, QR แชร์)
— ข้อมูลทุกชิ้นดึงจากโปรไฟล์อัตโนมัติ (แก้ JSON แล้วฉาก/สถานีเปลี่ยนตาม; จำนวนลิงก์
= จำนวนป้ายลิงก์) ระหว่างสถานีกล้องจะบินข้ามสิ่งกีดขวาง และมี "ดาวกระจาย" (shuriken)
พุ่งผ่านหน้ากล้องไปพร้อมการเดินทาง

ฉากถนนเป็นสไตล์ **ninja-cyberpunk**: ประตูโทริอิกางกลางถนน, สายโชจินแดง/โคมอุ่นขึงข้าม
ถนนพร้อมสายเคเบิล, เสาไฟโค้ง-ตรงสลับข้าง, สัญญาณไฟจราจร, ตู้ขายของ, รถซูชิ, ชามราเมงยักษ์,
ป้ายนีออน, กอไผ่, โคมหิน, รูปปั้นจิ้งจอก (kitsune) และนินาจอมโจรคอยเฝ้าประตู — ทั้งหมดเป็น
โมเดล GLB จริงที่สตรีมเข้ามาหลังเฟรมแรก พร้อมเงาสะท้อนบนถนนเปียก

Perf ของการเดิน: โมเดลใหญ่ใช้ `InstancedMesh` (โคมไฟ/เสาไฟนับสิบตัว = ไม่กี่ draw call),
รุ่นที่หนักถูกข้ามเมื่อ reduced-motion/เครื่องช้า, เฟรมไทม์ desktop ~14–16 ms

## เทมเพลต SKYLINE (Template #2)

เลือกด้วย `"template": "skyline"` ใน `data/profiles/<username>.json` (ตัวอย่าง: `/p/michael`)

เมือง cyberpunk แบบ procedural — ตึกดำ 9×12 บล็อกพร้อมเส้น edges นีออนเรืองแสง (ฟ้า/ม่วงแดง),
หน้าต่างไฟประปราย, ถนนสะท้อนแสงแบบกระจก (เห็นเงาเส้นไฟทั้งเมือง) และหมอกจาง
เมืองถูก "แกะสลัก" ให้เป็นเส้นทางบิน: เริ่มสูงเหนือยอดตึก แล้วไต่ลงสู่ถนนแคบ ๆ,
บินผ่านสี่แยกที่มีร้านรวงจาก district GLB (ป้ายนีออนญี่ปุ่น/ตู้ขายของ/ไฟจราจร),
ไต่ขึ้นตึกทางเหนือ แล้วจบที่ "ดาดฟ้า SPAWN" ซึ่งมีป้าย QR แชร์ (ยืนยันได้จากปูกระเบื้อง
ลายเดียวกันที่พื้น) + ป้ายชื่อแบรนด์ + ลำแสงเหนือฟ้า

### การบิน — เลื่อน = กล้องบิน

Rail เป็น spline เส้นเดียวต่อเนื่องจากแดนไกลถึงดาดฟ้า; ทุกความสูงของ scroll = จุดหนึ่งบน rail
กล้องบินไปตามทางพร้อม smooth-damped look; beat warp ทำให้กล้อง "ช้าลง" รอบ 8 จังหวะเรื่องราว:

`ENTRY → NAME (ป้ายชื่อ + ONLINE) → PORTRAIT (บิลบอร์ดรูปบนกำแพงตึก) → STATS (แผงสถิติ) →
LINKS (ป้ายลิงก์ริมถนน) → MUSIC (ป้ายเพลง + อีควอไลเซอร์เรืองแสง) → CONNECT (แผ่นโซเชียล) →
GATE (ดาดฟ้า + QR)`

### ป้ายถูกเลือกยังไง (ทำไมถึงอ่านได้กลางเฟรม)

ทุกหน้าตึก/ดาดฟ้า/หน้าร้านคือ "slot" (จุด + แนวหน้าตึก + ความกว้าง). ตอนสร้างโลก `pick()`
จะเลือก slot ให้แต่ละป้ายโดยใช้ **กล้องที่องศาจริงของจังหวะนั้น** ไม่ใช่ระยะถึงเส้นทางลอย ๆ:

1. **align** — หน้า slot ต้องหันสวนทางบิน (กล้องอ่านป้ายด้านหน้าที่ "โต้" กับทิศทาง)
2. **กรวยสายตา (cone)** — มุมแนวนอนเทียบ heading + มุมก้ม (pitch) ของกล้องจริง ต้องอยู่ในกรอบ
3. **line-of-sight** — เดิน ray จากกล้องถึงป้าย ถ้าชนกล่องตึกอื่น (ไม่นับตึกเจ้าบ้าน) = ทิ้ง
4. **ระยะ 14–130 ม.** — เล็กไป/ไกลไปถูกตัด

แล้ว `mountPos()` จะ **สไลด์ป้ายไปตามแนวกำแพง** เข้าหาเส้นทางบิน (clamp ไม่ให้หลุดขอบตึก)
เพื่อให้ป้ายอยู่กลางเฟรมจริงแทนที่จะอยู่กลางกำแพงที่มองไม่เห็น · ป้ายที่เลือกก่อนได้หน้าใกล้ก่อน
(ไม่มีสองป้ายซ้อนหน้าเดียวกัน) · โปรไฟล์ที่ไม่มีข้อมูลส่วนไหน = ไม่มีป้ายส่วนนั้น (ไม่พัง)

### Interaction & fallback

- คลิกป้ายลิงก์/โซเชียล/QR ได้ (raycast → เปิดลิงก์), hover เปลี่ยน cursor
- มือถือ/เครื่องช้า/reduced-motion: ลด tier — DPR ต่ำลง, ปิด props ริมถนน, ลด/ปิด bloom,
  ลดจำนวนตึกและละติจูด; วัด frame time แล้ว auto-downgrade ระหว่างทาง
- ไม่มี WebGL เลย → DOM-first fallback: การ์ดโปรไฟล์ + ปุ่มแชร์/QR ยังใช้ได้ครบ ไม่มี canvas
- tab hidden → หยุด render; กลับมาเดินต่อจากตำแหน่งเดิม

## เพิ่มโปรไฟล์ใหม่

สร้างไฟล์ `data/profiles/<username>.json` ตาม schema ใน `app/types/profile.ts` — ไม่ต้องแก้โค้ด
(นี่คือโครงเดียวกับที่หน้า Studio เขียนไฟล์ให้)

## โครงสร้างหลัก

```
app/
  pages/index.vue                  landing
  pages/studio/index.vue           Studio — ฟอร์ม + preview + save + จัดการโปรไฟล์
  pages/p/[username].vue           profile page (SSR) + entrance orchestration
  components/PrismCanvas.client.vue  host ของ canvas (lazy three.js, อ่าน gate จาก <html>)
  components/PrismIntro.vue        overture overlay ตอนเข้า (phase + progress + skip)
  components/SkylinePage.vue       เทมเพลต SKYLINE — spacer/scroll → progress, DOM deck, fallback
  components/SkylineCanvas.client.vue  host ของ canvas (skyline)
  components/SkylineHud.vue        rail + จุด navigation ของจังหวะการบิน (คลิกได้)
  components/IdentitySlab.vue      บล็อกโปรไฟล์หลัก (DOM-first)
  components/{LinkStack,LiveDock,TopRail,IconGlyph,AvatarGlyph}.vue
  lib/prism/scene.ts               three.js scene + entrance timeline + adaptive quality
  lib/prism/journey.ts             scroll → กล้องเดินตาม 5 สถานี + snap + parallax
  lib/prism/props.ts               โหลด/วางโมเดล GLB ของ district (instancing, เงาสะท้อน,
                                   shuriken fly-by ระหว่างสถานี)
  lib/prism/panelAtlas.ts          atlas ป้ายทั้งหมด (ข้อมูลโปรไฟล์ → texture เดียว)
  lib/prism/shaders.ts             GLSL: void / grid / glyphs / name-points / dither post
  lib/prism/textPoints.ts          สกัดชื่อ → point cloud (2D canvas sampling)
  lib/skyline/kit.ts               palette/textures/seed + ทุก mesh factory ของเมือง
  lib/skyline/beats.ts             ตารางจังหวะ + beat warp (pure — ใช้ร่วม world/HUD/landmarks)
  lib/skyline/rail.ts              เส้นทางบิน (spline), nearest()/sample(), flight caps
  lib/skyline/generator.ts         สร้างผังเมือง + slots (หน้าตึก/ถนน/ดาดฟ้า) + towers
  lib/skyline/props.ts             street furniture จาก district GLB (lazy, unlit)
  lib/skyline/landmarks.ts         ลำดับการวางป้ายทั้งหมด + pick()/mountPos() + อีควอไลเซอร์
  lib/skyline/world.ts             renderer/composer/bloom/loop/adaptive tier + focus swing
  lib/iconAtlas.ts                 icon atlas (canvas → texture) ใช้ร่วม DOM + WebGL
  assets/css/main.css              tokens + entrance gate + landing/studio
  assets/css/prism.css             styles ของ template PRISM
  assets/css/skyline.css           styles ของ template SKYLINE
server/
  utils/profileStore.ts            อ่าน/เขียน/ลบ/validate โปรไฟล์ (ไฟล์ JSON)
  api/profiles/[username].get.ts   public profile API
  api/studio/*                     save / list / delete / upload (Studio)
data/profiles/*.json               ข้อมูลโปรไฟล์ (Studio เขียนไฟล์ที่นี่)
public/audio/*.mp3                 ไฟล์เพลงของโปรไฟล์ (nowPlaying.src)
public/models/district/*.glb       โมเดล 3D ของฉาก (ดูเครดิตด้านล่าง)
scripts/gen-icons.mjs              regenerate app/lib/icon-data.ts จาก simple-icons
```

## โมเดล 3D — แหล่งที่มาและเครดิต

ทุกโมเดลมาจาก [poly.pizza](https://poly.pizza) (low-poly, ฟรี) แล้วผ่าน
`@gltf-transform/cli optimize` (`KHR_mesh_quantization` + texture WebP 512px,
ไฟล์รวม ~5 MB และสตรีมทีละไฟล์หลังเฟรมแรก)

**CC0** (ไม่บังคับให้เครดิต — ให้ไว้เพื่อความโปร่งใส)
- **Quaternius** — Torii Gate, Street Light ×2, Traffic Cone, Ramen, Sushi Truck,
  Cyberpunk Signs, Ninja, Fox Statue, Bamboo, Japanese Door
  (รวมถึงชุด platform/ร้านค้า/ป้ายของ district)
- **Kay Lousberg** — Trafficlight B, Hanging Lantern
- **iPoly3D** — Shuriken ×2
- **JMHDE** — Lantern (โชจิน)

**CC-BY** (ต้องให้เครดิต)
- "Vending Machine" โดย **dook** — CC-BY, ผ่าน poly.pizza
- "Japanese Stone Lamp" โดย **Flopsi** — CC-BY, ผ่าน poly.pizza

## Perf rules ที่ยึด

- DOM ขึ้นก่อนเสมอ (LCP ไม่รอ WebGL) — three.js ถูก dynamic import หลัง first paint
- ชื่อถูกสแกนเป็นจุดครั้งเดียวตอน init (ไม่ใช่ทุกเฟรม)
- DPR clamp + render scale 0.7 + adaptive 3 tiers (ลด DPR/effects ถ้า FPS ตก)
- render scale ต่ำแล้วผ่าน fullscreen dither + quantize 15-bit (ลายเซ็น PSX, ถูกและสวย)
- ไม่มี bloom / shadow / transmission; glow มาจาก additive sprite + shader
- หยุด render เมื่อ tab hidden; `prefers-reduced-motion` → เวอร์ชันนิ่ง ไม่มี entrance
- เสียง lazy ทั้งหมด: MP3 `preload="none"` เล่นหลัง user gesture แรก (หรือกด ▶ เอง), Spotify iframe ฝังเฉพาะตอนกดเล่น — ทั้งสองโหมด **loop จนกว่าจะกดหยุด** (Spotify ต่อ iFrame API แล้วสั่ง seek(0)+play อัตโนมัติเมื่อจบ; บัญชีที่ไม่ล็อกอินจะได้พรีวิว ~25–30 วิ แล้ววนพรีวิวนั้น)

## Dev / แชร์ออกเน็ต

```bash
yarn dev                 # http://localhost:3001 (พอร์ต 3000 ถูกใช้โดยโปรเจกต์อื่นบนเครื่องนี้)
# แชร์ผ่าน Cloudflare quick tunnel
cloudflared tunnel --url http://localhost:3001
```

## Roadmap

- [x] Template #1 `prism` — particle-name entrance, identity slab, orbit socials, link stack, music player (MP3 + Spotify embed)
- [x] Template #2 `skyline` — procedural neon city flight, 8 beat signs (name/portrait/stats/links/music/socials/gate), rooftop QR, slot picker with real-camera cone + line-of-sight, DOM fallback
- [x] Studio v1 `/studio` — choose template, edit all fields, avatar upload, live preview, save ลง `data/profiles/`, share link
- [ ] Studio auth/password (ตอนนี้ public ตั้งใจไว้ก่อน)
- [ ] Integrations — live presence (Discord/Spotify ผ่าน [Lanyard](https://github.com/Phineas/lanyard) WS) + Spotify OAuth เต็มรูปแบบ
- [ ] OG image generation (`nuxt-og-image`) เป็นการ์ดโปรไฟล์สไตล์ 2D
- [ ] Template #3 (`orbit`) ตามมาในตัวเลือกของ Studio
# showcase
