# Google Play Yayın Denetim Raporu — Zikirmatik Pro

- **Tarih:** 25.08.2026
- **Uygulama:** Zikirmatik Pro (`com.zikirmatik.pro`) — Capacitor 8 / Android
- **versionCode:** 79 · **versionName:** 0.0.79
- **Kapsam:** Yalnızca denetim; hiçbir dosya değiştirilmedi.

---

## 1. KRİTİK (Yayını Engelleyen Sorunlar)

### 1.1 Release imzalama anahtarı ve yapılandırması YOK
- `android/app/build.gradle` içinde `signingConfigs` tanımı yok; release build type imzasız.
- Diskte hiçbir `.jks` / `.keystore` dosyası bulunamadı.
- `build_apk.bat` yalnızca **debug** APK üretiyor: `gradlew clean assembleDebug`
  → Çıktı: `android/app/build/outputs/apk/debug/app-debug.apk`
- Google Play yalnızca release imzalı **AAB (Android App Bundle)** kabul eder. Debug APK yüklenemez.
- **Yapılması gereken:** Keystore oluşturulmalı, `signingConfig` eklenmeli, `bundleRelease` ile AAB üretilmeli.
- **DİKKAT:** `google-services.json` içindeki SHA-1 (`67ccf04f...`) mevcut sertifikaya aittir.
  YENİ bir keystore oluşturulursa bu SHA-1 Firebase'e eklenmezse **Google ile Giriş kırılır**.

### 1.2 Paketlenecek web varlıkları GÜNCEL DEĞİL
| Dosya | root/www | android/assets/public |
|---|---|---|
| index.html | E1C9A9B6... (aynı) | 1503A6AD... (FARKLI - eski) |
| sw.js | B29F8733... (aynı) | 5A7016E9... (FARKLI - eski) |

- Son değişiklikler APK'ya **yansımamış**. Bu haliyle yayınlanırsa Play'e eski sürüm girer.
- **Yapılması gereken:** Derlemeden önce `npx cap sync android` (veya en az `npx cap copy android`).

### 1.3 Firebase Admin özel anahtarı düz metin duruyor
- `serviceAccountKey.json` klasörde mevcut (Firebase projesinin TAM kontrolünü verir).
- İyi haber: Git'e eklenmemiş (`.gitignore`'da, tracked değil) ve uzak repoda görünmüyor.
- Risk: Bu klasör zip/rar olarak paylaşılırsa veya ileride yanlışlıkla eklenirse proje ele geçirilir.
- **Öneri:** Anahtarın hiçbir yedeğinin paylaşılmadığından emin olun; şüphe varsa Google Cloud IAM'den anahtarı **rotate** edin.

---

## 2. YÜKSEK ÖNCELİKLİ

### 2.1 Target API süresi dolmak üzere
- Mevcut: `targetSdkVersion 35`. Google Play kuralı gereği **31 Ağustos 2026**'dan itibaren yeni uygulamalar/güncellemeler **API 36 (Android 16)** hedeflemeli.
- Bugün 25.08.2026 → yaklaşık 1 hafta içinde API 36 zorunlu olacak.
- **Yapılması gereken:** `variables.gradle` içinde compile/target SDK'yı 36'ya çıkarmak ve test etmek.

### 2.2 User-Agent manipülasyonu (politika riski)
- `MainActivity.java:18`: WebView User-Agent'tan `"; wv"` kaldırılıyor → uygulama Chrome tarayıcı gibi görünmeye çalışıyor.
- Google Play "Deceptive Behavior" politikası altında reddedilme riski taşır.

### 2.3 Data Safety formu + Gizlilik Politikası zorunlu
- Uygulama Google ile oturum açma kullanıyor ve Firestore'da kullanıcı verisi saklıyor
  (e-posta/isim/profil foto + dua listeleri, sayaç verileri, UID).
- Play Console'da **Data Safety beyanı** doldurulmalı ve mağaza listelemesine **gizlilik politikası URL'si** eklenmelidir.
- Projede gizlilik politika sayfası/metni bulunmuyor.

