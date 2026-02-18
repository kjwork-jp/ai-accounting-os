import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabase, createAdminSupabase } from '@/lib/supabase/server';
import { insertAuditLog } from '@/lib/audit/logger';

const createTenantSchema = z.object({
  name: z.string().min(1).max(100),
  plan: z.enum(['free', 'pro', 'enterprise']).optional().default('free'),
});

/**
 * POST /api/v1/tenants — Create a new tenant.
 * The authenticated user becomes the admin of the new tenant.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 }
    );
  }

  const body = await request.json();
  const parsed = createTenantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
      { status: 400 }
    );
  }

  const admin = createAdminSupabase();

  // Check if user already belongs to a tenant
  const { data: existing } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: { code: 'CONFLICT', message: '既にテナントに所属しています' } },
      { status: 409 }
    );
  }

  // Create tenant
  const { data: tenant, error: tenantError } = await admin
    .from('tenants')
    .insert({
      name: parsed.data.name,
      plan: parsed.data.plan,
      status: 'active',
    })
    .select()
    .single();

  if (tenantError || !tenant) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: tenantError?.message ?? 'テナントの作成に失敗しました' } },
      { status: 500 }
    );
  }

  // Create default tenant settings
  await admin.from('tenant_settings').insert({
    tenant_id: tenant.id,
    auto_confirm_high: 0.90,
    auto_confirm_mid: 0.70,
    ai_daily_cost_limit_jpy: 0,
  });

  // Assign user as admin of the new tenant
  const { error: tuError } = await admin.from('tenant_users').insert({
    tenant_id: tenant.id,
    user_id: user.id,
    role: 'admin',
    is_active: true,
  });

  if (tuError) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: tuError.message } },
      { status: 500 }
    );
  }

  await insertAuditLog({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: 'create',
    entityType: 'tenants',
    entityId: tenant.id,
    entityName: tenant.name,
  });

  return NextResponse.json({ data: tenant }, { status: 201 });
}
