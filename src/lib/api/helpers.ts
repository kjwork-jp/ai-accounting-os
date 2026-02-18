import { NextRequest, NextResponse } from 'next/server';
import { ZodSchema, ZodError } from 'zod';
import { createServerSupabase, createAdminSupabase } from '@/lib/supabase/server';
import type { UserRole, TenantUser } from '@/types/database';

// --- Error response format (技術設計書 04_API設計詳細) ---

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown[];
  };
}

export function errorResponse(
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: unknown[]
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status }
  );
}

export function badRequest(message: string, details?: unknown[]) {
  return errorResponse('VALIDATION_ERROR', message, 400, details);
}

export function unauthorized(message = 'Authentication required') {
  return errorResponse('UNAUTHORIZED', message, 401);
}

export function forbidden(message = 'Insufficient permissions') {
  return errorResponse('FORBIDDEN', message, 403);
}

export function notFound(message = 'Resource not found') {
  return errorResponse('NOT_FOUND', message, 404);
}

export function conflict(message: string) {
  return errorResponse('CONFLICT', message, 409);
}

export function internalError(message = 'Internal server error') {
  return errorResponse('INTERNAL_ERROR', message, 500);
}

// --- Request validation ---

export function parseBody<T>(schema: ZodSchema<T>, data: unknown): { data: T } | { error: NextResponse } {
  try {
    const parsed = schema.parse(data);
    return { data: parsed };
  } catch (e) {
    if (e instanceof ZodError) {
      return {
        error: badRequest('Validation failed', e.issues.map(issue => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        }))),
      };
    }
    return { error: badRequest('Invalid request body') };
  }
}

export function parseQuery<T>(schema: ZodSchema<T>, params: URLSearchParams): { data: T } | { error: NextResponse } {
  const obj: Record<string, string> = {};
  params.forEach((value, key) => {
    obj[key] = value;
  });
  return parseBody(schema, obj);
}

// --- Auth context ---

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: UserRole;
  tenantUser: TenantUser;
}

/**
 * Authenticate request and resolve tenant context.
 * Returns AuthContext on success, or a NextResponse error.
 */
export async function requireAuth(
  request: NextRequest
): Promise<{ auth: AuthContext } | { error: NextResponse }> {
  // request param reserved for future use (IP extraction, rate limiting)
  void request;

  // Use session client for auth verification (needs user's JWT from cookies)
  const supabase = await createServerSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: unauthorized() };
  }

  // Use admin client for tenant_users query to bypass RLS.
  // Order by created_at ASC for deterministic selection (oldest membership first).
  const admin = createAdminSupabase();
  const { data: tenantUser, error: tuError } = await admin
    .from('tenant_users')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (tuError || !tenantUser) {
    return { error: forbidden('No active tenant membership') };
  }

  return {
    auth: {
      userId: user.id,
      tenantId: tenantUser.tenant_id,
      role: tenantUser.role as UserRole,
      tenantUser: tenantUser as TenantUser,
    },
  };
}

/**
 * Check if user has one of the required roles.
 */
export function requireRole(
  auth: AuthContext,
  allowedRoles: UserRole[]
): NextResponse | null {
  if (!allowedRoles.includes(auth.role)) {
    return forbidden(`Role '${auth.role}' is not allowed. Required: ${allowedRoles.join(', ')}`);
  }
  return null;
}

// --- Request ID for audit correlation ---

let requestCounter = 0;

export function getRequestId(request: NextRequest): string {
  const fromHeader = request.headers.get('x-request-id');
  if (fromHeader) return fromHeader;
  requestCounter += 1;
  return `req_${Date.now()}_${requestCounter}`;
}

// --- JSON response helpers ---

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function created<T>(data: T) {
  return ok(data, 201);
}
