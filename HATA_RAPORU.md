# Zikirmatik Pro — Depolama Denetimi ve Hata Raporu (2026-08-29)

## Kural Özeti
- GitHub'dan yüklenen dualar ve Firebase'deki kişisel dualar telefonda **kalıcı olarak saklanamaz** (dini hassasiyet).
- Renk/tema/görünüm ayarları, istatistikler ve sayaç ilerlemesi telefonda **kalıcı olarak saklanmalı**.

---

## TESPİT EDİLEN HATALAR

### 🔴 H1 — İstatistik silinmesinin KÖK NEDENİ: `itemStats` her açılışta sıfırlanıyordu
- **Yer:** `load()` içindeki telefon yedeği birleştirme bloğu.
- **Hata:** `existing.itemStats = mergeMax(existing.itemStats, bkList.itemStats)`
- `mergeMax` her anahtara `Math.max(Number(...))` uygular; `itemStats` değerleri ise
  `{duaId: sayı}` **nesneleri**dir. Nesneler `Number()` ile 0'a indirilir ve her gün
  `0` ile ezilirdi. Uygulama her açıldığında gün bazlı dua istatistikleri yok olur,
  ilk kayıtta bozuk hali kalıcı depoya (localStorage + native dosya) yazılırdı.
- **Düzeltme:** Tarih bazlı birleştirme:
  `exItemStats[dateKey] = mergeMax(exItemStats[dateKey] || {}, bkItemStats[dateKey])`
- **Durum:** ✅ Düzeltildi, test edildi.

### 🔴 H2 — GitHub duaları kalıcı hafızaya yazılıyordu (GİZLİLİK İHLALİ)
- **Yer:** `load()` arka plan ağ güncellemesi.
- **Hata:** `localStorage.setItem("GITHUB_CACHE", JSON.stringify(data))` — GitHub'dan
  indirilen **tüm dua metinleri/anlamları/Arapça metinler** localStorage'a (kalıcı
  hafıza) yazılıyor ve bir sonraki açılışta oradan okunuyordu.
