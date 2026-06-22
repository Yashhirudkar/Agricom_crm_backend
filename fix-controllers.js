const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = path.resolve(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else { 
            if (file.endsWith('.controller.ts')) results.push(file);
        }
    });
    return results;
}

const files = walk('./src/masters');
let count = 0;
files.forEach(f => {
    let content = fs.readFileSync(f, 'utf8');
    const newContent = content.replace(/,\s*@Query\('includeUiConfig'\)\s*includeUiConfig\?:\s*string/g, '');
    if (content !== newContent) {
        fs.writeFileSync(f, newContent, 'utf8');
        count++;
        console.log('Fixed', f);
    }
});
console.log('Fixed ' + count + ' files.');
