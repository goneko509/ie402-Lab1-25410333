const fs = require('fs');
const path = require('path');
const dir = 'admin/modules';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'package.json');

// Collect exports from each module
const moduleExports = {};
for (const file of files) {
    const code = fs.readFileSync(path.join(dir, file), 'utf8');
    const exports = [];
    const rx = /export\s+(?:const|function|class|let|var)\s+(\w+)/g;
    let m;
    while ((m = rx.exec(code)) !== null) exports.push(m[1]);
    moduleExports[file] = exports;
}

console.log('=== MODULE EXPORTS ===');
for (const [file, exps] of Object.entries(moduleExports)) {
    console.log(file + ': ' + (exps.length ? exps.join(', ') : '(none)'));
}

console.log('\n=== IMPORT CHECKS ===');
let hasError = false;
for (const file of files) {
    const code = fs.readFileSync(path.join(dir, file), 'utf8');
    const lines = code.split('\n');
    lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith('import')) return;
        // Parse: import { X, Y } from './Z.js'
        const braceMatch = trimmed.match(/import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/);
        if (braceMatch) {
            const symbols = braceMatch[1].split(',').map(s => s.trim());
            let srcFile = braceMatch[2].replace(/^\.\//, '').replace(/\?.*$/, '');
            const srcExports = moduleExports[srcFile] || null;
            if (!srcExports) {
                console.log('WARN: ' + file + ':' + (i+1) + ' imports from "' + srcFile + '" - not found in modules dir');
                return;
            }
            for (const sym of symbols) {
                if (!srcExports.includes(sym)) {
                    console.log('ERROR: ' + file + ':' + (i+1) + ' imports "' + sym + '" from "' + srcFile + '" but that file exports: [' + srcExports.join(', ') + ']');
                    hasError = true;
                }
            }
        }
    });
}
if (!hasError) console.log('All imports valid');
