import { NextRequest } from 'next/server';
import { getUserIdentity } from '@/lib/auth';

export type AuditAction = 
    | 'FILE_UPLOAD' 
    | 'FILE_DOWNLOAD' 
    | 'VIEW_DASHBOARD' 
    | 'DATA_EXTRACT' 
    | 'DATA_REFINE' 
    | 'DATA_VALIDATE'
    | 'CLIENT_EVENT'
    | 'SYSTEM_ERROR';

export interface AuditResource {
    type: 'file' | 'API' | 'dashboard' | 'vectorStore' | 'client' | 'batch';
    name?: string;
    id?: string;
    size?: number;
    hash?: string;
    path?: string;
}

export interface AuditStatus {
    code: number;
    result: 'SUCCESS' | 'FAILURE';
}

export interface AuditLogParams {
    request: NextRequest;
    action: AuditAction;
    resource: AuditResource;
    status: AuditStatus;
    details?: any;
}

export function auditLog({ request, action, resource, status, details }: AuditLogParams) {
    const user = getUserIdentity(request);
    
    // Attempt standard UUID, fallback to basic pseudo-random if unavailable
    let fallbackId = Math.random().toString(36).substring(2, 10);
    let uuid = fallbackId;
    try {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            uuid = crypto.randomUUID();
        }
    } catch {
        // ignore
    }
    
    // Extract headers
    const sessionId = request.headers.get('x-session-id') || `sess_${uuid.substring(0, 8)}`;
    const correlationId = request.headers.get('x-correlation-id') || `corr_${uuid.substring(0, 8)}`;
    const publicIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    let endpoint = 'unknown';
    try {
        endpoint = new URL(request.url).pathname;
    } catch {
        endpoint = request.url;
    }

    const logEntry = {
        type: "AUDIT",
        timestamp: new Date().toISOString(),
        user: user,
        session_id: sessionId,
        correlation_id: correlationId,
        public_ip: publicIp,
        action: action,
        resource: resource,
        request: {
            method: request.method || 'UNKNOWN',
            endpoint: endpoint,
            user_agent: userAgent
        },
        status: status,
        ...(details && { details })
    };

    // Print as a single line JSON string for structured logging tools to ingest
    console.log(JSON.stringify(logEntry));
    
    // If it's a failure (code >= 400), we also log it to console.error
    if (status.code >= 400) {
        console.error(JSON.stringify(logEntry));
    }
}
