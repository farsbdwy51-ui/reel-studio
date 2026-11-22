@echo off
cd /d %~dp0
if not exist node_modules (
  echo اول تشغيل: بنجهز الحاجات...
  call npm install
  call npx playwright install chromium
)
start "" http://127.0.0.1:4301
node server.mjs
