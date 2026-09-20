@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title Colectivo - servidor local
echo.
echo   COLECTIVO
echo   ---------
echo   En esta PC:                  http://localhost:8080
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  set "ip=%%a"
  set "ip=!ip: =!"
  echo   En el celular (mismo Wi-Fi^): http://!ip!:8080
)
echo.
echo   Deja esta ventana abierta mientras lo uses. Para cerrar: Ctrl+C
echo.
start "" http://localhost:8080
where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server 8080
) else (
  py -m http.server 8080
)
pause
