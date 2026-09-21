const fs = require('fs');
const path = require('path');
const dir = 'admin/modules';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'package.json');

// Check for common runtime error patterns
const issues = [];

for (const file of files) {
    const code = fs.readFileSync(path.join(dir, file), 'utf8');
    const lines = code.split('\n');

    lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//')) return;
        const lineNum = i + 1;

        // 1. new bootstrap.Modal() without check - should use getOrCreateInstance
        if (/new\s+bootstrap\.Modal\(/.test(trimmed)) {
            issues.push({ file, line: lineNum, type: 'WARN', msg: 'new bootstrap.Modal() may create duplicate instances - use getOrCreateInstance', code: trimmed });
        }

        // 2. document.getElementById returns null? (risky without null check)
        // 3. Accessing .attributes without null check
        if (/\.attributes\.\w+/.test(trimmed) && !trimmed.includes('?.') && !trimmed.includes('if (') && !trimmed.includes('&&')) {
            // Just note patterns
        }

        // 4. addRowToTable called without 'view' argument (it requires 4 args)
        if (/addRowToTable\(/.test(trimmed)) {
            const argMatch = trimmed.match(/addRowToTable\(([^)]+)\)/);
            if (argMatch) {
                const args = argMatch[1].split(',').length;
                if (args < 4) {
                    issues.push({ file, line: lineNum, type: 'ERROR', msg: 'addRowToTable() called with ' + args + ' args but signature requires 4 (tableId, graphic, label, view)', code: trimmed });
                }
            }
        }

        // 5. sketch.create('rectangle') called without checking if sketch exists
        if (/sketch\.create\(/.test(trimmed)) {
            issues.push({ file, line: lineNum, type: 'INFO', msg: 'sketch.create() call - ensure sketch is available', code: trimmed });
        }

        // 6. window.runDetectPoly is called but defined inside initAutoTopo - check it's accessible
        if (/window\.runDetectPoly/.test(trimmed)) {
            issues.push({ file, line: lineNum, type: 'INFO', msg: 'window.runDetectPoly called', code: trimmed });
        }
    });
}

// 7. Verify uiEvents.js btnRefresh handler
const uiEventsCode = fs.readFileSync(path.join(dir, 'uiEvents.js'), 'utf8');
if (!uiEventsCode.includes('btnRefresh')) {
    issues.push({ file: 'uiEvents.js', line: 0, type: 'ERROR', msg: 'btnRefresh event not registered - Tải lại button will not work!' });
}

const sketchCode = fs.readFileSync(path.join(dir, 'sketchEvents.js'), 'utf8');
if (!sketchCode.includes('btnExportSQL') && !uiEventsCode.includes('btnExportSQL')) {
    issues.push({ file: 'sketchEvents.js/uiEvents.js', line: 0, type: 'ERROR', msg: 'btnExportSQL not found!' });
}

console.log('=== ISSUES FOUND ===');
if (issues.length === 0) {
    console.log('None');
} else {
    issues.forEach(({ file, line, type, msg, code }) => {
        console.log('[' + type + '] ' + file + ':' + line);
        console.log('  ' + msg);
        if (code) console.log('  >> ' + code.substring(0, 120));
    });
}
