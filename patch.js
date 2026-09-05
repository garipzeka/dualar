const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// 1. Add goalChangeConfirmModal
if (!html.includes('goalChangeConfirmModal')) {
    html = html.replace(
        '<div class="modal" id="resetConfirmModal" style="z-index:8000;">',
        `<div class="modal" id="goalChangeConfirmModal" style="display:none; z-index:8000;">
        <div class="modal-content" style="max-width: 320px; text-align: center;">
            <p style="color: white; margin-bottom: 20px; font-weight: 700; font-size:1.05rem;">Hedefi yükseltiyorsunuz. Mevcut sayıdan devam edilsin mi, yoksa sıfırdan mı başlansın?</p>
            <div style="display: grid; grid-template-columns: 1fr; gap: 10px;">
                <button class="btn-primary" style="background: var(--accent); padding:14px;" onclick="executeGoalChange('continue')">Sayıdan Devam Et</button>
                <button class="btn-primary" style="background: #e74c3c; padding:14px;" onclick="executeGoalChange('reset')">0'dan Başla</button>
                <button class="btn-primary" style="background: transparent; border:1px solid rgba(255,255,255,0.2); color: var(--muted); padding:10px;" onclick="hideGoalChangeConfirm()">İptal</button>
            </div>
        </div>
    </div>
    <div class="modal" id="resetConfirmModal" style="z-index:8000;">`
    );
}

// 2. Add transition UI
if (!html.includes('transitionSelect')) {
    html = html.replace(
        '<div class="setting-group">\r\n            <label class="setting-label">Eğlenceli Efektler (Dokunuşta)</label>',
        `<div class="setting-group">
            <label class="setting-label">Sayfa Geçiş Efekti (Dua Arası Geçiş)</label>
            <select id="transitionSelect" onchange="updateTransitionSettings()">
                <option value="none">Yok</option>
                <option value="slide">Kaydırma (Slide)</option>
                <option value="fade">Kararma (Fade)</option>
                <option value="zoom">Yakınlaştırma (Zoom)</option>
                <option value="flip">Dönme (Flip)</option>
                <option value="bounce">Sıçrama (Bounce)</option>
            </select>
            <div id="transitionPreviewBox" style="margin-top:10px; padding:15px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:12px; text-align:center; font-weight:bold; transition:all 0.3s ease;">Önizleme Metni</div>
        </div>
        <div class="setting-group">
            <label class="setting-label">Eğlenceli Efektler (Dokunuşta)</label>`
    );
}

// 3. Add CSS animations
if (!html.includes('pageTransSlide')) {
    html = html.replace(
        '</style>',
        `        @keyframes pageTransSlide {
            0% { transform: translateX(100%); opacity: 0; }
            100% { transform: translateX(0); opacity: 1; }
        }
        @keyframes pageTransFade {
            0% { opacity: 0; }
            100% { opacity: 1; }
        }
        @keyframes pageTransZoom {
            0% { transform: scale(0.8); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
        }
        @keyframes pageTransFlip {
            0% { transform: perspective(400px) rotateY(90deg); opacity: 0; }
            100% { transform: perspective(400px) rotateY(0deg); opacity: 1; }
        }
        @keyframes pageTransBounce {
            0% { transform: translateY(-50px); opacity: 0; }
            50% { transform: translateY(10px); opacity: 1; }
            100% { transform: translateY(0); opacity: 1; }
        }
        .page-trans-slide { animation: pageTransSlide 0.4s ease forwards; }
        .page-trans-fade { animation: pageTransFade 0.4s ease forwards; }
        .page-trans-zoom { animation: pageTransZoom 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        .page-trans-flip { animation: pageTransFlip 0.5s ease forwards; }
        .page-trans-bounce { animation: pageTransBounce 0.5s cubic-bezier(0.280, 0.840, 0.420, 1) forwards; }
    </style>`
    );
}

// 4. Update syncInputs
if (!html.includes('transitionSelect\': state.pageTransition')) {
    html = html.replace(
        "const ids = { 'duaColorPicker': state.duaColor",
        "const ids = { 'transitionSelect': state.pageTransition || 'slide', 'duaColorPicker': state.duaColor"
    );
}

