/**
 * Zikirmatik bulut yardımcısı — Cloudflare Worker
 *
 * Beş iş yapar:
 *   1) GET /dualar.json                → GitHub'daki dualar verisini yayınlar (mevcut davranış)
 *   2) GET /dualar2.json               → Kur'an-ı Kerim verisini yayınlar (ayrı dosya; /kuran.json da çalışır — eski APK uyumu)
 *   3) GET /ses/{bitrate}/{kari}/{no}.mp3 → Kur'an tilavetini proxy'ler
 *   4) GET /zikir/{dosya}.mp3          → zikir/Esma-ül Hüsna kliplerini proxy'ler (beyaz liste)
 *   5) GET /sure/{sure}.mp3            → bütün sure yedek kaynağı (Maher 256k; ayna zinciri)
 *
 * 🔴 NEDEN PROXY?
 * cdn.islamic.network iki şey yapıyor:
 *   - CORS başlığı (Access-Control-Allow-Origin) GÖNDERMİYOR → tarayıcı baytları
 *     okuyamıyor, yalnızca <audio src> ile çalınabiliyor.
 *   - "cache-control: max-age=6048000" (70 GÜN) veriyor → <audio src> ile çalınınca
 *     mp3, Android WebView'in DİSK önbelleğine yazılıyor.
 * Bu, "kutsal ses telefona asla kaydedilmez" ilkesini ihlal eder.
 *
 * Bu proxy sesi sunucu tarafında çeker ve "no-store" ile döndürür. Böylece uygulama
 * sesi fetch ile indirip YALNIZCA RAM'de tutabilir; cihaza hiçbir iz kalmaz.
 *
 * Kurulum: SES_PROXY_KURULUMU.md
 */

const DUALAR_KAYNAK = 'https://raw.githubusercontent.com/garipzeka/dualar/main/dualar.json';
// Kur'an verisi ayrı dosyada durur (dualar.json'a dokunulmaz).
const KURAN_KAYNAK = 'https://raw.githubusercontent.com/garipzeka/dualar/main/dualar2.json';
const SES_CDN = 'https://cdn.islamic.network/quran/audio/';

// YEDEK SES AYNASI: everyayah.com — ayet ayet dosyalar (sure3+ayet3.mp3 düzeni).
// islamic.network'in kaynağı kâri bazında bozulabiliyor (bazı kârilerde 502 /
// askıda kalma); bu durumda tilavet aynadan akıtılır. Ayna yalnızca birincil
// yanıt vermezse denenir ve hiçbir katmanda önbelleklenmez (no-store aynen).
const SES_AYNA_KAYNAK = 'https://everyayah.com/data/';
const SES_AYNA_KARILER = {
    'ar.alafasy': 'Alafasy_128kbps',
    'ar.husary': 'Husary_128kbps',
    'ar.minshawi': 'Minshawy_Murattal_128kbps',
    'ar.mahermuaiqly': 'MaherAlMuaiqly128kbps',
    'ar.ahmedajamy': 'Ahmed_ibn_Ali_al-Ajamy_128kbps_ketaballah.net',
    'ar.hudhaify': 'Hudhaify_128kbps',
    'ar.muhammadayyoub': 'Muhammad_Ayyoub_128kbps'
};
// Sure başına ayet sayıları — global ayet numarasını sure/ayet'e çevirmek için
// (CDN dosya adı global numara, ayna dosya adı sure3+ayet3 basamaklıdır).
const SURE_AYET_SAYILARI = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6];

function sureAyetten(globalAyet) {
    if (!(globalAyet >= 1)) return null;
    for (let s = 1; s <= 114; s++) {
        const adet = SURE_AYET_SAYILARI[s - 1];
        if (globalAyet <= adet) return [s, globalAyet];
        globalAyet -= adet;
    }
    return null;
}
const pad3 = (x) => String(x).padStart(3, '0');

// Açık proxy kötüye kullanımını engellemek için yalnızca bu değerler geçirilir.
// Uygulamadaki AUDIO_KARILER listesiyle aynı olmalıdır.
const IZINLI_KARILER = new Set([
    'ar.alafasy',
    'ar.husary',
    'ar.minshawi',
    'ar.mahermuaiqly',
    'ar.ahmedajamy',
    'ar.hudhaify',
    'ar.muhammadayyoub'
]);
const IZINLI_BITRATE = new Set(['128']);

