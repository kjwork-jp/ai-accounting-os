-- Add entity_name column to audit_logs for human-readable entity identification
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_name text;

COMMENT ON COLUMN public.audit_logs.entity_name IS 'Human-readable name of the entity (e.g., user name, role name)';
