@echo off
echo ==============================================
echo Zikirmatik Dualar.json Guncelleme Araci
echo ==============================================
echo.
echo dualar.json dosyasindaki degisiklikler GitHub'a gonderiliyor...
echo.

git add dualar.json
git commit -m "Dualar guncellendi (Otomatik)"
git push origin main

echo.
echo ==============================================
echo ISLEM TAMAMLANDI! 
echo Yeni dualar GitHub'a basariyla yuklendi. 
echo Uygulamayi acan herkes yeni dualari gorecek.
echo ==============================================
pause