// Kutsal ses hiçbir katmanda saklanmasın: hem tarayıcı hem CDN kenarında "no-store".
const NO_STORE = 'no-store, no-cache, must-revalidate, max-age=0';

function cors(ekBasliklar = {}) {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Type',
        'Access-Control-Max-Age': '86400',
        'X-Robots-Tag': 'noindex, nofollow',
        ...ekBasliklar
    };
}

function json(govde, durum = 200) {
    return new Response(JSON.stringify(govde), {
        status: durum,
        headers: cors({
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': NO_STORE
        })
    });
}

/** /dualar.json — mevcut yayın davranışı korunur. */
async function dualarJson() {
    const yanit = await fetch(DUALAR_KAYNAK, { cf: { cacheTtl: 60, cacheEverything: true } });
    if (!yanit.ok) return json({ hata: 'Kaynak alınamadı', durum: yanit.status }, 502);
    const govde = await yanit.text();
    try {
        JSON.parse(govde); // bozuk JSON yayınlanmasın
    } catch (_) {
        return json({ hata: 'Kaynak geçersiz JSON' }, 502);
    }
    return new Response(govde, {
        headers: cors({
            'Content-Type': 'application/json; charset=utf-8',
            // Yayındaki eski sürüm böyle dönüyordu; üzerine yazınca davranış değişmesin.
            'Cache-Control': 'public, max-age=60, s-maxage=60'
        })
    });
}

/** /dualar2.json — Kur'an-ı Kerim verisi (ayrı dosya, ~3 MB). /kuran.json aynı veriye yönlendirilir (eski APK uyumu).
 *  Kenarda (Cloudflare) 5 dk önbelleklenir; İSTEMCİYE "no-store" döner:
 *  kutsal metin cihazın disk önbelleğine asla yazılmaz, her açılışta ağdan gelir. */
async function kuranJson() {
    const yanit = await fetch(KURAN_KAYNAK, { cf: { cacheTtl: 300, cacheEverything: true } });
    if (!yanit.ok) return json({ hata: 'Kaynak alınamadı', durum: yanit.status }, 502);
    const govde = await yanit.text();
    try {
        JSON.parse(govde); // bozuk JSON yayınlanmasın
    } catch (_) {
        return json({ hata: 'Kaynak geçersiz JSON' }, 502);
    }
    return new Response(govde, {
        headers: cors({
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': NO_STORE
        })
    });
}

/** Ses dosyasını sunucu tarafında çeker ve "no-store" ile akıtır
 *  (tilavet ve zikir klipleri için ortak yol). adaylar sıralı denenir:
 *  ilk başarılı kaynak akıtılır (tilavette birincil CDN + yedek ayna). */
async function sesAkisi(adaylar, request, kaynakAdi) {
    // İstemciden gelen Range varsa geçir (ileri sarma); yoksa tam dosya iner.
    const istekBasliklari = {};
    const range = request.headers.get('Range');
    if (range) istekBasliklari['Range'] = range;

    let sonDurum = 0;
    for (const hedef of adaylar) {
        let kaynakYanit;
        try {
            kaynakYanit = await fetch(hedef, {
                headers: istekBasliklari,
                // Kenar önbelleğini kapat: kutsal ses kenarda da birikmesin.
                cf: { cacheEverything: false, cacheTtl: 0 }
            });
        } catch (_) {
            continue;   // bu kaynağa ulaşılamadı: sıradaki aday denenir
        }
        if (!kaynakYanit.ok) { sonDurum = kaynakYanit.status; continue; }

        // Gövde akış olarak geçirilir; hiçbir yerde saklanmaz.
        // 206 yanıtlarında Content-Range/Content-Length istemciye taşınmalıdır:
        // bütün sure dosyaları büyük, ileri sarma bu başlıklara bağlı.
        const yanitBasliklari = cors({
            'Content-Type': 'audio/mpeg',
            'Cache-Control': NO_STORE,
            'Content-Disposition': 'inline',
            'Accept-Ranges': 'bytes'
        });
        const icerikAraligi = kaynakYanit.headers.get('Content-Range');
        if (icerikAraligi) yanitBasliklari['Content-Range'] = icerikAraligi;
        const icerikUzunlugu = kaynakYanit.headers.get('Content-Length');
        if (icerikUzunlugu) yanitBasliklari['Content-Length'] = icerikUzunlugu;
        return new Response(request.method === 'HEAD' ? null : kaynakYanit.body, {
            status: kaynakYanit.status,
            headers: yanitBasliklari
        });
    }
    return json({ hata: kaynakAdi + ' kaynaklarından alınamadı', durum: sonDurum }, sonDurum === 404 ? 404 : 502);
}