// 5. Update loadAppSettingsFromPhone
if (!html.includes('p.pageTransition !== undefined')) {
    html = html.replace(
        "if (p.keepAwake !== undefined) state.keepAwake = p.keepAwake;",
        "if (p.keepAwake !== undefined) state.keepAwake = p.keepAwake;\n                if (p.pageTransition !== undefined) state.pageTransition = p.pageTransition;"
    );
}

// 6. Update saveAppSettingsToPhone
if (!html.includes('pageTransition: state.pageTransition')) {
    html = html.replace(
        "showStopwatch: state.showStopwatch\r\n                };",
        "showStopwatch: state.showStopwatch,\n                    pageTransition: state.pageTransition || 'slide'\n                };"
    );
}

// 7. Add updateTransitionSettings
if (!html.includes('updateTransitionSettings')) {
    html = html.replace(
        `        function updateInteractionSettings(ev) {\r\n            state.soundMode = document.getElementById('soundSelect').value;`,
        `        function updateTransitionSettings() {
            const sel = document.getElementById('transitionSelect');
            if (!sel) return;
            state.pageTransition = sel.value;
            save();
            
            // Önizleme
            const box = document.getElementById('transitionPreviewBox');
            if (box) {
                box.style.animation = 'none';
                void box.offsetWidth;
                if (state.pageTransition && state.pageTransition !== 'none') {
                    box.style.animation = 'pageTrans' + state.pageTransition.charAt(0).toUpperCase() + state.pageTransition.slice(1) + ' 0.5s ease forwards';
                }
            }
        }
        function updateInteractionSettings(ev) {\r\n            state.soundMode = document.getElementById('soundSelect').value;`
    );
}

// 8. Fix setCustomTarget & executeGoalChange
if (!html.includes('executeGoalChange')) {
    const oldSetCustom = `        function setCustomTarget(val) {\r
            const num = parseInt(val);\r
            if (isNaN(num) || num < 1) return;\r
            \r
            saveCustomGoalToStorage(num);\r
            \r
            ensureStateLists();\r
            if (!state.items || state.items.length === 0) {\r
                state.items = [{ id: 'sayac_default', name: 'Sade Sayaç', count: 0, goal: num, meaning: '', text: '' }];\r
            } else {\r
                const it = state.items[state.active || 0];\r
                if (it) it.goal = num;\r
            }\r
\r
            syncStateBackToActiveList();\r
            save();\r
            updateUI();\r
            showToast('Hedef ' + num + ' olarak belirlendi');\r
        }`;
    const newSetCustom = `        let _pendingGoalChange = null;
        function hideGoalChangeConfirm() {
            document.getElementById('goalChangeConfirmModal').style.display = 'none';
            _pendingGoalChange = null;
        }
        function executeGoalChange(action) {
            if (!_pendingGoalChange) return hideGoalChangeConfirm();
            const { num, it } = _pendingGoalChange;
            it.goal = num;
            if (action === 'reset') {
                it.count = 0;
                if (window.resetStopwatch) window.resetStopwatch();
            }
            saveCustomGoalToStorage(num);
            syncStateBackToActiveList();
            save();
            updateUI();
            showToast('Hedef ' + num + ' olarak belirlendi');
            hideGoalChangeConfirm();
        }

        function setCustomTarget(val) {
            const num = parseInt(val);
            if (isNaN(num) || num < 1) return;
            
            ensureStateLists();
            if (!state.items || state.items.length === 0) {
                state.items = [{ id: 'sayac_default', name: 'Sade Sayaç', count: 0, goal: num, meaning: '', text: '' }];
                saveCustomGoalToStorage(num);
                syncStateBackToActiveList();
                save();
                updateUI();
                showToast('Hedef ' + num + ' olarak belirlendi');
                return;
            }
            
            const it = state.items[state.active || 0];
            if (!it) return;

            if (it.count === 0) {
                it.goal = num;
                saveCustomGoalToStorage(num);
                syncStateBackToActiveList();
                save();
                updateUI();
                showToast('Hedef ' + num + ' olarak belirlendi');
            } else {
                if (num > it.goal) {
                    _pendingGoalChange = { num, it };
                    document.getElementById('goalChangeConfirmModal').style.display = 'flex';
                } else if (num < it.goal) {
                    it.goal = num;
                    it.count = 0;
                    if (window.resetStopwatch) window.resetStopwatch();
                    saveCustomGoalToStorage(num);
                    syncStateBackToActiveList();
                    save();
                    updateUI();
                    showToast('Hedef düşürüldü ve sayaç sıfırlandı');
                } else {
                    // Aynı hedefse bir şey yapma
                }
            }
        }`;
    html = html.replace(oldSetCustom, newSetCustom);
}

