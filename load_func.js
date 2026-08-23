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
                        const ghRes = await Promise.race([fetchPromise, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 1500))]);
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
                            const nativeRes = await Promise.race([capPromise, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 1500))]);
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
                                const nativeRes2 = await Promise.race([capGPromise, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 1500))]);
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
