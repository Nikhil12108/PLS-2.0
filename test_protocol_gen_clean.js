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
            let runs = [];
            for (let i = 0; i < value.length; i++) {
                runs.push(new TextRun({ text: `• ${value[i]}`, break: i > 0 ? 1 : 0 }));
            }
            if (runs.length > 0) {
                textPatches[key] = {
                    type: PatchType.PARAGRAPH,
                    children: runs
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
        const patched1 = await patchDocument({
            outputType: "nodebuffer",
            data: templateBuffer,
            patches: textPatches,
            placeholderDelimiters: { start: "{", end: "}" }
        });

        fs.writeFileSync('test_protocol.docx', patched1);

        const JSZip = require('jszip');
        const zip = await JSZip.loadAsync(patched1);
        const docXml = await zip.file("word/document.xml").async("string");
        fs.writeFileSync('test_document.xml', docXml);
        console.log("Generated clean test XML.");
    } catch (e) {
        console.error("Error patching:", e);
    }
}

testGen();