// 9. Fix executeDeleteList
if (!html.includes('state.deletedListIds.push(_editingListId)')) {
    html = html.replace(
        `            state.lists = state.lists.filter(l => l.id !== _editingListId);`,
        `            if (!Array.isArray(state.deletedListIds)) state.deletedListIds = [];
            if (!state.deletedListIds.includes(_editingListId)) state.deletedListIds.push(_editingListId);
            state.lists = state.lists.filter(l => l.id !== _editingListId);`
    );
}

// 10. Fix syncActiveListIntoState
if (!html.includes(`if (state.activeListId === 'list_single_prayer') return;`)) {
    html = html.replace(
        `        function syncActiveListIntoState() {\r
            const list = (state.selectedSharedList && state.selectedSharedList.id === state.activeListId)\r
                ? state.selectedSharedList\r
                : (state.lists?.find(l => l.id === state.activeListId) || state.lists?.[0]);`,
        `        function syncActiveListIntoState() {\r
            if (state.activeListId === 'list_single_prayer') return;\r
            const list = (state.selectedSharedList && state.selectedSharedList.id === state.activeListId)\r
                ? state.selectedSharedList\r
                : (state.lists?.find(l => l.id === state.activeListId) || state.lists?.[0]);`
    );
}

// 11. Fix getActiveList
if (!html.includes(`activeList = { id: 'list_single_prayer'`)) {
    html = html.replace(
        `        function getActiveList() {\r
            ensureStateLists();\r
            let activeList = (state.selectedSharedList && state.selectedSharedList.id === state.activeListId)\r
                ? state.selectedSharedList\r
                : state.lists.find(l => l && l.id === state.activeListId);`,
        `        function getActiveList() {\r
            ensureStateLists();\r
            let activeList = null;\r
            if (state.activeListId === 'list_single_prayer') {\r
                activeList = { id: 'list_single_prayer', name: 'Tekli Dua', items: state.items || [], active: state.active || 0, stats: state.stats || {}, itemStats: state.itemStats || {} };\r
            } else if (state.selectedSharedList && state.selectedSharedList.id === state.activeListId) {\r
                activeList = state.selectedSharedList;\r
            } else {\r
                activeList = state.lists.find(l => l && l.id === state.activeListId);\r
            }`
    );
}

// 12. Fix refreshPrayersFromGitHub
if (!html.includes(`if (state.activeListId && state.activeListId.startsWith('cloud_')) {`)) {
    html = html.replace(
        `            syncActiveListIntoState();\r
            // Bulut listeler: yalnızca yöneticinin yayınladığı gerçek listeler\r
            sharedLists = buildSharedListsFromServer(window._serverSharedLists, prayerPool);`,
        `            // Bulut listeler: yalnızca yöneticinin yayınladığı gerçek listeler\r
            sharedLists = buildSharedListsFromServer(window._serverSharedLists, prayerPool);\r
            if (state.activeListId && state.activeListId.startsWith('cloud_')) {\r
                const newActive = sharedLists.find(l => l.id === state.activeListId);\r
                if (newActive) {\r
                    newActive.virtualSharedList = true;\r
                    state.selectedSharedList = newActive;\r
                }\r
            } else if (state.selectedSharedList) {\r
                const newActive = sharedLists.find(l => l.id === state.selectedSharedList.id);\r
                if (newActive) {\r
                    state.selectedSharedList = newActive;\r
                }\r
            }\r
            syncActiveListIntoState();`
    );
}

// 13. Fix deviceorientation
if (!html.includes(`restorePrayersIfPurged();`)) {
    html = html.replace(
        `                    deviceFlatSince = flat ? (deviceFlatSince || Date.now()) : null;\r
                }\r
            }, { passive: true });`,
        `                    deviceFlatSince = flat ? (deviceFlatSince || Date.now()) : null;\r
                    if (!flat && prayersPurged) {\r
                        hidePurgeBanner();\r
                        restorePrayersIfPurged();\r
                    }\r
                }\r
            }, { passive: true });`
    );
}

