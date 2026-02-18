// Database types matching Supabase schema (25 tables)
// Auto-generated types are preferred long-term (supabase gen types),
// but these hand-written types ensure type safety during initial dev.

// --- Master tables ---

export type DocumentTypeCode =
  | 'invoice'
  | 'receipt'
  | 'quotation'
  | 'contract'
  | 'bank_statement'
  | 'credit_card'
  | 'other';

export type TaxCode = 'TAX10' | 'TAX8' | 'NONTAX' | 'EXEMPT';

export type ApprovalTypeCode =
  | 'payment'
  | 'expense'
  | 'reimbursement'
  | 'partner_change';

export type AccountCategory =
  | 'asset'
  | 'liability'
  | 'equity'
  | 'revenue'
  | 'expense';

// --- Enums ---

export type UserRole = 'admin' | 'accounting' | 'viewer' | 'approver' | 'sales';

export type DocumentStatus =
  | 'uploaded'
  | 'processing'
  | 'extracted'
  | 'verified'
  | 'error';

export type JournalDraftStatus =
  | 'suggested'
  | 'needs_review'
  | 'confirmed'
  | 'error';

export type JournalEntryStatus = 'draft' | 'confirmed' | 'reversed';

export type OrderType = 'sales' | 'purchase';
export type OrderStatus = 'open' | 'closed' | 'canceled';

export type InvoiceType = 'sales' | 'purchase';
export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'canceled';

export type PaymentType = 'bank' | 'credit_card' | 'cash' | 'other';
export type PaymentDirection = 'in' | 'out';

export type ReconciliationStatus = 'suggested' | 'confirmed' | 'rejected';

export type ApprovalStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'returned';

export type ApprovalAction = 'approve' | 'reject' | 'return';

export type PartnerCategory = 'customer' | 'supplier' | 'both';

export type TenantPlan = 'free' | 'pro' | 'enterprise';
export type TenantStatus = 'active' | 'suspended';

// --- Row types ---

export interface Tenant {
  id: string;
  name: string;
  plan: TenantPlan;
  status: TenantStatus;
  created_at: string;
  updated_at: string;
}

export interface TenantUser {
  tenant_id: string;
  user_id: string;
  role: UserRole;
  custom_role_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TenantCustomRole {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  base_role: UserRole;
  permissions: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenantSettings {
  tenant_id: string;
  auto_confirm_high: number;
  auto_confirm_mid: number;
  ai_daily_cost_limit_jpy: number;
  created_at: string;
  updated_at: string;
}

export interface Partner {
  id: string;
  tenant_id: string;
  name: string;
  name_kana: string | null;
  registration_number: string | null;
  category: PartnerCategory;
  address: string | null;
  phone: string | null;
  email: string | null;
  bank_info: string | null;
  is_active: boolean;
  merged_into_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  tenant_id: string;
  partner_id: string | null;
  storage_bucket: string;
  file_key: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  file_hash_sha256: string | null;
  document_type: DocumentTypeCode;
  status: DocumentStatus;
  document_date: string | null;
  amount: number | null;
  tax_amount: number | null;
  tax_rate: number | null;
  registration_number: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentExtraction {
  id: string;
  tenant_id: string;
  document_id: string;
  extracted_json: Record<string, unknown>;
  model_provider: string | null;
  model_name: string | null;
  model_version: string | null;
  confidence: number | null;
  extracted_at: string;
  created_by: string | null;
  created_at: string;
}

export interface InvoiceCheck {
  id: string;
  tenant_id: string;
  document_id: string;
  status: 'ok' | 'needs_review' | 'ng';
  reasons: Record<string, unknown>;
  checked_at: string;
  created_at: string;
}

export interface JournalDraft {
  id: string;
  tenant_id: string;
  document_id: string | null;
  status: JournalDraftStatus;
  candidates_json: Record<string, unknown>;
  selected_index: number | null;
  confidence: number | null;
  ai_reason: string | null;
  model_version: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface JournalEntry {
  id: string;
  tenant_id: string;
  entry_date: string;
  description: string | null;
  source_type: 'document' | 'order' | 'invoice' | 'manual';
  source_id: string | null;
  status: JournalEntryStatus;
  total_amount: number;
  tax_amount: number;
  journal_draft_id: string | null;
  created_by: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface JournalLine {
  id: string;
  tenant_id: string;
  journal_entry_id: string;
  line_no: number;
  account_code: string;
  account_name: string | null;
  debit: number;
  credit: number;
  tax_code: TaxCode | null;
  partner_id: string | null;
  department: string | null;
  memo: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  tenant_id: string;
  order_type: OrderType;
  order_no: string;
  partner_id: string;
  order_date: string;
  due_date: string | null;
  status: OrderStatus;
  department: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderLine {
  id: string;
  tenant_id: string;
  order_id: string;
  line_no: number;
  item_name: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  amount: number;
  created_at: string;
}

export interface Invoice {
  id: string;
  tenant_id: string;
  invoice_type: InvoiceType;
  invoice_no: string;
  partner_id: string;
  order_id: string | null;
  issue_date: string;
  due_date: string | null;
  status: InvoiceStatus;
  total_amount: number;
  tax_amount: number;
  pdf_document_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLine {
  id: string;
  tenant_id: string;
  invoice_id: string;
  line_no: number;
  item_name: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  tax_code: TaxCode | null;
  amount: number;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  tenant_id: string;
  payment_type: PaymentType;
  direction: PaymentDirection;
  occurred_on: string;
  amount: number;
  currency: string;
  description: string | null;
  counterparty_name_raw: string | null;
  source_file_document_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Reconciliation {
  id: string;
  tenant_id: string;
  payment_id: string;
  target_type: 'invoice' | 'journal_entry';
  target_id: string;
  confidence: number | null;
  status: ReconciliationStatus;
  matched_by: string | null;
  matched_at: string;
}

export interface Approval {
  id: string;
  tenant_id: string;
  approval_type: ApprovalTypeCode;
  status: ApprovalStatus;
  amount: number;
  due_date: string | null;
  partner_id: string | null;
  document_id: string | null;
  summary: string | null;
  risk_score: number | null;
  risk_reason: string | null;
  route_json: Record<string, unknown>;
  current_step: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApprovalActionRow {
  id: string;
  tenant_id: string;
  approval_id: string;
  step_no: number;
  action: ApprovalAction;
  comment: string | null;
  acted_by: string | null;
  acted_at: string;
}

export interface AuditLog {
  id: string;
  tenant_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  request_id: string | null;
  ip: string | null;
  user_agent: string | null;
  diff_json: Record<string, unknown>;
  created_at: string;
}

export interface FeedbackEvent {
  id: string;
  tenant_id: string;
  user_id: string | null;
  entity_type: string;
  entity_id: string;
  ai_output_json: Record<string, unknown>;
  user_correction_json: Record<string, unknown>;
  created_at: string;
}
