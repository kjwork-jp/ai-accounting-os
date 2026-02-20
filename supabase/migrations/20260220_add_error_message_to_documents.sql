-- Add error_message column to documents table for storing worker error details
ALTER TABLE documents ADD COLUMN IF NOT EXISTS error_message text;

-- Index not needed (only queried for single-row detail view)
COMMENT ON COLUMN documents.error_message IS 'Worker error message when status=error. Cleared on retry.';
