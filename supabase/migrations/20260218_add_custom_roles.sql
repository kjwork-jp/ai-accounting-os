-- ============================================
-- Custom Roles Extension
-- テナントごとにカスタムロールを定義し、
-- 基本ロールに加えて細かい権限制御を可能にする。
-- ============================================

CREATE TABLE IF NOT EXISTS public.tenant_custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  base_role text NOT NULL DEFAULT 'viewer'
    CHECK (base_role IN ('admin', 'accounting', 'viewer', 'approver', 'sales')),
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

-- Add optional custom_role_id to tenant_users
ALTER TABLE public.tenant_users
  ADD COLUMN IF NOT EXISTS custom_role_id uuid
    REFERENCES public.tenant_custom_roles(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE public.tenant_custom_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_custom_roles_select"
  ON public.tenant_custom_roles FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM public.tenant_users
    WHERE user_id = auth.uid() AND is_active = true
  ));

CREATE POLICY "tenant_custom_roles_admin"
  ON public.tenant_custom_roles FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.tenant_users
    WHERE user_id = auth.uid() AND role = 'admin' AND is_active = true
  ));

-- Index
CREATE INDEX IF NOT EXISTS idx_custom_roles_tenant
  ON public.tenant_custom_roles(tenant_id);

-- Auto-update updated_at
CREATE TRIGGER set_updated_at_custom_roles
  BEFORE UPDATE ON public.tenant_custom_roles
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

COMMENT ON TABLE public.tenant_custom_roles IS 'テナント固有のカスタムロール定義';
COMMENT ON COLUMN public.tenant_custom_roles.base_role IS '基本ロール（カスタムロールのベースとなる権限セット）';
COMMENT ON COLUMN public.tenant_custom_roles.permissions IS '追加権限の配列 (例: ["documents:upload", "journals:confirm"])';
