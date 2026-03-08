import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export const maxDuration = 300; // Increase max duration for Vercel/Next.js to 5 minutes to accommodate large uploads

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const files = formData.getAll('files') as File[];

        if (!files || files.length === 0) {
            return NextResponse.json({ error: 'No files provided' }, { status: 400 });
        }

        console.log(`Starting upload of ${files.length} files to OpenAI storage...`);

        const uploadedFileIds: string[] = [];
        const errors: string[] = [];

        // 2. Upload files to OpenAI in batches (to avoid unbounded parallel execution)
        const BATCH_SIZE = 5;
        for (let i = 0; i < files.length; i += BATCH_SIZE) {
            const batch = files.slice(i, i + BATCH_SIZE);
            const uploadPromises = batch.map(async (file) => {
                try {
                    const fileUploadResponse = await openai.files.create({
                        file: file,
                        purpose: 'assistants',
                    });
                    uploadedFileIds.push(fileUploadResponse.id);
                    console.log(`Successfully uploaded file: ${file.name} (${fileUploadResponse.id})`);
                } catch (e: any) {
                    console.error(`Failed to upload ${file.name}:`, e);
                    errors.push(`Failed to upload '${file.name}': ${e.message}`);
                }
            });
            await Promise.all(uploadPromises);
        }

        if (uploadedFileIds.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: 'No files were uploaded successfully.',
                    errors,
                },
                { status: 500 }
            );
        }

        // 3. Create a Vector Store and add the uploaded files
        let vectorStoreId = "";
        try {
            console.log("Creating vector store for GPT-5.4 file_search...");
            const vectorStore = await openai.vectorStores.create({
                name: "Document Assistant Vector Store"
            });
            vectorStoreId = vectorStore.id;

            console.log(`Polling file batch attachment to vector store ${vectorStoreId}...`);
            await openai.vectorStores.fileBatches.createAndPoll(
                vectorStoreId,
                { file_ids: uploadedFileIds }
            );
            console.log("Vector store ready.");
        } catch (vsError: any) {
            console.error("Vector store creation failed:", vsError);
            errors.push(`Vector store creation failed: ${vsError.message}`);
        }

        const stats = {
            total_files_submitted: files.length,
            successful_uploads: uploadedFileIds.length,
            success: uploadedFileIds.length > 0 && vectorStoreId !== "",
            failed: errors.length,
            uploaded_file_ids: uploadedFileIds,
            vector_store_id: vectorStoreId,
            errors: errors
        };

        return NextResponse.json(stats);

    } catch (error: any) {
        console.error("Error in upload route:", error);
        return NextResponse.json(
            { error: "Failed to process upload", details: error.message },
            { status: 500 }
        );
    }
}
