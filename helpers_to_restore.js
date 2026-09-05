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

