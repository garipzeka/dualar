@echo off
title GitHub Yedekleme (Zikirmatik Pro)
setlocal
cd /d "%~dp0"
set "ERR=0"
set "REMOTE=origin"
set "CHANGES_TMP=%TEMP%\zikirmatik_git_changes.txt"

echo.
echo ==============================================
echo       Uygulama GitHub'a Yedekleniyor...
echo ==============================================
echo.

:: ---------- 0) Git deposu kontrolu ----------
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo [HATA] Bu klasor bir git deposu degil.
    echo        Bat dosyasi proje klasorunun icinde olmali.
    set "ERR=1"
    goto :son
)

:: ---------- 1) Detached HEAD kontrolu ----------
:: Onceden bu dosya commit'i 'detached HEAD'e yapiyor, sonra eski main
:: dalini push ediyordu; bu yuzden yedekler GitHub'a hic ulasmiyordu.
git symbolic-ref -q HEAD >nul 2>&1
if errorlevel 1 (
    echo [UYARI] Git su anda 'detached HEAD' durumunda!
    echo.
    echo         Bu durumda yapilan commit'ler hicbir dala baglanmaz
    echo         ve push sirasinda GitHub'a GITMEZ. Eski yedeklerinizin
    echo         yuklenmemesinin sebebi buydu.
    echo.
    echo         Cozum: once main dalina gecip tarih birlesmesini yapin,
    echo         sonra bu dosyayi tekrar calistirin:
    echo.
    echo             git checkout main
    echo             git merge f94cfeb
    echo             git push origin main
    echo.
    set "ERR=1"
    goto :son
)

for /f "delims=" %%b in ('git branch --show-current') do set "BRANCH=%%b"
echo Calisilan dal: %BRANCH%

:: ---------- 2) Hedef (remote) kontrolu ----------
for /f "delims=" %%r in ('git config --get remote.%REMOTE%.url 2^>nul') do set "URL=%%r"
if not defined URL (
    echo [HATA] '%REMOTE%' uzak deposu ^(remote^) tanimli degil.
    echo        Eklemek icin:  git remote add origin https://github.com/KULLANICI/DEPO.git
    set "ERR=1"
    goto :son
)
echo Hedef  : %URL%
echo Dal    : %REMOTE%/%BRANCH%
echo.

:: ---------- 3) Degisiklikleri listele ----------
git status --porcelain > "%CHANGES_TMP%" 2>nul
set "COUNT=0"
for /f "usebackq delims=" %%a in ("%CHANGES_TMP%") do set /a COUNT+=1
echo 3. %COUNT% dosyada degisiklik bulundu:
if not "%COUNT%"=="0" type "%CHANGES_TMP%"

:: ---------- 4) Tum dosyalari ekle ----------
echo.
echo 4. Tum dosyalar ekleniyor ^(git add -A^)...
git add -A
if errorlevel 1 (
    echo [HATA] Dosyalar eklenemedi!
    set "ERR=1"
    goto :son
)
set "STAGED=0"
for /f "delims=" %%s in ('git diff --cached --name-only') do set /a STAGED+=1
echo    - Stage edilen dosya sayisi: %STAGED%

:: ---------- 5) Commit ----------
:: Zaman damgasi her zaman hesaplanir (degisiklik olmasa da)
set "STAMP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss'"`) do set "STAMP=%%i"
if not defined STAMP set "STAMP=%date% %time%"

echo.
echo 5. Degisiklikler isleniyor ^(commit^)...
if "%COUNT%"=="0" (
    echo    Degisiklik yok, commit atlaniyor.
) else (
    git commit -m "Otomatik Yedekleme: %STAMP%"
    if errorlevel 1 (
        echo [HATA] Commit basarisiz oldu!
        set "ERR=1"
        goto :son
    )
    git log -1 --oneline
)

:: ---------- 6) Yedek dogrulama ----------
echo.
echo 6. Yedek kontrolu...
set "TRACKED=0"
for /f "delims=" %%f in ('git ls-files') do set /a TRACKED+=1
echo    - GitHub'a giden ^(takip edilen^) dosya sayisi: %TRACKED%
echo    - .gitignore ile disarida tutulan kritik dosyalar ^(bilincli^):
git check-ignore -v serviceAccountKey.json node_modules google-services.json 2>nul
if errorlevel 1 echo      ^(kural eslesmesi yok^)

:: ---------- 7) GitHub'a gonder ----------
echo.
echo 7. GitHub'a yukleniyor ^(push^)...
git push %REMOTE% %BRANCH%
if errorlevel 1 (
    echo.
    echo [HATA] Push basarisiz!
    echo        - Internet / GitHub erisimini kontrol edin
    echo        - GitHub'da baska degisiklikler varsa once birlestirin:
    echo              git pull --rebase %REMOTE% %BRANCH%
    echo        - Yerel dosyalariniz GUVENDE, veri kaybi yok.
    set "ERR=1"
    goto :son
)
echo    Push tamam. GitHub'daki son durum:
git log -1 --oneline %REMOTE%/%BRANCH%

:: ---------- 8) Son kontrol: kalan degisiklik var mi ----------
set "REMAIN=0"
for /f "delims=" %%a in ('git status --porcelain') do set /a REMAIN+=1
if "%REMAIN%"=="0" (
    echo    [OK] Tum degisiklikler GitHub'a yedeklendi, klasor temiz.
) else (
    echo    [UYARI] %REMAIN% degisiklik hala bekliyor:
    git status --short
)

:son
del "%CHANGES_TMP%" >nul 2>&1
echo.
echo ==============================================
if "%ERR%"=="0" (
    echo    Yedekleme Tamamlandi!
) else (
    echo    Yedekleme HATA ILE bitti - yukaridaki mesajlari inceleyin
)
echo ==============================================
echo.
pause
exit /b %ERR%
