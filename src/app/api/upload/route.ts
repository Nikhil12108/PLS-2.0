import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { openai } from '@/lib/openai';
import { MAX_FILE_SIZE_BYTES, ALLOWED_FILE_EXTENSIONS } from '@/lib/constants';
import { getUserIdentity } from '@/lib/auth';
import { auditLog } from '@/lib/audit-logger';
import type { UploadStats } from '@/types';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
    try {
        const userId = getUserIdentity(request);
        const formData = await request.formData();
        const files = formData.getAll('files') as File[];

        if (!files || files.length === 0) {
            return NextResponse.json({ error: 'No files provided' }, { status: 400 });
        }

        // Validate file sizes and types
        for (const file of files) {
            if (file.size > MAX_FILE_SIZE_BYTES) {
                const msg = `File "${file.name}" exceeds maximum size of ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`;
                auditLog({
                    request, action: 'FILE_UPLOAD',
                    resource: { type: 'file', name: file.name, size: file.size, path: 'rejected' },
                    status: { code: 400, result: 'FAILURE' },
                    details: { error: msg }
                });
                return NextResponse.json({ error: msg }, { status: 400 });
            }
            const ext = '.' + file.name.split('.').pop()?.toLowerCase();
            if (!ALLOWED_FILE_EXTENSIONS.includes(ext as typeof ALLOWED_FILE_EXTENSIONS[number])) {
                const msg = `File "${file.name}" has unsupported extension. Allowed: ${ALLOWED_FILE_EXTENSIONS.join(', ')}`;
                auditLog({
                    request, action: 'FILE_UPLOAD',
                    resource: { type: 'file', name: file.name, size: file.size, path: 'rejected' },
                    status: { code: 400, result: 'FAILURE' },
                    details: { error: msg }
                });
                return NextResponse.json({ error: msg }, { status: 400 });
            }
        }

        console.log(`[upload] Starting upload of ${files.length} files to OpenAI storage`);

        const uploadedFileIds: string[] = [];
        const errors: string[] = [];

        const uploadPromises = files.map(async (file) => {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const fileHash = 'sha256:' + crypto.createHash('sha256').update(buffer).digest('hex');

                const fileUploadResponse = await openai.files.create({
                    file: file,
                    purpose: 'assistants',
                });
                uploadedFileIds.push(fileUploadResponse.id);
                console.log(`[upload] Uploaded: ${file.name} (${fileUploadResponse.id})`);
                auditLog({
                    request, action: 'FILE_UPLOAD',
                    resource: { type: 'file', name: file.name, size: file.size, hash: fileHash, path: fileUploadResponse.id },
                    status: { code: 200, result: 'SUCCESS' }
                });
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                console.error(`[upload] Failed: ${file.name}:`, msg);
                errors.push(`Failed to upload '${file.name}': ${msg}`);
                auditLog({
                    request, action: 'FILE_UPLOAD',
                    resource: { type: 'file', name: file.name, size: file.size, path: 'failed' },
                    status: { code: 500, result: 'FAILURE' },
                    details: { error: msg }
                });
            }
        });

        await Promise.all(uploadPromises);

        if (uploadedFileIds.length === 0) {
            return NextResponse.json(
                { success: false, message: 'No files were uploaded successfully.', errors },
                { status: 500 }
            );
        }

        let vectorStoreId = "";
        try {
            console.log("[upload] Creating vector store...");
            const vectorStore = await openai.vectorStores.create({
                name: "Document Assistant Vector Store"
            });
            vectorStoreId = vectorStore.id;

            console.log(`[upload] Attaching files to vector store ${vectorStoreId}...`);
            await openai.vectorStores.fileBatches.createAndPoll(
                vectorStoreId,
                { file_ids: uploadedFileIds }
            );
            console.log("[upload] Vector store ready");
        } catch (vsError: unknown) {
            const msg = vsError instanceof Error ? vsError.message : String(vsError);
            console.error("[upload] Vector store creation failed:", msg);
            errors.push(`Vector store creation failed: ${msg}`);
        }

        auditLog({
            request, action: 'FILE_UPLOAD',
            resource: { type: 'vectorStore', id: vectorStoreId },
            status: { code: 200, result: 'SUCCESS' },
            details: { files_count: uploadedFileIds.length, event: 'vector_store_created' }
        });

        const stats: UploadStats = {
            total_files_submitted: files.length,
            successful_uploads: uploadedFileIds.length,
            success: uploadedFileIds.length > 0 && vectorStoreId !== "",
            failed: errors.length,
            uploaded_file_ids: uploadedFileIds,
            vector_store_id: vectorStoreId,
            errors: errors
        };

        return NextResponse.json(stats);

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error("[upload] Error:", msg);
        auditLog({
            request, action: 'SYSTEM_ERROR',
            resource: { type: 'API', path: '/api/upload' },
            status: { code: 500, result: 'FAILURE' },
            details: { error: msg }
        });
        return NextResponse.json(
            { error: "Failed to process upload", details: msg },
            { status: 500 }
        );
    }
}
