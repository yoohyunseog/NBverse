@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 서버를 시작합니다 (포트 8123)...
set PORT=8123
node server.js
pause