- **Düzeltme:**
  - Yazma ve okuma tamamen kaldırıldı. Dualar artık yalnızca RAM'de tutulur, her
    açılışta ağdan yüklenir (offline ise 10 sn'de bir otomatik yeniden dener).
  - `clearLocalStateCache()` açılışta eski sürümlerden kalan `GITHUB_CACHE`
    kalıntısını siler (tek seferlik temizlik).

### 🔴 H3 — Bulut listesinin tam metni `zikir_app_data`'ya sızdı (GİZLİLİK İHLALİ)
- **Yer:** `prepareMinimalStateForSaving()`.
- **Hata:** `state.selectedSharedList` (tam dua metinli bulut liste nesnesi)
  kayıttan çıkarılmıyordu → localStorage'a tam metin yazılabiliyordu.
- **Düzeltme:** `delete clone.selectedSharedList;` eklendi.

### 🟠 H4 — Bayat native AYAR dosyası güncel ayarları eziyordu
- **Yer:** `restoreSettingsFromNativeStorage()`.
- **Hata:** Karşılaştırma yoktu; native dosya **her zaman** localStorage'ı eziyordu.
  Uygulama kapanmadan son 10 sn içinde seçilen renk/tema/font bir sonraki açılışta
  geri alınıyordu.
- **Düzeltme:** Ayar kaydına `savedAt` damgası eklendi; native yedek yalnızca
  yereldekinden **daha yeni**yse (veya yerelde kayıt yoksa) uygulanır. Damgasız
  eski dosya güncel ayarları ezemez.

### 🟠 H5 — Damgasız native İSTATİSTİK dosyası güncel sayaçları eziyordu
- **Yer:** `restoreProgressFromNativeStorage()`.
- **Hata:** Native dosyada `savedAt` yoksa yerel veri koşulsuz eziliyordu.
- **Düzeltme:** Native yedek yalnızca damgalı ve yereldekinden yeniyse uygulanır;
  aksi halde telefondaki güncel veri korunur.

### 🟡 H6 — `readerMode` (Okuma Modu) kaydedilmiyordu
- `saveAppSettingsToPhone` / `loadAppSettingsFromPhone` listesinde yoktu → her
  açılışta sıfırlanıyordu. ✅ Eklendi.

### 🟡 H7 — Ana ekran (Sade Sayaç) zikirleri istatistik ekranında görünmüyordu
- `openStats()` sistem listelerini tabloya dahil etmiyor; Bugün/Toplam kartları da
  Sade Sayaç zikirlerini saymıyordu → kullanıcı ana ekranda zikir çekse bile
  istatistikler 0 görünüyordu ("istatistikler siliniyor" algısının ikinci kaynağı).
- **Düzeltme:** Sade Sayaç günlük toplamları Bugün/Toplam kartlarına dahil edildi
  (tablo satırı olarak değil).

### 🟡 H8 — Açılışta tema/okuma modu uygulanmıyordu + ölü anahtar
- Head'deki flicker-önleme script'i **hiç dolmayan eski** `zikir_app_settings`
  anahtarını okuyordu. ✅ `zikir_app_ui_settings` okunacak ve tüm CSS değişkenleri
  (font, renk, tema) ilk boyamadan önce uygulanacak şekilde yeniden yazıldı.
- `load()` akışına `applyTheme()` ve `applyReaderMode()` çağrıları eklendi.

---

## DOĞRULANANLAR (sorun yok)
- `sw.js` yalnızca kendi alan adının kabuk dosyalarını cache'ler; Firebase/GitHub
  yanıtları asla cache'lenmez. ✅
- Kişisel (Firebase) dualar yalnızca `window.cachedPrivatePrayers` içinde **RAM'de**
  tutulur; kalıcı yazılmaz. ✅
- Kullanıcı yedeği (`buildListBackup`) yalnızca ID + adet + istatistik içerir, dua
  metni içermez. ✅
- `serviceAccountKey.json` ve `google-services.json` `.gitignore`'da, git'e ekli değil. ✅
- Telefon bırakıldığında dualar RAM'den temizleniyor (purge), konum yalnızca
  ID + sayaç olarak saklanıyor. ✅

## YEREL TEST SONUCU
- `node test_persistence.js` → **25/25 BAŞARILI** (öncesi: 13 başarılı, 12 başarısız).
- Tarayıcı (http://localhost:5500) uçtan uca test:
  - 5 zikir çekildi → `zikir_progress_v2`'de `stats`, `itemStats`, `timeStats` yazıldı.
  - Sayfa yenilendi (yeniden başlatma simülasyonu) → istatistikler **korundu**,
    `itemStats` bozulmadı.
  - `GITHUB_CACHE` hiç oluşmadı; localStorage'da dua metni bulunmadı.
  - Ayar dosyasında `savedAt` damgası üretildi.
  - "Kaldığınız yerden devam" akışı verileri doğru geri yükledi.

### 🟡 H9 — Telefon ele alınınca dualar kendiliğinden geri gelmiyordu (2026-08-29 ek düzeltme)
- **Davranış:** Telefon düz zemine bırakılınca 3 sn sonra 10 sn'lik iptal penceresi
  başlıyor, süre bitince dualar RAM'den temizleniyor. Ancak telefon tekrar ele
  alındığında dualar ancak bir tuşa basınca geliyordu; ayrıca geri sayım sürerken
  telefon kaldırılsa bile temizlik devam ediyordu.
- **Düzeltme:**
  - Sensör (`deviceorientation`) "telefon ele alındı" sinyalini algılayınca:
    bekleyen temizlik geri sayımı **otomatik iptal edilir**; temizlik zaten
    yapıldıysa dualar **hiçbir tuşa basmadan** ~0.5 sn içinde ağdan geri yüklenir.
  - 500 ms debounce + başarısız deneme için 3 sn soğuma (sensör saniyede çok kez
    tetiklenir, ağ rahatsız edilmez).
  - Sensör kullanılamazsa herhangi bir dokunuş da geri yükler (yedek yol).
- **Test (sentetik sensör olaylarıyla):** bırakma → uyarı çıktı ✓; geri sayımda
  ele alma → uyarı iptal ✓; temizlik gerçekleşti ✓; ele alma (dokunuşsuz) →
  dualar otomatik geri geldi ✓.

## EK ÖZELLİK — Eğim ile Otomatik Kaydırma butonu (2026-08-29)
- **Durum:** Tilt-to-scroll kodu kaynakta zaten mevcuttu ancak hiçbir butona/gesty'e
  bağlı olmadığı için **ulaşılamaz ölü kod** durumundaydı.
- **Yapılan:** Üst barın sağ üsteye, menü butonunun yanına kalıcı aç/kapat düğmesi
  eklendi (`#tiltScrollBtn`, `toggleTiltScroll()`'a bağlı). Açıkken buton yeşile
  döner; üst bar gizlendiğinde buton da kendiliğinden gizlenir (okuma modu dahil).
- **Kullanım:** Uzun dua okurken düğmeye bir kez basın → telefon açısını
  kalibre eder ("📱 Kalibrasyon tamam – eğin!") → telefonu öne/geriye eğdikçe
  dua metni otomatik kayar (±3° ölü bölge, 20°'de azami hız). Tekrar basınca kapanır.
- **Test:** Gerçek dua açıkken sentetik sensör olaylarıyla doğrulandı: öne eğimde
  metin kaydırma alanının sonuna kadar indi, geriye eğimde başa döndü, aç/kapat
  durumu ve buton rengi doğru çalıştı.

## DERLEME
- `index.html` → `www/index.html` senkronize edildi, `npx cap sync android` +
  `gradlew assembleDebug` ile APK üretildi.
