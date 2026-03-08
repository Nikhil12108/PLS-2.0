const fs = require('fs');
const docx = require('docx');
const { patchDocument, PatchType, TextRun, Paragraph, Table, TableRow, TableCell, BorderStyle, WidthType, VerticalAlign, AlignmentType } = docx;

// Dummy answers replicating Protocol PLS
const currentFetchedAnswers = {
    "plain_language_title": "My Title",
    "full_title": "Full Protocol Title",
    "inclusion_criteria": ["Criteria 1", "Criteria 2"],
    "exclusion_criteria": ["Exc 1", "Exc 2"],
    "total_number_of_participants": "100"
};

async function testGen() {
    console.log("Loading template...");
    const templatePath = require('path').join(process.cwd(), 'src', 'templates', 'template2.docx');
    const templateBuffer = fs.readFileSync(templatePath);

    const textPatches = {};

    for (const [key, value] of Object.entries(currentFetchedAnswers)) {
        if (!value) continue;

        if (Array.isArray(value)) {
            let paragraphs = [];
            for (const item of value) {
                if (typeof item === 'string') {
                    paragraphs.push(new Paragraph({
                        children: [new TextRun({ text: item })],
                        bullet: { level: 0 }
                    }));
                }
            }
            if (paragraphs.length > 0) {
                textPatches[key] = {
                    type: PatchType.DOCUMENT,
                    children: paragraphs
                };
            }
        } else {
            textPatches[key] = {
                type: PatchType.PARAGRAPH,
                children: [new TextRun(String(value))]
            };
        }
    }

    try {
        console.log("Patching text...", Object.keys(textPatches));
        const patched1 = await patchDocument({
            outputType: "nodebuffer",
            data: templateBuffer,
            patches: textPatches,
            placeholderDelimiters: { start: "{", end: "}" }
        });

        fs.writeFileSync('test_protocol.docx', patched1);
        console.log("test_protocol.docx generated successfully.");

        // Also run xml lint on the generated docx document to look for corruption
        const JSZip = require('jszip');
        const zip = await JSZip.loadAsync(patched1);
        const docXml = await zip.file("word/document.xml").async("string");
        fs.writeFileSync('test_document.xml', docXml);
        console.log("Extracted document.xml.");
    } catch (e) {
        console.error("Error patching:", e);
    }
}

testGen();
