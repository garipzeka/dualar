@echo off
cd /d C:\zikirmatik-app
echo Syncing Capacitor...
call npx cap sync android

set JAVA_HOME=C:\zikirmatik-app\jdk-21.0.4+7
set ANDROID_HOME=C:\Users\SB\AppData\Local\Android\Sdk
set PATH=%JAVA_HOME%\bin;%PATH%

cd /d C:\zikirmatik-app\android
echo Building Release AAB...
call gradlew.bat bundleRelease --no-daemon

if %ERRORLEVEL% EQU 0 (
    echo SUCCESS: Copying AAB to root...
    copy /Y app\build\outputs\bundle\release\app-release.aab C:\zikirmatik-app\ZikirmatikPro-Release.aab
) else (
    echo FAILED to build.
)
