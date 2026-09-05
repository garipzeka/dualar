# Google Drive Bulut Yedeği — Kurulum ve Çalışma Mantığı

## Ne yapıldı (2026-08-29)

- **Cihaz yedeği** (eskiden beri var): `Yedekle` penceresindeki "Cihaz İçi Otomatik Yedekleme"
  GÜNLÜK/HAFTALIK seçilince `Belkiler/zikirmatik_otomatik_yedek.json` (DOCUMENTS) dosyasına yazılır.
- **YENİ — Google Drive yedeği**: Liste/istatistik/ayar yedeği, kullanıcının **kendi Google Drive** hesabındaki
  gizli uygulama klasörüne (`appDataFolder`) yazılır. Kullanıcının Drive'ında dosya görünmez, başka hiçbir
  uygulama okuyamaz; yalnızca bu uygulama erişir (`drive.appdata` yetkisi).
- Yedek içeriği `buildListBackup()` ile aynıdır: liste adları + dua ID'leri + hedefler + istatistikler +
  görünüm ayarları. **Dua metinleri asla içermez** (gizlilik ilkesi değişmedi).
- **Tek hesap akışı**: Firebase (kişisel dualar) girişi yapıldığında bulut yedeği açık fakat Drive bağlı
  değilse Drive izni otomatik istenir; tersinde Drive bağlandığında Firebase girişi otomatik başlar.
- **Satır aralığı**: Dua okuma satır aralığı varsayılanı 1.6 → 1.4'e düşürüldü; ayarlardaki kaydırıcı
  artık 0.8'e kadar inebiliyor. Eski varsayılan (1.6) kayıtlı kullanıcılar bir kereliğine 1.4'e taşınır;
  kullanıcı kendi seçtiği farklı bir değer kaydettiyse o korunur.

## Dosyalar

| Yer | Değişiklik |
|---|---|
| `index.html` | Drive yedeği JS modülü (PKCE OAuth, yükle/geri yükle, otomatik zincir), yedek penceresi arayüzü |
| `www/index.html` | index.html'nin birebir kopyası (APK web varlıkları) |
| `android/app/src/main/AndroidManifest.xml` | OAuth yönlendirme şeması intent-filter'ı |
| `android/variables.gradle` | `androidxBrowserVersion = '1.8.0'` (1.9.0 AGP 8.9.1+ istediği için sabitlendi) |
| `package.json` | `@capacitor/app` + `@capacitor/browser` eklentileri eklendi |

Not: `@capacitor/app` kurulumuyla birlikte APK'da daha önce **hiç yüklenmemiş olan** geri tuşu
(`backButton`) ve arka plana geçişte kayıt (`appStateChange` → `flushPendingCloudSave`) dinleyicileri de
artık gerçekten çalışır hale geldi.

## Yayına çıkmadan önce yapılması GEREKENLER (Google Cloud / Firebase konsolu)

Proje: `zikirmatik-7d7d4` — Android OAuth client: `765011064176-2kumhec7dpnnphfr21vr80qiboiohtf5`
(paket: `com.zikirmatik.pro`)

1. **Drive API'yi etkinleştir**: console.cloud.google.com → APIs & Services → Library →
   "Google Drive API" → Enable. (Etkin değilse izin ekranı/yükleme hata verir.)
2. **OAuth consent screen'i "In production" yap** (Publish). Aksi halde uygulama *Testing* modunda
   kalır ve Google, refresh token'ı **7 günde bir geçersiz kılar** → otomatik yedek bağlantısı kopar.
   - `drive.appdata` "restricted scope"tur; doğrulanmamış uygulamada kullanıcılar
     "Geliştirilmemiş uygulama" uyarısı görür → "Gelişmiş → Uygulamaya git (güvensiz)" ile ilerler.
     Kendi kullanımınız/küçük kullanıcı grubu için bu uyarı bir kez görülür ve sorunsuz ilerlenir.
3. Debug APK imzalama SHA-1'i Firebase'de kayıtlı olmalı (kişisel dualar girişi zaten çalıştığına göre
   kayıtlıdır; yeni bir şey eklemeye gerek yoktur).

## Çalışma mantığı

- **Sürümlü yedek (2026-08-30):** Her yedek, gizli klasörde AYRI bir dosyadır
  (`zikirmatik_yedek_YYYY-AA-GG_SSDD.json`). "📋 Bulut Yedeklerini Görüntüle" ekranı tüm
  yedekleri tarih sırasıyla listeler; her yedek için 👁 görüntüle (özet + ham içerik, istenirse
  uygula) ve 🗑 sil düğmesi vardır. **Son 10 timestamped yedek otomatik korunur**, eskiler
  her yeni yedekte silinir. Eski tekil `zikirmatik_yedek.json` dosyası listede görünür ve
  elle silinebilir.
- Zamanlama: uygulama açılışından 2 sn sonra + her ön plana dönüşte (`resume`) kontrol edilir.
  GÜNLÜK = 24 saatte bir, HAFTALIK = 7 günde bir (cihaz yedeğiyle aynı kural).
- Bağlantı: PKCE + S256 ile Chrome Custom Tabs üzerinden Google izni; refresh token cihazda
  (ayarlarla birlikte) saklanır, erişim token'ı otomatik yenilenir.
- "Bağlantıyı Kes": refresh token'ı Google tarafında da iptal eder (revoke) ve cihazdan siler.

## Kişisel Dualar — yeni gizlilik mimarisi (2026-08-29, aynı gün eklendi)

- Dua **içeriği** artık kullanıcının kendi Drive'ındaki gizli klasörde ikinci bir dosyada tutulur:
  `appDataFolder/zikirmatik_kisisel_dualar.json`. Telefonda kalıcı olarak SAKLANMAZ (yalnızca RAM).
- **Firebase'e yalnızca kullanıcı duayı DEPOSU ile paylaşmak istediğinde yazılır**
  ("Toplulukla Paylaş" → `custom_prayers` dokümanına tam içerik + status 'bekliyor').
  Admin onaylar → mevcut zincirle GitHub deposuna (dualar.json) düşer.
- Admin durumları (onaylandı/reddedildi/bekliyor), paylaşılan kopyaların Firestore
  dokümanlarından **yalnızca-DURUM olarak** okunup Drive kopyasına işlenir.
- "Özel Dua Ekle" artık otomatik paylaşım yapmaz; dua Drive'a yazılır, paylaşım ayrı adımdır.
- **Tek seferlik taşıma**: Drive ilk bağlandığında kullanıcının eski Firestore kişisel duaları
  Drive'a KOPYALANIR; ardından yalnızca 'private'/'reddedildi' dokümanları Firebase'den silinir
  ('bekliyor' ve 'onaylandı' paylaşım kayıtları moderasyon için kalır). Hesap başına bir kez
  çalışır (`drivePrivMigratedFor` işaretiyle).
- Paylaşım için Google girişi (uid) gereklidir; kişisel duaları eklemek/okumak için yalnızca
  Drive bağlantısı yeterlidir. Tek hesap akışı ikisini birbirine otomatik zincirler.

## Bilinen sınırlar

- Tarayıcı (PWA) sürümünde Drive yedeği kapalıdır; yalnızca telefon uygulamasında çalışır
  (web'de özel şema yönlendirmesi olmadığından Google izin akışı tamamlanamaz).
- Zamanlanmış yedek yalnızca uygulama açıldığında/ön plana geldiğinde çalışır
  (arka plan servisi yoktur — cihaz yedeğiyle aynı davranış).
