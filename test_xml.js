const fs = require('fs');

function checkCorruption() {
    const xml = fs.readFileSync('test_document.xml', 'utf8');
    const tokens = xml.split(/(<w:p(?:\s|>)|<\/w:p>)/g);

    let depth = 0;
    for (const token of tokens) {
        if (token.startsWith('<w:p') && !token.startsWith('</w:p')) {
            depth++;
            if (depth > 1) {
                console.log("CORRUPTION MATCHED ON TOKENS:", tokens.slice(tokens.indexOf(token) - 2, tokens.indexOf(token) + 3).join(''));
                return;
            }
        } else if (token.startsWith('</w:p>')) {
            depth--;
        }
    }
}
checkCorruption();
