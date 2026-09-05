# Edge-to-Edge / Çentik Test Kontrol Listesi

Amaç: Uygulamaya eklenen safe-area düzeltmelerini (üst, alt, sol/sağ inset'ler) **çentikli bir cihazda**,
**hem jest hem 3 butonlu navigasyon** modlarında, **dikey ve yatay** yönelimlerde doğrulamak.

Etkilenen dosyalar (hepsi aynı içerikte olmalı):

- `index.html` (kaynak)
- `www/index.html` (`cap sync`'in paketlediği sürüm)
- `android/app/src/main/assets/public/index.html` (APK içindeki kopya — `www` ile birebir)

> **Doldurulabilir CSV sürümleri** (Excel / Google E-Tablolar'da açılır, UTF-8 BOM + `;` ayracı):
> - `SAFE_AREA_TEST_MATRISI.csv` — senaryo × kombinasyon özet matrisi; her kombinasyon için **Geçti/Kaldı** ve **Ekran Görüntüsü Notu** sütunu.
> - `SAFE_AREA_TEST_DETAY.csv` — her kontrol noktası (A1–G3) için **Geçti/Kaldı**, **Ekran Görüntüsü Notu** ve **Sorun/Yorum** alanları.
> - `SAFE_AREA_TEST_HAZIRLIK.csv` — derleme, cihaz hazırlığı ve son kontrol adımlarının takibi.

---

## 1) Yeniden derleme

- [ ] 1.1 `index.html` ile `www/index.html` senkron: `cp index.html www/index.html` **yerine** dikkat —
      iki dosya **yalnızca Firebase yapılandırması bakımından** farklıdır. Elle kopyalarsanız Android
      Firebase ayarını ezmeyin; normal akışta `www/index.html` zaten günceldir (değişiklikler üç dosyaya da uygulandı).
- [ ] 1.2 `npx cap sync android` komutunu çalıştırın (veya `build_apk.bat` bunu otomatik yapar).
      Çıktıda `Copying web assets...` adımı hata vermemeli.
- [ ] 1.3 Doğrulama: `android/app/src/main/assets/public/index.html` ile `www/index.html` içerikleri
      birebir aynı olmalı:
      ```bash
      cmp -s www/index.html android/app/src/main/assets/public/index.html && echo OK
      ```
- [ ] 1.4 `build_apk.bat` çalıştırın.
      Çıktı APK: `android\app\build\outputs\apk\debug\app-debug.apk`
- [ ] 1.5 APK sürümünün güncel olduğunu doğrulayın (dosya tarihi / versionCode).

## 2) Cihaz hazırlığı

- [ ] 2.1 **Çentikli cihaz**: gerçek telefon (örn. Pixel 7/8, Samsung Galaxy S22+, çentik/delik kameralı)
      veya çentik görünümüne sahip bir emülatör.
      Emülatörde: AVD'yi çentikli cihaz profiliyle (örn. Pixel) oluşturun; emülatör açıkken
      **Developer options → Display cutout → "Corner cutout" / "Double cutout"** ile de simüle edebilirsiniz.
- [ ] 2.2 **Developer options + USB hata ayıklama** açık (Ayarlar → Telefon hakkında → Derleme numarasına 7 kez dokunun).
- [ ] 2.3 APK'yı kurun: `adb install -r android\app\build\outputs\apk\debug\app-debug.apk`
      (veya APK dosyasını telefona aktarıp "Bilinmeyen kaynaklara izin ver" ile kurun).
- [ ] 2.4 **Navigasyon modunu değiştirme yolu**: Ayarlar → Sistem → Jestler → Sistem navigasyonu →
      **Jest navigasyonu** veya **3 butonlu navigasyon**. (Mod değişikliğinden sonra uygulamayı yeniden açın.)
- [ ] 2.5 Test defterine not alın: cihaz modeli, Android sürümü, ekran çözünürlüğü, test tarihi.

## 3) Test matrisi

Her senaryoyu sırayla şu kombinasyonlarda yapın:

| # | Senaryo | Jest + Dikey | 3-Buton + Dikey | Jest + Yatay (2 yön) | 3-Buton + Yatay |
|---|---------|:---:|:---:|:---:|:---:|
| A | Ana zikir ekranı | ☐ | ☐ | ☐ | ☐ |
| B | Okuma / tam ekran modu | ☐ | ☐ | ☐ | ☐ |
| C | Sade Sayaç | ☐ | ☐ | ☐ | ☐ |
| D | Listelerim / Dua Deposu modalı | ☐ | ☐ | ☐ | ☐ |
| E | Alttan paneller (Görünüm, Genel, İstatistik) | ☐ | ☐ | ☐ | ☐ |
| F | Tanıtım ekranı + Giriş ekranı | ☐ | ☐ | ☐ | ☐ |
| G | Klavye açıkken formlar | ☐ | ☐ | ☐ | ☐ |

### A — Ana zikir ekranı
- [ ] Başlık çubuğu (logo + sağ üst butonlar) durum çubuğuyla **çakışmıyor** (çentiğin altından başlıyor).
- [ ] Büyük mavi zikir butonu (`.tap-btn`) alt sistem navigasyon çubuğunun **tamamen üzerinde**;
      jest çubuğu veya 3 buton butonların üzerine binmiyor.
- [ ] Alt boşluk jest modunda ~20px+inset, 3 buton modunda en az çubuk kalınlığı kadar.
- [ ] Sağ/sol kenar içerikleri (dikeyde) köşelerden taşmıyor.
- [ ] Yatayda: başlık ve sayaç içeriği çentik tarafındaki **yan** kesimden içeride.

### B — Okuma / tam ekran modu (dua okuma + okuma modu)
- [ ] "Okuma Modu" açıldığında üst içerik durum çubuğunun altından başlıyor (`.reader-mode` üst payı).
- [ ] Okunan metin alt navigasyon çubuğuna girmeden kaydırılabiliyor; **son satır tamamen görünür**.
- [ ] "✖ Çık" ve yukarı kaydırma butonları çentik/navigasyon bölgesine girmiyor.
- [ ] Yatayda Arapça/metin uzun satırları **yan çentik** altında kalmıyor (sol/sağ inset).

### C — Sade Sayaç
- [ ] Kartın üst kısmı durum çubuğuyla çakışmıyor.
- [ ] "📿 ZİKİR ÇEK" butonu ve alt boşluk navigasyon çubuğu üzerinde.
- [ ] Yatayda kart sol/sağ kenarları çentikten içeride.

### D — Listelerim / Dua Deposu (modal)
- [ ] Sekme çubuğu (Listelerim / Dua Deposu) ve kapatma butonları üstte tam görünür.
- [ ] En alttaki liste öğesi / "Ekle" butonu navigasyon çubuğunun altına girmeden kaydırılabiliyor.
- [ ] Modal içeriği küçük ekranda **üstten** kaydırılabilir (üst kısım kesilmiyor).

### E — Alttan açılan paneller (Görünüm Ayarları, Genel Ayarlar, İstatistik)
- [ ] Panelin son öğesi (örn. kaydırıcı/buton) çubuğun üzerinde kalıyor; içerik kaydırılabiliyor.
- [ ] Yatayda panel içeriği yan çentikten içeride; panel köşeleri kesilmiyor.

### F — Tanıtım ekranı + Giriş ekranı
- [ ] Tanıtımda sağ üst **"Atla"** butonu durum çubuğuyla çakışmıyor (çentik altına iniyor).
- [ ] "Devam Et" butonu alt navigasyon çubuğunun üzerinde.
- [ ] Giriş ekranı kartı her iki navigasyon modunda da tam görünür (üst/alt paylar yeterli).

### G — Klavye açıkken formlar (küçük ekran testi)
- [ ] **Dua Deposu → Dua Ekle**: en alttaki alana (Kaynak / Hedef) dokununca klavye alanı **örtmüyor**;
      form kaydırılarak erişilebiliyor.
- [ ] **Dua Düzenle** (5 alan) modalında aynı kontrol.
- [ ] Ekran yüksekliği küçükken (~600px altı / yatay mod) form boşlukları sıkılaşıyor ve alanlar görünüyor.

## 4) Son kontrol

- [ ] 4.1 Uygulamayı kapatıp yeniden açın; safe-area değerleri ilk açılışta da doğru (env değerleri gecikmeli gelmez).
- [ ] 4.2 Ekran görüntüleri alın (her kombinasyon için en az 1): `Power + Ses kısma`.
- [ ] 4.3 Sonuç özeti: kalan sorunları **HATA_RAPORU.md**'ye veya test notuna işleyin
      (cihaz + navigasyon modu + ekran + ekran görüntüsü ile).

## 5) Sorun giderme notları

| Belirti | Olası neden / çözüm |
|---|---|
| Alt boşluk hiç uygulanmıyor | `viewport-fit=cover` eksik olabilir; meta etiketi kontrol edin (mevcut). |
| Çentik tarafında boşluk yok | Çok eski WebView yalnızca üst/alt inset döndürebilir → Java tarafında `WindowInsets`/`DisplayCutout` okuyup CSS değişkeni enjekte eden yerel çözüm ekleyin. |
| Sadece belirli yönelimde boşluk yok | `env(safe-area-inset-left/right)` her yönelimde ayrı değer alır; sol/sağ eklenmiş katmanları yeniden kontrol edin. |
| Klavye formu örtüyor | Capacitor 8 klavyede WebView'i küçültür; eski WebView'de `visualViewport.resize` + `scrollIntoView` JS yedeği gerekebilir. |