### 2.4 google-services.json'da iki paket adı var
- `com.selahattin.zikirmatikapk` (eski) ve `com.zikirmatik.pro` birlikte tanımlı.
- Eski paket daha önce Play'de yayındaysa: hesap askıya alma / "duplicate app" inceleme riski; yayında değilse sorun yok ama temizlenmesi önerilir.

---

## 3. ORTA ÖNCELİKLİ

| # | Bulgu | Detay |
|---|---|---|
| 3.1 | `yonetici_log.txt` Git'te takip ediliyor | Kullanıcı UID'leri içeriyor. Repo public ise gizlilik sorunu. `.gitignore`'a eklenip geçmişten çıkarılmalı. |
| 3.2 | `allowBackup="true"` | Kullanıcı/dua verisi Android yedeklemesine dahil olur. Projenin "kutsal metin telefonda saklanmaz" ilkesiyle çelişebilir; `false` yapılması düşünülebilir. |
| 3.3 | Firebase SDK CDN'den yükleniyor | `index.html:40-42` gstatic.com'dan 10.9.0 çekiyor. npm'de firebase 12.x kurulu ama kullanılmıyor gibi. İlk açılış internete bağımlı; versiyon uyumsuzluğu riski. |
| 3.4 | `minifyEnabled false` | Zorunlu değil; AAB boyutunu büyütür. R8 açılması önerilir (Firebase/WebSocket keep-rules gerekirse eklenir). |
| 3.5 | Depo hijyeni | `fix.js`, `patch.js`, `temp_index.html`, `original_index.html`, `load_func.js`, `server.js`, log dosyaları Git'te takip ediliyor. Yayını etkilemez ama karışıklık yaratır. Ayrıca `.gitignore` dosyasının kodlaması bozuk (Türkçe karakterler bozuk görünüyor). |

---

## 4. UYGULAMA DIŞI — Play Console Kontrol Listesi

Yayın için uygulama dışında hazırlanması gerekenler:

- [ ] Gizlilik politikası URL'si (zorunlu)
- [ ] Data Safety formu (Google Sign-In + Firestore verisi beyan edilmeli)
- [ ] Uygulama adı, kısa/açıklama metinleri
- [ ] En az 2 telefon ekran görüntüsü (+7"/10" tablet önerilir)
- [ ] Feature graphic 1024×500
- [ ] 512×512 mağaza ikonu (mevcut: `icon-512.png` ✓)
- [ ] İçerik derecelendirme anketi
- [ ] Hedef kitle & içerik (çocuklara yönelik değil beyanı)
- [ ] Reklam beyanı (uygulamada reklam SDK'sı yok → "reklam içermiyor")
- [ ] Kategori ve iletişim e-postası

---

## 5. İYİ DURUMDA OLANLAR ✓

- **İzinler minimal:** Yalnızca `INTERNET` + `VIBRATE` (Manifest) — incelemeden geçmesi kolay.
- `versionCode`/`versionName` tutarlı; `applicationId` = `com.zikirmatik.pro` her yerde eşleşiyor.
- `strings.xml` içinde `default_web_client_id`, google-services.json web client'ı ile uyumlu (Google Sign-In çalışır).
- Firestore güvenlik kuralları sağlam: owner kontrolü, `onaylandi` statüsü yalnızca Admin SDK ile yazılabilir, misafirler erişemez.
- Service worker yalnızca same-origin cache'liyor; üçüncü taraf alan adları hariç tutulmuş.
- `http://` güvensiz istek tespit edilmedi; ikon boyutları doğru (512×512, 192×192).

---

## 6. ÖNERİLEN YAYIN SIRASI (özet)

1. Keystore oluştur → `signingConfig` ekle → yeni SHA-1'i Firebase Console'a ekle.
2. `npx cap sync android` ile varlıkları güncelle (KRİTİK 1.2).
3. targetSdk/compileSdk 36'ye çıkar (31 Ağustos sonrası zorunlu).
4. MainActivity'deki UA manipülasyonunu kaldır (2.2).
5. `bundleRelease` ile AAB üret, cihazda test et (Google giriş + offline davranış).
6. Data Safety formu + gizlilik politikası sayfasını hazırla.
7. Mağaza varlıklarını tamamlayıp gönderim yap.
