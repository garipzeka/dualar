const fs = require('fs');

function fixFile(file) {
    let content = fs.readFileSync(file, 'utf-8');

    // Remove the badly injected block in initApp (or anywhere where it's followed by "burada asla")
    const badBlockRegex = /\/\/ Sade Sayaç sanal listesini state içine güvenlice yerleştir \(yoksa\)\s*if \(\!state\.lists\.find\(l => l\.id === 'list_sayac'\)\) \{\s*state\.lists\.unshift\(\{\s*id: 'list_sayac',\s*name: 'Sade Sayaç',\s*items: \[\{ id: 'sayac_default', name: 'Sade Sayaç', count: 0, goal: getLastCustomGoalFromStorage\(\) \|\| 33, meaning: '', text: '' \}\],\s*active: 0,\s*stats: \{\}, itemStats: \{\}\s*\}\);\s*\}\s*\/\/ Not: "Genel Liste" \(list_default\) burada/g;
    
    content = content.replace(badBlockRegex, '// Not: "Genel Liste" (list_default) burada');
    
    fs.writeFileSync(file, content);
    console.log("Fixed", file);
}

fixFile('index.html');
fixFile('www/index.html');
