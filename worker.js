/**
 * Zikirmatik bulut yardımcısı — Cloudflare Worker
 *
 * Dört iş yapar:
 *   1) GET /dualar.json                → GitHub'daki dualar verisini yayınlar (mevcut davranış)
 *   2) GET /kuran.json                 → Kur'an-ı Kerim verisini yayınlar (ayrı dosya)
 *   3) GET /ses/{bitrate}/{kari}/{no}.mp3 → Kur'an tilavetini proxy'ler
 *   4) GET /zikir/{dosya}.mp3          → zikir/Esma-ül Hüsna kliplerini proxy'ler (beyaz liste)
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
const KURAN_KAYNAK = 'https://raw.githubusercontent.com/garipzeka/dualar/main/kuran.json';
const SES_CDN = 'https://cdn.islamic.network/quran/audio/';

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

/** /kuran.json — Kur'an-ı Kerim verisi (ayrı dosya, ~3 MB).
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

/** Hedef ses dosyasını sunucu tarafında çeker ve "no-store" ile akıtır
 *  (tilavet ve zikir klipleri için ortak yol). */
async function sesAkisi(hedef, request, kaynakAdi) {
    // İstemciden gelen Range varsa geçir (ileri sarma); yoksa tam dosya iner.
    const istekBasliklari = {};
    const range = request.headers.get('Range');
    if (range) istekBasliklari['Range'] = range;

    let kaynakYanit;
    try {
        kaynakYanit = await fetch(hedef, {
            headers: istekBasliklari,
            // Kenar önbelleğini kapat: kutsal ses kenarda da birikmesin.
            cf: { cacheEverything: false, cacheTtl: 0 }
        });
    } catch (_) {
        return json({ hata: kaynakAdi + ' kaynağına ulaşılamadı' }, 502);
    }

    if (!kaynakYanit.ok) {
        return json({ hata: kaynakAdi + ' bulunamadı', durum: kaynakYanit.status }, kaynakYanit.status === 404 ? 404 : 502);
    }

    // Gövde akış olarak geçirilir; hiçbir yerde saklanmaz.
    return new Response(request.method === 'HEAD' ? null : kaynakYanit.body, {
        status: kaynakYanit.status,
        headers: cors({
            'Content-Type': 'audio/mpeg',
            'Cache-Control': NO_STORE,
            'Content-Disposition': 'inline',
            'Accept-Ranges': 'bytes'
        })
    });
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

    return sesAkisi(SES_CDN + bitrate + '/' + kari + '/' + dosya, request, 'Tilavet');
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
    return sesAkisi(hedef, request, 'Zikir sesi');
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
        if (yol === '/kuran.json') return kuranJson();
        if (yol === '/ses' || yol.startsWith('/ses/')) return sesProxy(request);
        if (yol === '/zikir' || yol.startsWith('/zikir/')) return zikirProxy(request);

        return json({ hata: 'Bulunamadı', yol }, 404);
    }
};
