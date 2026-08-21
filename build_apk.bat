@echo off
set JAVA_HOME=C:\zikirmatik-app\jdk-21.0.4+7
set ANDROID_HOME=C:\Users\SB\AppData\Local\Android\Sdk
set PATH=%JAVA_HOME%\bin;%PATH%
cd /d C:\zikirmatik-app\android
call gradlew.bat clean assembleDebug --no-daemon 2>&1