/** /ses/{bitrate}/{kari}/{no}.mp3 — tilavet proxy'si, asla önbelleğe alınmaz. */
async function sesProxy(request) {
    const yol = new URL(request.url).pathname;
    const parcalar = yol.split('/').filter(Boolean); // ['ses', bitrate, kari, 'n.mp3']
    if (parcalar.length !== 4) {
        return json({ hata: 'Beklenen yol: /ses/{bitrate}/{kari}/{no}.mp3' }, 400);
    }
    const [, bitrate, kari, dosya] = parcalar;

    if (!IZINLI_BITRATE.has(bitrate)) return json({ hata: 'Desteklenmeyen kalite' }, 403);
    if (!IZINLI_KARILER.has(kari)) return json({ hata: 'Desteklenmeyen kâri' }, 403);
    if (!/^\d{1,4}\.mp3$/.test(dosya)) return json({ hata: 'Geçersiz ayet numarası' }, 400);

    // Birincil: islamic.network CDN. Yedek: everyayah aynası — birincilin kaynağı
    // kâri bazında bozulduğunda (502/askıda) istek aynadan karşılanır. Ayna dosya
    // adı sure3+ayet3 basamaklı olduğu için global ayet numarası çevrilir.
    const adaylar = [SES_CDN + bitrate + '/' + kari + '/' + dosya];
    const aynaKlasoru = SES_AYNA_KARILER[kari];
    if (aynaKlasoru) {
        const konum = sureAyetten(parseInt(dosya, 10));
        if (konum) adaylar.push(SES_AYNA_KAYNAK + aynaKlasoru + '/' + pad3(konum[0]) + pad3(konum[1]) + '.mp3');
    }
    return sesAkisi(adaylar, request, 'Tilavet');
}

// ── Zikir/Esma klipleri (/zikir/{dosya}) ─────────────────────────────
// Açık proxy değildir: yalnızca aşağıdaki beyaz listeye uyan dosyalar sunulur.
// Esma-ül Hüsna kaynağı: github.com/soachishti/Asma-ul-Husna — README'de BSD
// tarzı lisans: kaynak ve binary formda atıf şartıyla dağıtım serbest.
// Atıf metni ve detaylar: SES_KAYNAKLARI.md
const ZIKIR_DESENLER = [
    // esma-1.mp3 .. esma-99.mp3 → repodaki audio/1.mp3 .. audio/99.mp3
    {
        desen: /^esma-([1-9][0-9]?)\.mp3$/,
        kaynak: (es) => 'https://raw.githubusercontent.com/soachishti/Asma-ul-Husna/master/audio/' + parseInt(es[1], 10) + '.mp3'
    }
];
// İleride eklenecek tekil zikir klipleri için açık liste (dosya adı → kaynak URL):
const ZIKIR_DOSYALAR = {
    // Namaz duaları (Sübhaneke, Tahiyyat, Salavat-ı İbrâhîmiye, Kunut, Rabbenâ
    // Âtinâ, Amentü) — dinimizislam.com (Hakikat Kitabevi) "sesli namaz
    // öğrenme" kayıtları. Kaynak/atıf notu: SES_KAYNAKLARI.md §2.
    'namaz-subhaneke.mp3': 'https://dinimizislam.com/Download/Ses/SualCevap/Subhaneke.mp3',
    'namaz-ettahiyyatu.mp3': 'https://dinimizislam.com/Download/Ses/SualCevap/Ettehiyyatu.mp3',
    // Tek kayıt iki duayı kapsıyor: Salli + Bârik aynı klipte.
    'namaz-salli-barik.mp3': 'https://dinimizislam.com/Download/Ses/SualCevap/Allahumme_Salli_Allahumme_Barik.mp3',
    // Tek kayıt Kunut 1 + Kunut 2'yi kapsıyor.
    'namaz-kunut.mp3': 'https://dinimizislam.com/Download/Ses/SualCevap/Kunut_Dualari.mp3',
    'namaz-rabbena-atina.mp3': 'https://dinimizislam.com/Download/Ses/SualCevap/Rabbena_Atina.mp3',
    'namaz-amentu.mp3': 'https://dinimizislam.com/Download/Ses/SualCevap/Amentu.mp3'
};