// 14. Fix load() list_sayac zeroing
if (!html.includes(`const sayac = state.lists.find(l => l.id === 'list_sayac');`)) {
    html = html.replace(
        `                if (localState) state = localState;\r
\r
                ensureStateLists();`,
        `                if (localState) state = localState;\r
                \r
                // Sade Sayaç her zaman 0'dan başlar\r
                if (state.lists) {\r
                    const sayac = state.lists.find(l => l.id === 'list_sayac');\r
                    if (sayac && sayac.items) sayac.items.forEach(it => it.count = 0);\r
                }\r
\r
                ensureStateLists();`
    );
}

// 15. Fix continueFromLastSession() list_sayac zeroing
if (!html.includes(`const sayac = savedProgress.lists.find(l => l.id === 'list_sayac');`)) {
    html = html.replace(
        `            if (savedProgress) {\r
                applyProgressToState(savedProgress);`,
        `            if (savedProgress) {\r
                if (savedProgress.lists) {\r
                    const sayac = savedProgress.lists.find(l => l.id === 'list_sayac');\r
                    if (sayac && Array.isArray(sayac.items)) {\r
                        sayac.items.forEach(it => it.count = 0);\r
                    }\r
                }\r
                applyProgressToState(savedProgress);`
    );
}

// 16. Add touch events
if (!html.includes(`document.addEventListener('click', () => {`)) {
    html = html.replace(
        `        document.addEventListener('touchstart', () => {\r
            window.lastTapTime = Date.now();\r
            if (purgeScheduled) cancelPendingPurge();\r
        }, { passive: true });\r
        document.addEventListener('click', () => {\r
            window.lastTapTime = Date.now();\r
            if (purgeScheduled) cancelPendingPurge();\r
        });`,
        `        document.addEventListener('touchstart', () => {\r
            window.lastTapTime = Date.now();\r
            if (purgeScheduled) cancelPendingPurge();\r
            if (typeof restorePrayersIfPurged === 'function') restorePrayersIfPurged();\r
        }, { passive: true });\r
        document.addEventListener('click', () => {\r
            window.lastTapTime = Date.now();\r
            if (purgeScheduled) cancelPendingPurge();\r
            if (typeof restorePrayersIfPurged === 'function') restorePrayersIfPurged();\r
        });`
    );
}

// 17. Implement Transition Logic in nextDua and prevDua
if (!html.includes('applyPageTransition')) {
    html = html.replace(
        `        function nextDua() {\r
            if (!Array.isArray(state.items) || state.items.length === 0) return;\r
            if (state.active < state.items.length - 1) state.active++; else state.active = 0;\r
            syncStateBackToActiveList();\r
            updateUI();\r
            save();\r
        }\r
\r
        function prevDua() {\r
            if (!Array.isArray(state.items) || state.items.length === 0) return;\r
            if (state.active > 0) state.active--; else state.active = state.items.length - 1;\r
            syncStateBackToActiveList();\r
            updateUI();\r
            save();\r
        }`,
        `        function applyPageTransition() {
            const area = document.getElementById('swipeArea');
            if (area && state.pageTransition && state.pageTransition !== 'none') {
                area.style.animation = 'none';
                void area.offsetWidth;
                area.style.animation = 'pageTrans' + state.pageTransition.charAt(0).toUpperCase() + state.pageTransition.slice(1) + ' 0.4s ease forwards';
            }
        }

        function nextDua() {\r
            if (!Array.isArray(state.items) || state.items.length === 0) return;\r
            if (state.active < state.items.length - 1) state.active++; else state.active = 0;\r
            syncStateBackToActiveList();\r
            updateUI();\r
            save();\r
            applyPageTransition();\r
        }\r
\r
        function prevDua() {\r
            if (!Array.isArray(state.items) || state.items.length === 0) return;\r
            if (state.active > 0) state.active--; else state.active = state.items.length - 1;\r
            syncStateBackToActiveList();\r
            updateUI();\r
            save();\r
            applyPageTransition();\r
        }`
    );
}

fs.writeFileSync('index.html', html, 'utf8');
console.log('Patch complete.');
