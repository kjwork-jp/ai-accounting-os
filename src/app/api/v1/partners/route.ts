import { NextRequest } from 'next/server';
import { requireAuth, requireRole, ok, created, parseBody, parseQuery, internalError, conflict, getRequestId } from '@/lib/api/helpers';
import { createAdminSupabase } from '@/lib/supabase/server';
import { partnersQuerySchema, partnerCreateSchema } from '@/lib/validators/partners';
import { insertAuditLog } from '@/lib/audit/logger';
import { findSimilarPartners } from '@/lib/partners/name-matching';

/**
 * GET /api/v1/partners
 * List partners with search, filtering, and pagination.
 * Requires: partners:view (admin, accounting, viewer)
 */
export async function GET(request: NextRequest) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleError = requireRole(result.auth, ['admin', 'accounting', 'viewer']);
  if (roleError) return roleError;

  const queryResult = parseQuery(partnersQuerySchema, request.nextUrl.searchParams);
  if ('error' in queryResult) return queryResult.error;

  const { page, per_page, search, category, is_active } = queryResult.data;
  const admin = createAdminSupabase();

  let query = admin
    .from('partners')
    .select('*', { count: 'exact' })
    .eq('tenant_id', result.auth.tenantId)
    .is('merged_into_id', null)
    .order('name', { ascending: true })
    .range((page - 1) * per_page, page * per_page - 1);

  if (search) {
    query = query.or(`name.ilike.%${search}%,name_kana.ilike.%${search}%`);
  }
  if (category) {
    query = query.eq('category', category);
  }
  if (is_active !== undefined) {
    query = query.eq('is_active', is_active);
  }

  const { data, error, count } = await query;

  if (error) {
    return internalError(`取引先一覧の取得に失敗しました: ${error.message}`);
  }

  return ok({
    data: data ?? [],
    pagination: {
      page,
      per_page,
      total: count ?? 0,
      total_pages: Math.ceil((count ?? 0) / per_page),
    },
  });
}

/**
 * POST /api/v1/partners
 * Create a new partner.
 * Requires: partners:manage (admin, accounting)
 */
export async function POST(request: NextRequest) {
  const result = await requireAuth(request);
  if ('error' in result) return result.error;

  const roleError = requireRole(result.auth, ['admin', 'accounting']);
  if (roleError) return roleError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const { badRequest } = await import('@/lib/api/helpers');
    return badRequest('Invalid JSON body');
  }

  const parsed = parseBody(partnerCreateSchema, body);
  if ('error' in parsed) return parsed.error;

  const admin = createAdminSupabase();

  // Check for exact name duplicate
  const { data: existing } = await admin
    .from('partners')
    .select('id, name')
    .eq('tenant_id', result.auth.tenantId)
    .eq('name', parsed.data.name)
    .is('merged_into_id', null)
    .limit(1);

  if (existing && existing.length > 0) {
    return conflict(`取引先名「${parsed.data.name}」は既に登録されています`);
  }

  // Insert partner
  const { data, error } = await admin
    .from('partners')
    .insert({
      tenant_id: result.auth.tenantId,
      name: parsed.data.name,
      name_kana: parsed.data.name_kana ?? null,
      registration_number: parsed.data.registration_number ?? null,
      category: parsed.data.category,
      address: parsed.data.address ?? null,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      bank_info: parsed.data.bank_info ?? null,
      created_by: result.auth.userId,
    })
    .select()
    .single();

  if (error) {
    return internalError(`取引先の作成に失敗しました: ${error.message}`);
  }

  // Check for similar partners (name matching warning)
  const { data: allPartners } = await admin
    .from('partners')
    .select('id, name')
    .eq('tenant_id', result.auth.tenantId)
    .is('merged_into_id', null)
    .neq('id', data.id);

  const similarPartners = allPartners
    ? findSimilarPartners(parsed.data.name, allPartners)
    : [];

  // Audit log
  await insertAuditLog({
    tenantId: result.auth.tenantId,
    actorUserId: result.auth.userId,
    action: 'partner.create',
    entityType: 'partners',
    entityId: data.id,
    entityName: data.name,
    requestId: getRequestId(request),
  });

  return created({
    data,
    warnings: similarPartners.length > 0
      ? { similar_partners: similarPartners }
      : undefined,
  });
}
