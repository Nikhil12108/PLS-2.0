import { NextRequest, NextResponse } from 'next/server';
import { getUserIdentity } from '@/lib/auth';
import { auditLog } from '@/lib/audit-logger';

/**
 * Lightweight audit endpoint for client-side events.
 */
export async function POST(request: NextRequest) {
    try {
        const userId = getUserIdentity(request);
        const { event, details } = await request.json();

        if (!event) {
            return NextResponse.json({ error: 'Missing event name' }, { status: 400 });
        }

        auditLog({
            request, action: 'CLIENT_EVENT',
            resource: { type: 'client', name: event },
            status: { code: 200, result: 'SUCCESS' },
            details
        });

        return NextResponse.json({ status: 'ok' });
    } catch (error: any) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[audit-api] Error processing audit event:', error);
        auditLog({
            request, action: 'SYSTEM_ERROR',
            resource: { type: 'API', path: '/api/audit' },
            status: { code: 500, result: 'FAILURE' },
            details: { error: msg }
        });
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
