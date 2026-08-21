const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const target = \            if (Array.isArray(state.lists)) {
                state.lists.forEach(lst => {
                    
                    if (Array.isArray(lst.items)) {
                        lst.items.forEach(it => {
                            const itemName = String(it.name || '').trim();
                            if (itemName === 'Sade Sayaç') {
                                return; // Yalnýzca adý "Sade Sayaç" olanlarý gizle (kullanýcý adýný deðiþtirip dua girdiyse gizleme)
                            }

                            let itBugun = 0, itAy = 0, itYil = 0, itToplam = 0;
                            for (let date in (lst.itemStats || {})) {
                                const val = lst.itemStats[date][it.id] || 0;
                                itToplam += val;
                                if (date === today) itBugun = val;
                                if (date.startsWith(monthPrefix)) itAy += val;
                                if (date.startsWith(yearPrefix)) itYil += val;
                            }
                            
                            globalToday += itBugun;
                            globalAll += itToplam;
                            allRows.push(\\\<tr><td><b>\\\</b><br><span style="font-size:0.7rem;opacity:0.6;">\\\</span></td><td>\\\</td><td>\\\</td><td>\\\</td><td>\\\</td></tr>\\\);
                        });
                    }
                });
            }\;

const replacement = \            let allListsToProcess = [];
            if (Array.isArray(state.lists)) {
                allListsToProcess = [...state.lists];
            }
            if (state.selectedSharedList && !allListsToProcess.find(l => l.id === state.selectedSharedList.id)) {
                allListsToProcess.push(state.selectedSharedList);
            }
            
            allListsToProcess.forEach(lst => {
                if (Array.isArray(lst.items)) {
                    lst.items.forEach(it => {
                        const itemName = String(it.name || '').trim();
                        if (itemName === 'Sade Sayaç') {
                            return; // Yalnýzca adý "Sade Sayaç" olanlarý gizle (kullanýcý adýný deðiþtirip dua girdiyse gizleme)
                        }

                        let itBugun = 0, itAy = 0, itYil = 0, itToplam = 0;
                        for (let date in (lst.itemStats || {})) {
                            const val = lst.itemStats[date][it.id] || 0;
                            itToplam += val;
                            if (date === today) itBugun = val;
                            if (date.startsWith(monthPrefix)) itAy += val;
                            if (date.startsWith(yearPrefix)) itYil += val;
                        }
                        
                        globalToday += itBugun;
                        globalAll += itToplam;
                        allRows.push(\\\<tr><td><b>\\\</b><br><span style="font-size:0.7rem;opacity:0.6;">\\\</span></td><td>\\\</td><td>\\\</td><td>\\\</td><td>\\\</td></tr>\\\);
                    });
                }
            });\;

if (html.includes(target)) {
  html = html.replace(target, replacement);
  fs.writeFileSync('index.html', html, 'utf8');
  console.log('SUCCESS');
} else {
  console.log('TARGET NOT FOUND');
}
