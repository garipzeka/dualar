@echo off
title GitHub Yedekleme
echo.
echo ==============================================
echo       Uygulama GitHub'a Yedekleniyor...
echo ==============================================
echo.

echo 1. Degisiklikler ekleniyor...
git add .

echo.
echo 2. Degisiklikler isleniyor (commit)...
:: Tarih ve saat ile birlikte otomatik mesaj olusturur
git commit -m "Otomatik Yedekleme: %date% %time%"

echo.
echo 3. GitHub'a yukleniyor (push)...
git push origin main

echo.
echo ==============================================
echo    Yedekleme Islemi Tamamlandi!
echo ==============================================
echo.
pause
