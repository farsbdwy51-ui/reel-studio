# ريل ستوديو v1 🎬

حوّل **موضوع** لريل علمي عربي (مصري) جاهز، عمودي 1080×1920، من غير وش — كل حاجة بتشتغل على جهازك.

السلسلة: **«عارف ليه؟»** — هوك، سؤال، تشبيه بسيط، وخلاصة، بمعدل ~2.6 كلمة/ثانية.

## المتطلبات
- Node 18 أو أحدث
- ffmpeg متسطب على الجهاز
- متصفح Chromium (بيتسطب لوحده) أو Google Chrome

## التشغيل
```bash
npm run setup     # npm install + playwright install chromium
npm start         # يفتح على http://127.0.0.1:4301
```
على ويندوز: دوس `start.bat` — أول مرة بيعمل setup وبيفتح المتصفح.

## المفاتيح (من شاشة الإعدادات ⚙ جوه التطبيق)
مفيش أي مفتاح بيتحط في الكود. كل مفتاح بتكتبه إنت في الإعدادات، وبيتخزن في `data/settings.json`، والمتصفح بيشوف آخر 4 حروف بس.

| الخدمة | ليه | منين |
|---|---|---|
| FreeLLMAPI (أو أي OpenAI-compatible) | كتابة السكريبت والستوري بورد | https://github.com/tashfeenahmed/freellmapi |
| ElevenLabs | صوت التعليق + توقيت الحروف | https://elevenlabs.io/app/developers/ |
| Deepgram | توقيت كلمات صوت مرفوع | https://console.deepgram.com/ |

تقدر كمان ترفع تسجيل صوتك بدل TTS من الواجهة.

## المراحل (5)
`script → voice → timing → storyboard → render`
كل مرحلة ليها حالة (idle/running/review/done/error)، لوج لايف، وتقدر تعيد تشغيلها أو تلغيها أو تعدّلها، وتختار لكل مرحلة: **كمّل تلقائي** أو **استنى موافقتي**.

## التجربة أوفلاين (Mock APIs)
```bash
npm run mock    # APIs مزيفة على :4399
# في تاب تاني:
FREELLM_BASE_URL=http://127.0.0.1:4399/v1 \
ELEVENLABS_BASE_URL=http://127.0.0.1:4399 \
DEEPGRAM_BASE_URL=http://127.0.0.1:4399 \
npm start
```
اختبار شامل: `npm run e2e` — بيعمل مشروع، يوافق على السكريبت، ويستنى الريندر ويتأكد من كل مرحلة.
معاينة كل التمبليتس: `npm run template-check` → `out/templates-sheet.png`.

## البنية
```
server.mjs            سيرفر node:http على 127.0.0.1:4301 (localhost بس)
src/                  pipeline + llm + tts + align (LCS) + storyboard + render + icons
public/               الواجهة (RTL) + render.html/render.js (رسم الفريمات، deterministic في t)
tools/mock-apis.mjs   FreeLLMAPI + ElevenLabs + Deepgram مزيفين
tools/e2e.mjs         اختبار شامل
references/           ستايل السكريبت
assets/fonts/         IBM Plex Sans Arabic (OFL) + OFL.txt
assets/icons/         مكتبة أيقونات: يدوية (CC0) + Health Icons (CC0) + Tabler (MIT)
```

## الريندر
- كانفس 720×1280 بمقياس ×1.5 → 1080×1920
- Playwright بيصوّر كل فريم (30fps) و ffmpeg بيكوّد H.264 / yuv420p
- الصوت بيتميكس مع whoosh عند قطع المشاهد وتيك على الكلمات المؤكدة، normalized لـ −14 LUFS

## ملاحظات أمانة
- كل حاجة مجانية ومفتوحة المصدر.
- الصوت في وضع الـ mock نغمات مركّبة مش كلام حقيقي — عشان تسمع صوت حقيقي حط مفتاح ElevenLabs.
- الـ Deepgram mock بيرجع آخر نص اتولّد بالـ TTS (للتجربة الأوفلاين بس).