async function zikirProxy(request) {
    const yol = new URL(request.url).pathname;
    const parcalar = yol.split('/').filter(Boolean); // ['zikir', 'dosya.mp3']
    if (parcalar.length !== 2) {
        return json({ hata: 'Beklenen yol: /zikir/{dosya}.mp3' }, 400);
    }
    const dosya = parcalar[1];
    let hedef = Object.prototype.hasOwnProperty.call(ZIKIR_DOSYALAR, dosya) ? ZIKIR_DOSYALAR[dosya] : null;
    if (!hedef) {
        for (const kural of ZIKIR_DESENLER) {
            const es = dosya.match(kural.desen);
            if (es) { hedef = kural.kaynak(es); break; }
        }
    }
    if (!hedef) return json({ hata: 'İzin verilmeyen zikir dosyası' }, 403);
    return sesAkisi([hedef], request, 'Zikir sesi');
}

// ── Bütün sureler (/sure/{sure}.mp3) ─────────────────────────────────
// Maher Al-Muaiqly 256 kbps bütün sure kayıtları. quranicaudio'daki
// 'maher_256' seti (almuaiqly.com'un yayını) ile aynı performanstır;
// /ses/'teki ayet ayet 128k kayıttan FARKLI bir tilavet oturumudur,
// ikisi karıştırılmamalıdır. Sıralama: resmi quranicaudio yayını birincil,
// ardından kendi kopyalarımız — IA item'i TAM 114 dosyalıdır (quranicaudio'da
// 005.mp3 yok). Atıf notu: SES_KAYNAKLARI.md §1b.
const SURE_AYNA_KOK = 'https://download.quranicaudio.com/quran/maher_256';
const SURE_IA_KOK = 'https://archive.org/download/quran-maher-al-muaiqly-256kbps'; // maher_yukle_ia.py bu item'i doldurur
const SURE_R2_KOK = ''; // örn. 'https://pub-0123abcd.r2.dev' — R2 kopyası ileride etkinleşince doldurulur

async function sureProxy(request) {
    const yol = new URL(request.url).pathname;
    const parcalar = yol.split('/').filter(Boolean); // ['sure', 'n.mp3']
    if (parcalar.length !== 2) {
        return json({ hata: 'Beklenen yol: /sure/{sure}.mp3' }, 400);
    }
    const eslesen = parcalar[1].match(/^(\d{1,3})\.mp3$/);
    const numara = eslesen ? parseInt(eslesen[1], 10) : 0;
    if (numara < 1 || numara > 114) {
        return json({ hata: 'Geçersiz sure numarası (1-114)' }, 400);
    }
    // Dosya adları 3 basamaklı standart formatta (001.mp3 … 114.mp3).
    const dosya = pad3(numara) + '.mp3';
    const adaylar = [SURE_AYNA_KOK + '/' + dosya];
    if (SURE_R2_KOK) adaylar.push(SURE_R2_KOK + '/maher/256/' + dosya);
    adaylar.push(SURE_IA_KOK + '/' + dosya);
    return sesAkisi(adaylar, request, 'Bütün sure');
}

export default {
    async fetch(request) {
        const yol = new URL(request.url).pathname;

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: cors() });
        }
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            return json({ hata: 'Yalnızca GET desteklenir' }, 405);
        }

        // Kök yol da dualar.json döndürür — yayındaki eski sürümün davranışı korunur.
        if (yol === '/' || yol === '/dualar.json') return dualarJson();
        if (yol === '/kuran.json' || yol === '/dualar2.json') return kuranJson();
        if (yol === '/ses' || yol.startsWith('/ses/')) return sesProxy(request);
        if (yol === '/zikir' || yol.startsWith('/zikir/')) return zikirProxy(request);
        if (yol === '/sure' || yol.startsWith('/sure/')) return sureProxy(request);

        return json({ hata: 'Bulunamadı', yol }, 404);
    }
};
