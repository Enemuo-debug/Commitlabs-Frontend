import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

// ─── Request Correlation ────────────────────────────────────────────────────────

/**
 * Generate or extract correlation ID from request headers.
 * Correlation IDs help track requests across services and logs.
 */
export function getCorrelationId(req: Request | NextRequest): string {
    // Try to get from header first
    const fromHeader = req.headers.get('x-correlation-id') || req.headers.get('x-request-id');
    if (fromHeader) {
        return fromHeader;
    }
    
    // Generate new one
    return randomBytes(16).toString('hex');
}

// ─── Success shape ────────────────────────────────────────────────────────────

export interface OkResponse<T> {
  success: true;
  data: T;
  meta?: {
    correlationId?: string;
    timestamp?: string;
    [key: string]: unknown;
  };
}

// ─── Error shape ──────────────────────────────────────────────────────────────

export interface FailResponse {
  success: false;
  error: {
    code: string;
    message: string;
    correlationId?: string;
    timestamp?: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = OkResponse<T> | FailResponse;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a standard JSON success response with correlation ID.
 *
 * @example
 * return ok({ status: 'healthy' });
 * // { success: true, data: { status: 'healthy' }, meta: { correlationId: '...', timestamp: '...' } }
 *
 * @example
 * return ok(items, { total: 42, page: 1 });
 * // { success: true, data: [...], meta: { total: 42, page: 1, correlationId: '...', timestamp: '...' } }
 *
 * @example
 * return ok(data, undefined, 201);  // custom HTTP status, no meta
 */
export function ok<T>(
  data: T,
  metaOrStatus?: Record<string, unknown> | number,
  status = 200,
  correlationId?: string,
): NextResponse<OkResponse<T>> {
  let resolvedMeta: Record<string, unknown> | undefined;
  let resolvedStatus = status;

  if (typeof metaOrStatus === "number") {
    resolvedStatus = metaOrStatus;
  } else {
    resolvedMeta = metaOrStatus;
  }

  const timestamp = new Date().toISOString();
  const responseMeta: Record<string, unknown> = {
    correlationId,
    timestamp,
    ...resolvedMeta,
  };

  const body: OkResponse<T> = {
    success: true,
    data,
    meta: Object.keys(responseMeta).length > 0 ? responseMeta : undefined,
  };
  
  const response = NextResponse.json(body, { status: resolvedStatus });
  
  // Add correlation ID to response headers for tracing
  if (correlationId) {
    response.headers.set('x-correlation-id', correlationId);
  }
  
  return response;
}

/**
 * Returns a standard JSON error response with correlation ID.
 *
 * @param code         - Short machine-readable error code, e.g. 'NOT_FOUND'
 * @param message      - Human-readable description safe for UI display
 * @param details      - Optional extra context (omit in production for sensitive errors)
 * @param status       - HTTP status code (default 500)
 * @param correlationId - Request correlation ID for tracing
 *
 * @example
 * return fail('NOT_FOUND', 'Commitment not found.', undefined, 404, correlationId);
 * // { success: false, error: { code: 'NOT_FOUND', message: 'Commitment not found.', correlationId: '...', timestamp: '...' } }
 */
export function fail(
  code: string,
  message: string,
  details?: unknown,
  status = 500,
  correlationId?: string,
): NextResponse<FailResponse> {
  const timestamp = new Date().toISOString();
  
  const body: FailResponse = {
    success: false,
    error: {
      code,
      message,
      correlationId,
      timestamp,
      ...(details !== undefined ? { details } : {}),
    },
  };
  
  const response = NextResponse.json(body, { status });
  
  // Add correlation ID to response headers for tracing
  if (correlationId) {
    response.headers.set('x-correlation-id', correlationId);
  }
  
  return response;
}
