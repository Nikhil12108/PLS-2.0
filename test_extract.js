const fs = require('fs');

async function test() {
    const result = await fetch('http://localhost:3000/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            batchPrompts: {
                health_condition_description: "Answer this question from the uploaded files. Write about the health condition. \nFINAL JSON OUTPUT:\n{\n  \"Health condition description\": \"<output here>\"\n}"
            },
            vectorStoreId: process.env.KB_VECTOR_STORE_ID || "vs_6973393579548191aac1ecb82ec2d540"
        })
    });
    console.log("Status:", result.status);
    const data = await result.json();
    console.log(JSON.stringify(data, null, 2));
}

test();
