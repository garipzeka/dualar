@echo off
cd /d C:\zikirmatik-app
echo Web varliklari senkronlanuyor (www -> android)...
call npx cap sync android || goto :error
set JAVA_HOME=C:\zikirmatik-app\jdk-21.0.4+7
set ANDROID_HOME=C:\Users\SB\AppData\Local\Android\Sdk
set PATH=%JAVA_HOME%\bin;%PATH%
cd /d C:\zikirmatik-app\android
call gradlew.bat assembleDebug --no-daemon 2>&1
goto :eof
:error
echo HATA: cap sync basarisiz!
exit /b 1
