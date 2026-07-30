@echo off
REM PIXEL TRADING FLOOR 실행기 — 브라우저를 열고 서버를 띄운다.
cd /d "%~dp0"
start "" "http://localhost:8000"
node server\server.js
