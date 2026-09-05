        async function load(isRetry = false) {
            if (autoRetryTimer) {
                clearTimeout(autoRetryTimer);
                autoRetryTimer = null;
            }
            await ensureLoggedIn();
            try {
                let fetchedOk = false;
                window._lastGithubFetch = 0;
                // 1. Fetch public prayers strictly from GitHub on every launch (STRICT: Never local, internet required)
                try {
                    const liveUrl = (window.GITHUB_PRAYERS_URL || "https://raw.githubusercontent.com/selahattin35/dualar/main/dualar.json") + "?t=" + Date.now();
                    let data = null;
                    
                    // İlk olarak standart fetch dene
                    let fetchSuccess = false;
                    let debugInfo = "";
                    try {
                        const fetchPromise = fetch(liveUrl, { cache: "no-store" });
                        const ghRes = await Promise.race([fetchPromise, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 3000))]);
                        if (ghRes.ok) {
                            data = await ghRes.json();
                            fetchSuccess = true;
                        } else {
                            debugInfo += "Fetch Status: " + ghRes.status + "\n";
                        }
                    } catch (fetchErr) {
                        debugInfo += "Fetch Err: " + (fetchErr.message || fetchErr) + "\n";
                    }

                    // Standart fetch başarısız olduysa Capacitor native HTTP ile dene
                    if (!fetchSuccess && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp) {
                        try {
                            const capPromise = window.Capacitor.Plugins.CapacitorHttp.get({ url: liveUrl });
                            const nativeRes = await Promise.race([capPromise, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 3000))]);
                            if (nativeRes && nativeRes.status === 200 && nativeRes.data) {
                                data = typeof nativeRes.data === 'string' ? JSON.parse(nativeRes.data) : nativeRes.data;
                                fetchSuccess = true;
                            } else {
                                debugInfo += "CapHttp Status: " + (nativeRes ? nativeRes.status : 'no-res') + "\n";
                            }
                        } catch (capErr) {
                            debugInfo += "CapHttp Err: " + (capErr.message || capErr) + "\n";
                        }
                    }

                    // Capacitor.Plugins.CapacitorHttp yoksa, Capacitor global Http dene
                    if (!fetchSuccess && window.Capacitor && !data) {
                        try {
                            if (window.CapacitorHttp) {
                                const capGPromise = window.CapacitorHttp.get({ url: liveUrl });
                                const nativeRes2 = await Promise.race([capGPromise, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 3000))]);
                                if (nativeRes2 && nativeRes2.status === 200 && nativeRes2.data) {
                                    data = typeof nativeRes2.data === 'string' ? JSON.parse(nativeRes2.data) : nativeRes2.data;
                                    fetchSuccess = true;
                                } else {
                                    debugInfo += "CapHttpG Status: " + (nativeRes2 ? nativeRes2.status : 'no-res') + "\n";
                                }
                            }
                        } catch (capErr2) {
                            debugInfo += "CapHttpG Err: " + (capErr2.message || capErr2) + "\n";
                        }
                    }

                    if (!fetchSuccess) {
                        showToast("Dua yükleme hatası: " + debugInfo);
                    } else if (data) {
                        if (data && Array.isArray(data.lists)) {
                            window._serverSharedLists = data.lists;
                        } else {
                            window._serverSharedLists = null;
                        }
                        // Kutsal kelimeler telefona asla gömülmez: eski ID eşlemesi
                        // ve tebrik metni GitHub'daki dualar.json'dan çekilir.
                        window.LEGACY_ID_MAP = (data && data.legacyMap) || {};
                        window.CONGRATS_TEXT = (data && data.congratsText) || '';
                        // prayerPool = dua deposu: önce data.items kullan (tekrarsız ana kaynak),
                        // yoksa lists.flatMap ile doldur (dedup sonradan yapılır)
                        if (data && Array.isArray(data.items) && data.items.length > 0) {
                            prayerPool = data.items;
                            window._lastGithubFetch = Date.now();
                        } else if (data && Array.isArray(data.lists)) {
                            prayerPool = data.lists.flatMap(lst => lst.items || []);
                        } else if (Array.isArray(data)) {
                            prayerPool = data;
                        } else {
                            prayerPool = [];
                        }

                        if (prayerPool && prayerPool.length > 0) {
                            fetchedOk = true;
                            if (typeof renderDepotByCategory === 'function') {
                                renderDepotByCategory();
                            }
                        } else {
                            showToast("Dualar indirildi ancak liste boş geldi! Format hatası.");
                        }
                    }
                } catch (e) {
                    prayerPool = [];
                    console.warn("İnternet bağlantısı yok veya GitHub'a ulaşılamadı", e);
                }
                if (!fetchedOk) {
                    prayerPool = [];
                    if (!isRetry) console.warn("İnternet bağlantısı yok, sayaç modunda devam ediliyor.");
                } else if (isRetry) {
                    showToast("İnternet bağlantısı sağlandı, dualar başarıyla yüklendi 🌿");
                }
                // 2. State: İstatistikler ve listeler SADECE telefonun kalıcı hafızasından okunur.
                // (Kullanıcının isteği üzerine Firebase bağlantısı TAMAMEN koparılmıştır.)
                const dbState = null;

                let localState = null;
                try {
                    const localRaw = localStorage.getItem("zikir_app_data");
                    if (localRaw) localState = JSON.parse(localRaw);
                } catch(e) { }
                // Eğer buluttan veri geldiyse, onu baz al; gelmediyse telefondaki yedeği baz al.
                if (dbState) {
                    state = dbState;
                } else if (localState) {
                    state = localState;
                }

                // 3. Herkese Açık Onaylanmış Duaları Firebase'den Çek (custom_prayers)
                try {
                    if (canUseFirestore()) {
                        const approvedRef = window.fsCollection(window.firebaseDb, "custom_prayers");
                        const q2 = window.fsQuery(approvedRef, window.fsWhere("status", "==", "onaylandi"));
                        const qPromise = window.fsGetDocs(q2);
                        const querySnap2 = await Promise.race([qPromise, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 3000))]);
                        if (querySnap2 && querySnap2.forEach) {
                            querySnap2.forEach((doc) => {
                                const customData = doc.data();
                                customData.id = doc.id;
                                prayerPool.push(customData);
                            });
                        }
                    }
                } catch (e) {
                    console.error("Onaylı dualar çekilemedi veya zaman aşımı", e);
                }

                // 4. Kullanıcının Bekleyen Kendi Özel Dualarını Çek
                await fetchPrivatePrayersFromFirebase();

                // Deduplicate prayerPool
                if (prayerPool && prayerPool.length > 0) {
                    const seen = new Map();
                    prayerPool = prayerPool.filter(p => {
                        const key = String(p.id ?? p.name ?? '');
                        if (seen.has(key)) return false;
                        seen.set(key, true);
                        return true;
                    });
                }

                ensureStateLists();
                
                const restoredCount = restoreListsFromPhoneBackup();
                if (restoredCount > 0) {
                    console.log(`Telefon yedeğinden ${restoredCount} kişisel liste geri yüklendi.`);
                }
                
                // Telefondan kaydedilen ilerleme varsa Firestore state'i yoksa veya taze ise uygula
                // (sayaçlar Firestore'dan geldiyse localStorage'daki daha yeni olabilir)
                const localProgress = loadProgressFromPhone();

                // ── ÇAKIŞMA KURALI (bulut vs telefon yedeği) ──────────────────
                // En güncel olan kazanır:
                //  • Bulut yoksa (misafir / boş hesap) → telefon yedeği her şeyi geri yükler.
                //  • Telefon yedeği buluttan daha yeni ise → yedek yalnızca EKSİK olanı
                //    tamamlar: bulutta olmayan listeler eklenir, sayaç/istatistik/konumda
                //    daha yüksek olan değer kullanılır (çevrimdışı ilerleme korunur).
                //  • Bulut daha yeni ise → bulut birincildir; telefon yedeği dikkate
                //    alınmaz (eski bir yedek, başka cihazda silinen listeyi veya
                //    sıfırlanan sayacı geri getirmez).
                const cloudSavedAt = dbState ? String(dbState.savedAt || '') : '';
                const backupSavedAt = localProgress ? String(localProgress.savedAt || '') : '';
                let phoneIsNewer = false;
                if (!cloudSavedAt) {
                    phoneIsNewer = true;
                } else if (backupSavedAt) {
                    const ct = new Date(cloudSavedAt).getTime();
                    const bt = new Date(backupSavedAt).getTime();
                    if (!isNaN(ct) && !isNaN(bt)) phoneIsNewer = bt >= ct;
                }

                // İstatistikler her zaman yerel kayddan birleştirilir (phoneIsNewer'dan bağımsız).
                // Bulut daha yeni olsa bile o gün çekilen zikirler kaybolmamalı.

                if (localProgress && Array.isArray(state.lists) && Array.isArray(localProgress.lists)) {
                    localProgress.lists.forEach(savedList => {
                        const stateList = state.lists.find(l => l.id === savedList.id);
                        if (!stateList) return;
                        // Sayaç ve konum: yalnızca telefon daha yeniyse (bulut birincildir)
                        if (phoneIsNewer) {
                            if (savedList.active !== undefined) {
                                const fsActive = Number(stateList.active) || 0;
                                const lsActive = Number(savedList.active) || 0;
                                stateList.active = Math.max(0, Math.min(Math.max(fsActive, lsActive), Math.max(0, (stateList.items || []).length - 1)));
                            }
                            if (Array.isArray(savedList.items) && Array.isArray(stateList.items)) {
                                const savedMap = new Map(savedList.items
                                    .filter(it => it && typeof it === 'object')
                                    .map(it => [String(it.prayerId || it.id), it]));
                                stateList.items.forEach(it => {
                                    if (!it || typeof it !== 'object') return;
                                    const savedItem = savedMap.get(String(it.prayerId || it.id)) ||
                                                     savedMap.get(String(it.id));
                                    if (savedItem) {
                                        it.count = Math.max(Number(it.count) || 0, Number(savedItem.count) || 0);
                                    }
                                });
                            }
                        }
                        // İstatistikler: HER ZAMAN birleştir (daha yüksek değer kazanır)
                        stateList.stats = mergeMax(stateList.stats, savedList.stats);
                        const fsItemStats = (stateList.itemStats && typeof stateList.itemStats === 'object') ? stateList.itemStats : {};
                        if (savedList.itemStats && typeof savedList.itemStats === 'object') {
                            Object.keys(savedList.itemStats).forEach(date => {
                                fsItemStats[date] = mergeMax(fsItemStats[date], savedList.itemStats[date]);
                            });
                        }
                        stateList.itemStats = fsItemStats;
                    });
                    if (phoneIsNewer && !dbState && localProgress.activeListId && state.lists.some(l => l && l.id === localProgress.activeListId)) {
                        state.activeListId = localProgress.activeListId;
                    }
                }

                // Kronometre: her zaman local ile birleştir (daha yüksek değer kazanır)
                if (localProgress && localProgress.timeStats && typeof localProgress.timeStats === 'object') {
                    if (!state.timeStats || typeof state.timeStats !== 'object') state.timeStats = {};
                    Object.keys(localProgress.timeStats).forEach(k => {
                        state.timeStats[k] = Math.max(Number(state.timeStats[k]) || 0, Number(localProgress.timeStats[k]) || 0);
                    });
                }
                
                // İstatistikleri ve güncellenmiş aktif listeyi root state'e kopyala
                // (Aksi takdirde sonraki save() işlemi stats'ı silebilir)
                syncActiveListIntoState();

                // GitHub Canlı Senkronizasyonu: GitHub'da dua metni/meali değiştiyse ram'de anında güncelle
                if (Array.isArray(prayerPool) && prayerPool.length > 0 && Array.isArray(state.lists)) {
                    const poolMap = new Map(prayerPool.map(p => [String(p.id), p]));
                    state.lists.forEach(list => {
                        if (Array.isArray(list.items)) {
                            list.items.forEach(it => {
                                if (!it || typeof it !== 'object') return;
                                const fresh = poolMap.get(String(it.id));
                                if (fresh) {
                                    it.name = fresh.name || it.name;
                                    if (fresh.text !== undefined) it.text = fresh.text;
                                    if (fresh.meaning !== undefined) it.meaning = fresh.meaning;
                                }
                            });
                        }
                    });
                }
                
                if (currentEmail === 'selahattinbozdemir@gmail.com') {
                    currentRole = 'admin';
                } else {
                    currentRole = 'user';
                }
                
                applyRoleBasedUI();
                
                // Bulut listeler: yalnızca yöneticinin yayınladığı gerçek listeler gösterilir.
                // (Eskiden dualar tür/kategoriye göre gruplanıp "X Duaları" sanal listeleri
                // üretiliyordu; sunucuda böyle listeler olmadığı için kaldırıldı.)
                sharedLists = buildSharedListsFromServer(window._serverSharedLists, prayerPool);
                
                if (typeof state.sheetOpacity === 'undefined') state.sheetOpacity = 0.4;
                if (typeof state.autoFitEnabled === 'undefined') state.autoFitEnabled = false;
                if (typeof state.funMode === 'undefined') state.funMode = false;
                if (typeof state.bgCounterMode === 'undefined') state.bgCounterMode = false;

                loadAppSettingsFromPhone();

                ensureStateLists();
                
                // Sync list_default with prayerPool to ensure it always has all GitHub prayers
                if (prayerPool && prayerPool.length > 0) {
                    const defaultList = (state.lists || []).find(l => l.id === 'list_default');
                    if (defaultList) {
                        if (!Array.isArray(defaultList.items)) defaultList.items = [];
                        prayerPool.forEach(p => {
                            // Bozuk (null) kayıtları atla — eşitleme asla çökmesin.
                            const exists = defaultList.items.find(it => it && typeof it === 'object' && ((it.id === p.id) || (it.name === p.name)));
                            if (!exists) {
                                defaultList.items.push({
                                    id: String(p.id || generateId()),
                                    name: String(p.name || ''),
                                    goal: Number(p.goal) || 33,
                                    count: 0,
                                    text: String(p.text || ''),
                                    meaning: String(p.meaning || ''),
                                    date: new Date().toISOString()
                                });
                            } else {
                                exists.name = String(p.name || exists.name);
                                exists.goal = Number(p.goal) || exists.goal;
                                exists.text = String(p.text || '');
                                exists.meaning = String(p.meaning || '');
                            }
                        });
                    }
                }

                // Bulut (sunucu) listeleri kişisel "Listelerim" bölümüne karışmasın
                removeServerListsFromPersonal();

                // Buluttan gelen listeleri telefonun kalıcı hafızasına hemen yaz:
                // cihaz değişikliğinde listeler otomatik olarak telefona inmiş olur
                // (günlük kullanımda telefon kopyası hazır bekler, sunucudan tekrar çekilmez).
                saveProgressToPhone();

                applyTheme(); syncInputs(); applyViewSettingsToCSS(); applyReaderMode(); updateUI();
                if (state.keepAwake) requestWakeLock();

                // ResumeModal'ı sadece kayıtlı ilerleme varsa göster
                const hasLocalProgress = !!loadProgressFromPhone();
                if (!hasLocalProgress) {
                    shouldAskSessionStartChoice = false;
                }
                maybeAskSessionStartChoice();
                
                showSyncStatus(true);
                // NOT: clearLocalStateCache() burada artık çağrılmıyor
                // Çünkü progress bilgisi korunmalı (sadece zikir_state öneki temizleniyor)
                clearLocalStateCache();

            } catch (err) {
                console.warn('[diag] load failed', err);
                // "Bulut bağlantısı yok" gibi yanıltıcı bir mesaj yerine GERÇEK hatayı göster:
                // buraya yalnızca beklenmeyen hatalar düşer (veri biçimi, ağ, zaman aşımı vb.).
                const yuklemeHatasi = (err && (err.message || err)) || 'Beklenmeyen hata';
                if (String(yuklemeHatasi) !== 'login_required') {
                    showSyncError("Veriler yüklenemedi: " + yuklemeHatasi);
                }
            }

            initSwipe();
            maybeShowIntro();
            startPresenceHeartbeat();
        }

        // ─── İLK AÇILIŞ TANITIMI (slayt) ───
        const INTRO_SEEN_KEY = 'zikir_intro_seen_v1';
        let introIndex = 0;

        function maybeShowIntro() {
            try {
                if (localStorage.getItem(INTRO_SEEN_KEY) === '1') return;
            } catch (_) { }
            showIntroFromMenu();
        }

        // Menüden "Tanıtım" seçildiğinde ilk açılış kontrolüne bakmadan her zaman göster
        function showIntroFromMenu() {
            const overlay = document.getElementById('introOverlay');
            if (!overlay) return;
            introIndex = 0;
            renderIntroDots();
            updateIntroSlide();
            overlay.style.display = 'flex';
        }

        function renderIntroDots() {
            const dotsBox = document.getElementById('introDots');
            if (!dotsBox) return;
            const total = document.querySelectorAll('#introSlides .intro-slide').length;
            dotsBox.innerHTML = '';
            for (let i = 0; i < total; i++) {
                const dot = document.createElement('span');
                dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#fff;opacity:0.35;transition:opacity .3s;';
                dotsBox.appendChild(dot);
            }
        }

        function updateIntroSlide() {
            const slides = document.querySelectorAll('#introSlides .intro-slide');
            slides.forEach((s, i) => {
                s.style.display = (i === introIndex) ? 'flex' : 'none';
            });
            const dots = document.querySelectorAll('#introDots span');
            dots.forEach((d, i) => { d.style.opacity = i === introIndex ? '1' : '0.35'; });
            const total = slides.length;
            const btn = document.getElementById('introNextBtn');
            if (btn) btn.textContent = introIndex >= total - 1 ? 'Başla' : 'Devam Et';
        }

        function introNext() {
            const total = document.querySelectorAll('#introSlides .intro-slide').length;
            if (introIndex < total - 1) {
                introIndex++;
                updateIntroSlide();
            } else {
                closeIntro();
            }
        }

        function closeIntro() {
            try { localStorage.setItem(INTRO_SEEN_KEY, '1'); } catch (_) { }
            const overlay = document.getElementById('introOverlay');
            if (overlay) overlay.style.display = 'none';
        }

        // Slayt kaydırma (swipe) desteği
        let introTouchStartX = null;
        const introOverlayEl = () => document.getElementById('introOverlay');
        document.addEventListener('touchstart', (e) => {
            if (introOverlayEl() && introOverlayEl().style.display === 'flex') {
                introTouchStartX = e.touches[0].clientX;
            }
        }, { passive: true });
        document.addEventListener('touchend', (e) => {
            if (introTouchStartX === null) return;
            const overlay = introOverlayEl();
            if (!overlay || overlay.style.display !== 'flex') { introTouchStartX = null; return; }
            const delta = e.changedTouches[0].clientX - introTouchStartX;
            introTouchStartX = null;
            const total = document.querySelectorAll('#introSlides .intro-slide').length;
            if (delta < -40 && introIndex < total - 1) { introIndex++; updateIntroSlide(); }
            else if (delta > 40 && introIndex > 0) { introIndex--; updateIntroSlide(); }
        }, { passive: true });

        // KAYDETME
        function save(immediate = false) {
            saveAppSettingsToPhone();
            // İlerlemeyi her zaman telefona kaydet (Firestore backup'ı)
            try { syncStateBackToActiveList(); } catch(_) {}
            saveProgressToPhone();
            if (immediate) {
                clearTimeout(saveTimeout);
                sendDataToServer();
                return;
            }
            clearTimeout(saveTimeout);
            showSyncStatus(false);
            saveTimeout = setTimeout(() => {
                sendDataToServer();
            }, 1000);
        }

        let _cloudSyncOk = false;
        function cloudSyncOk() { return false; }

        function sendDataToServer() {
            // users/{uid} artık kullanılmıyor; tüm veriler yalnızca telefon hafızasına kaydedilir.
            saveToLocal();
        }

        async function sendDataToServerAsync() {
            clearTimeout(saveTimeout);
            saveToLocal();
        }

        // Uygulama kapanırken/arka plana geçerken telefon yedeğini yaz.
        function flushPendingCloudSave() {
            // KAPANMADAN ÖNCE ROOT STATE'İ AKTİF LİSTEYE KAYDET!
            // (Eğer bu yapılmazsa o gün çekilen son zikirler listeye geçmez ve kaybolur)
            try { syncStateBackToActiveList(); } catch (_) {}
            try { saveProgressToPhone(); } catch (_) {}
            if (saveTimeout) {
                clearTimeout(saveTimeout);
                saveTimeout = null;
                saveToLocal();
            }
        }
        try {
            if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App && typeof window.Capacitor.Plugins.App.addListener === 'function') {
                window.Capacitor.Plugins.App.addListener('appStateChange', (s) => { if (!s.isActive) flushPendingCloudSave(); }).catch(() => {});
            }
        } catch (_) { }

        // presence artık kullanılmıyor
        let presenceInterval = null;
        function startPresenceHeartbeat() { /* devre dışı */ }


        // FULLSCREEN & BAŞLATMA
        function startAppWithFullscreen() {
            try {
                // Tarayıcı konsolunda "API can only be initiated by a user gesture" hatası çıkmaması için kontrol ekliyoruz.
                // requestFullscreen yalnızca ANLIK kullanıcı hareketiyle (isActive) çalışır; hasBeenActive her zaman
                // true olduğundan koruma sağlamaz. Async çağrılarda (zamanlayıcı, giriş sonrası) tam ekran atlanır,
                // gerçek buton dokunuşunda çalışır.
                const canRequestFS = !navigator.userActivation || navigator.userActivation.isActive;
                
                if (canRequestFS) {
                    const docEl = document.documentElement;
                    if (docEl.requestFullscreen) { docEl.requestFullscreen().catch(()=>{}); }
                    else if (docEl.webkitRequestFullscreen) { docEl.webkitRequestFullscreen().catch(()=>{}); }
                }
            } catch (err) { }

            const overlay = document.getElementById('authOverlay');
            if (overlay) {
                overlay.style.opacity = '0';
                overlay.style.display = 'none';
                setTimeout(() => overlay.style.display = 'none', 100);
            }

            try {
                if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            } catch(e) { console.error('AudioContext error:', e); }
        }

        function toggleFullScreen() {
            try {
                if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                    const el = document.documentElement;
                    if (el.requestFullscreen) { el.requestFullscreen().catch(()=>{}); }
                    else if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen().catch(()=>{}); }
                } else {
                    if (document.exitFullscreen) { document.exitFullscreen().catch(()=>{}); }
                    else if (document.webkitExitFullscreen) { document.webkitExitFullscreen().catch(()=>{}); }
                }
            } catch (err) { }
        }

        function generateId() { return Date.now().toString(36) + Math.random().toString(36).substring(2); }

        function syncInputs() {
            const ids = { 'duaColorPicker': state.duaColor, 'accentColorPicker': state.accent, 'fontSizeRange': state.duaFontSize, 'titleSizeRange': state.titleFontSize, 'countSizeRange': state.countFontSize, 'soundSelect': state.soundMode, 'vibrateRange': state.vibrateDuration, 'endVibrateRange': state.endDuaVibrate, 'opacityRange': state.sheetOpacity, 'lineHeightRange': state.duaLineHeight, 'arabicFontSizeRange': state.arabicFontSize };
            for (const [id, val] of Object.entries(ids)) { const el = document.getElementById(id); if (el) el.value = val; }
            updateSliderValueLabels();
            if (document.getElementById('vibrateValDisplay')) document.getElementById('vibrateValDisplay').textContent = state.vibrateDuration;
            if (document.getElementById('endVibrateValDisplay')) document.getElementById('endVibrateValDisplay').textContent = state.endDuaVibrate;

            const btnBold = document.getElementById('btnBold');
            if (btnBold) btnBold.classList.toggle('selected', state.duaFontWeight === '900' || state.duaFontWeight === 'bold');

            const btnItalic = document.getElementById('btnItalic');
            if (btnItalic) btnItalic.classList.toggle('selected', state.duaFontStyle === 'italic');

            const funCheck = document.getElementById('funModeCheck');
            if (funCheck) funCheck.checked = state.funMode;

            const autoFitCheck = document.getElementById('autoFitCheck');
            if (autoFitCheck) autoFitCheck.checked = state.autoFitEnabled;

            const bgCheck = document.getElementById('bgCounterCheck');
            if (bgCheck) bgCheck.checked = state.bgCounterMode;


            const keepAwakeCheck = document.getElementById('keepAwakeCheck');
            if (keepAwakeCheck) keepAwakeCheck.checked = state.keepAwake;

            const themeCheck = document.getElementById('darkThemeCheck');
            if (themeCheck) themeCheck.checked = (state.theme !== 'light');

            const readerBtn = document.getElementById('readerModeBtn');
            if (readerBtn) readerBtn.classList.toggle('active', !!state.readerMode);

            const swCheck = document.getElementById('showStopwatchCheck');
            if (swCheck) swCheck.checked = !!state.showStopwatch;

            syncFontPickers();
            updateFontPreview();
        }

        function updateSliderValueLabels() {
            const map = {
                fontSizeVal: 'fontSizeRange', titleSizeVal: 'titleSizeRange',
                countSizeVal: 'countSizeRange', opacityVal: 'opacityRange',
                lineHeightVal: 'lineHeightRange', arabicFontSizeVal: 'arabicFontSizeRange'
            };
            for (const [labelId, inputId] of Object.entries(map)) {
                const el = document.getElementById(labelId);
                const inp = document.getElementById(inputId);
                if (el && inp) el.textContent = inp.value;
            }
        }

        function applyTheme() { document.body.dataset.theme = state.theme; document.body.style.backgroundColor = state.theme === 'light' ? '#f1f5f9' : '#0f172a'; }

        function applyViewSettingsToCSS() {
            document.documentElement.style.setProperty('--dua-font-size', state.duaFontSize + 'rem');
            document.documentElement.style.setProperty('--title-font-size', state.titleFontSize + 'rem');
            if (state.countFontSize) document.documentElement.style.setProperty('--count-font-size', state.countFontSize + 'rem');
            if (state.duaColor) document.documentElement.style.setProperty('--dua-color', state.duaColor);
            if (state.accent) document.documentElement.style.setProperty('--accent', state.accent);
            if (state.duaFontFamily) document.documentElement.style.setProperty('--dua-font-family', state.duaFontFamily);
            if (state.duaFontWeight) document.documentElement.style.setProperty('--dua-font-weight', state.duaFontWeight);
            if (state.duaFontStyle) document.documentElement.style.setProperty('--dua-font-style', state.duaFontStyle);
            if (state.duaLineHeight) document.documentElement.style.setProperty('--dua-line-height', state.duaLineHeight);
            if (state.sheetOpacity) document.documentElement.style.setProperty('--sheet-opacity', state.sheetOpacity);
        }
        function liveViewUpdate() {
            state.duaFontSize = document.getElementById('fontSizeRange').value;
            state.titleFontSize = document.getElementById('titleSizeRange').value;
            state.countFontSize = document.getElementById('countSizeRange').value;
            state.duaColor = document.getElementById('duaColorPicker').value;
            state.accent = document.getElementById('accentColorPicker').value;
            state.sheetOpacity = document.getElementById('opacityRange').value;
            state.duaLineHeight = parseFloat(document.getElementById('lineHeightRange').value) || 1.6;
            state.arabicFontSize = parseFloat(document.getElementById('arabicFontSizeRange').value) || 1.3;
            updateSliderValueLabels();
            updateFontPreview();
            applyViewSettingsToCSS(); save(); updateUI();
        }

        function updateFontPreview() {
            const pv = document.getElementById('fontPreview');
            if (!pv) return;
            pv.style.fontFamily = state.duaFontFamily || '';
            pv.style.fontWeight = (state.duaFontWeight === '900' || state.duaFontWeight === 'bold') ? '900' : '400';
            pv.style.fontStyle = state.duaFontStyle === 'italic' ? 'italic' : 'normal';
        }

        // Önizlemeli yazı tipi seçici: seçilen tipi kartlar arasında işaretle
        function syncFontPickers() {
            const sync = (pickerId, current) => {
                const picker = document.getElementById(pickerId);
                if (!picker) return;
                picker.querySelectorAll('.font-option').forEach(btn => {
                    btn.classList.toggle('selected', btn.getAttribute('data-font') === current);
                });
            };
            sync('fontPicker', state.duaFontFamily);
            sync('arabicFontPicker', state.arabicFontFamily);
        }
        function pickFontFamily(btn) {
            if (!btn) return;
            state.duaFontFamily = btn.getAttribute('data-font');
            syncFontPickers();
            updateFontPreview();
            applyViewSettingsToCSS(); save(); updateUI();
        }
        function pickArabicFont(btn) {
            if (!btn) return;
            state.arabicFontFamily = btn.getAttribute('data-font');
            syncFontPickers();
            applyViewSettingsToCSS(); save(); updateUI();
        }

        function toggleBold() { state.duaFontWeight = (state.duaFontWeight === '900' || state.duaFontWeight === 'bold') ? '400' : '900'; syncInputs(); applyViewSettingsToCSS(); save(); }
        function toggleItalic() { state.duaFontStyle = (state.duaFontStyle === 'italic') ? 'normal' : 'italic'; syncInputs(); applyViewSettingsToCSS(); save(); }
        function toggleFunMode() { state.funMode = document.getElementById('funModeCheck').checked; save(); if (state.funMode) showToast("Efektler: AÇIK"); else showToast("Efektler: KAPALI"); }
        function toggleBgCounterMode() { state.bgCounterMode = document.getElementById('bgCounterCheck').checked; save(); updateUI(); if (state.bgCounterMode) showToast("Arka Plan Sayacı: AÇIK"); else showToast("Arka Plan Sayacı: KAPALI"); }
        function toggleAutoFit() { state.autoFitEnabled = !state.autoFitEnabled; syncInputs(); save(); updateUI(); if (state.autoFitEnabled) { fitTextToScreen(); showToast("Oto Sığdırma: AÇIK"); } else { showToast("Oto Sığdırma: KAPALI"); } }
        function toggleTheme() { state.theme = document.getElementById('darkThemeCheck').checked ? 'dark' : 'light'; applyTheme(); save(); showToast(state.theme === 'dark' ? "Koyu Tema: AÇIK 🌙" : "Açık Tema: AÇIK ☀️"); }
        // ─── Ekran Uyanık Kalsın (Wake Lock) ───
        let wakeLockSentinel = null;
        async function requestWakeLock() {
            if (!state.keepAwake) return;
            try {
                if (!wakeLockSentinel && navigator.wakeLock) {
                    wakeLockSentinel = await navigator.wakeLock.request('screen');
                    wakeLockSentinel.addEventListener('release', () => { wakeLockSentinel = null; });
                }
            } catch (_) { wakeLockSentinel = null; }
        }
        function releaseWakeLock() {
            try { if (wakeLockSentinel) { wakeLockSentinel.release(); wakeLockSentinel = null; } } catch (_) { wakeLockSentinel = null; }
        }
        function toggleKeepAwake() {
            state.keepAwake = document.getElementById('keepAwakeCheck').checked;
            save();
            if (state.keepAwake) { requestWakeLock(); showToast("Ekran Uyanık Kalsın: AÇIK"); }
            else { releaseWakeLock(); showToast("Ekran Uyanık Kalsın: KAPALI"); }
        }
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && state.keepAwake) requestWakeLock();
        });
        function toggleReaderMode(e) { if (e) e.stopPropagation(); state.readerMode = !state.readerMode; syncInputs(); applyReaderMode(); save(); if (state.readerMode) showToast("Tam Ekran Okuma Modu: AÇIK 📖"); else showToast("Tam Ekran Okuma Modu: KAPALI"); }
        function applyReaderMode() { const active = !!state.readerMode; document.body.classList.toggle('reader-mode', active); const btn = document.getElementById('readerModeBtn'); if (btn) btn.classList.toggle('active', active); }
        function initScrollWrapperListener() {
            const wrappers = document.querySelectorAll('.dua-scroll-wrapper');
            wrappers.forEach(w => {
                if (w._scrollBound) return;
                w._scrollBound = true;
                w.addEventListener('scroll', () => {
                    const btn = document.getElementById('scrollTopBtn');
                    if (btn) btn.style.display = w.scrollTop > 80 ? 'flex' : 'none';
                });
            });
        }
        function scrollToDuaTop(e) {
            if (e) e.stopPropagation();
            const wrappers = document.querySelectorAll('.dua-scroll-wrapper');
            wrappers.forEach(w => w.scrollTo({ top: 0, behavior: 'smooth' }));
        }

        function fitTextToScreen() {
            let currentSize = 4.5; const minSize = 1.6; const textEl = document.getElementById('duaText'); const container = document.getElementById('swipeArea');
            if (!textEl || !container) return;
            if (container.clientWidth <= 0) return; // Gizliyken (örn. Sade Sayaç) ölçüm yapılamaz
            // Oto sığdırma modunda kelimeler ASLA ortasından bölünmesin:
            // sığmayan uzun tek kelime için yazı boyutu iyice küçültülür, kelime bütün kalır.
            textEl.classList.add('dua-text-autofit');
            const originalTransition = textEl.style.transition; textEl.style.transition = 'none';
            while (currentSize >= minSize) {
                document.documentElement.style.setProperty('--dua-font-size', currentSize + 'rem');
                // Arapça görünümünde inline boyut CSS değişkenini ezer; sığdırma için inline boyut da küçültülür
                textEl.style.fontSize = currentSize + 'rem';
                // Dikey taşmayı (scrollHeight vs container) ve Yatay taşmayı (scrollWidth vs container genisliği) kontrol et
                // dua-scroll-wrapper'da sağ-sol 10'ar px padding var, bu yüzden container.clientWidth - 20 yapıyoruz.
                if (textEl.scrollHeight <= container.clientHeight && textEl.scrollWidth <= (container.clientWidth - 20)) { 
                    break; 
                }
                currentSize -= 0.1;
            }
            // Kelime bölme artık kullanılmıyor: en küçük boyutta bile sığmayan (pratikte imkânsız)
            // tek bir kelime ekran kenarından taşabilir ama asla ortasından bölünmez.
            textEl.style.transition = originalTransition;
            setTimeout(() => { const w = document.querySelectorAll('.dua-scroll-wrapper'); w.forEach(el => el.scrollTop = 0); }, 10);
        }

        function updateUI() {
