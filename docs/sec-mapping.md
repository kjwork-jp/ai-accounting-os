# セキュリティ要件マッピング表

要件定義書 SEC-001〜SEC-005 に対するマネージドサービス充足状況。

## マッピング一覧

| 要件ID | 要件名 | 充足方法 | サービス/機能 | 状態 |
|--------|--------|---------|-------------|------|
| SEC-001 | 認証・認可 | マネージドサービス | Supabase Auth (Email + TOTP MFA + Google OAuth) | **充足** |
| SEC-002 | 通信暗号化 | インフラ標準 | Supabase: TLS 1.2+強制 / Vercel: HTTPS自動 / Azure: TLS 1.2+ | **充足** |
| SEC-003 | データ暗号化 | マネージドサービス | Supabase PostgreSQL: AES-256保存時暗号化 / Supabase Storage: AES-256 | **充足** |
| SEC-004 | 監査ログ | アプリ実装 | `audit_logs`テーブル + `insertAuditLog()` + 監査ログ画面 | **充足** |
| SEC-005 | アクセス制御 | DB + アプリ | RLS 89ポリシー + RBAC 5ロール + カスタムロール + API認可チェック | **充足** |

## SEC-001: 認証・認可 詳細

### 認証方式
| 方式 | 実装 | 備考 |
|------|------|------|
| メール+パスワード | Supabase Auth `signInWithPassword` | パスワード8文字以上 |
| TOTP MFA | Supabase Auth MFA API (`enroll`/`challenge`/`verify`) | QRコード+シークレットキー表示 |
| Google OAuth | Supabase Auth `signInWithOAuth` | `/auth/callback`でセッション確立 |
| セッション管理 | Supabase SSR (`@supabase/ssr`) | Cookieベース、自動リフレッシュ |

### 認可レイヤー
| レイヤー | 方式 | 実装箇所 |
|---------|------|---------|
| DB層 | RLS (Row Level Security) | 89ポリシー、`is_tenant_member`関数でテナント分離 |
| API層 | `requireAuth()` + `requireRole()` | `src/lib/api/helpers.ts` |
| ミドルウェア | セッション検証 + リダイレクト | `src/middleware.ts` |
| UI層 | ロール別サイドバー表示 | `src/components/layouts/sidebar-nav.tsx` |

## SEC-002: 通信暗号化 詳細

| 区間 | プロトコル | 管理主体 |
|------|----------|---------|
| ブラウザ ↔ Vercel | HTTPS (TLS 1.2+) | Vercel自動証明書 |
| Vercel ↔ Supabase | HTTPS (TLS 1.2+) | Supabase標準 |
| Vercel ↔ Azure DI | HTTPS (TLS 1.2+) | Azure標準 |
| Vercel ↔ Azure Redis | TLS 1.2+ | Azure Redis設定 |

## SEC-003: データ暗号化 詳細

| データ種別 | 保存場所 | 暗号化方式 |
|-----------|---------|-----------|
| PostgreSQL全データ | Supabase DB | AES-256 (保存時暗号化) |
| ファイルストレージ | Supabase Storage | AES-256 (S3互換暗号化) |
| バックアップ | Supabase管理 | 暗号化バックアップ |
| 環境変数 | Vercel/ACA | プラットフォーム暗号化 |

## SEC-004: 監査ログ 詳細

### 記録対象操作
| 操作カテゴリ | 記録イベント |
|-------------|------------|
| ユーザー管理 | 作成/更新/無効化 |
| テナント | 作成/設定変更 |
| カスタムロール | 作成/更新/削除 |
| 証憑 | アップロード/分類変更 |
| 仕訳 | 確定/修正/取消 |
| 決裁 | 申請/承認/差戻/却下 |

### 記録項目
- `tenant_id`: テナントID
- `action`: 操作種別 (create/update/delete/disable)
- `entity_type`: 対象種別 (tenant_users/documents/etc.)
- `entity_id`: 対象ID
- `entity_name`: 対象名称
- `actor_user_id`: 実行者ID
- `actor_name`: 実行者名
- `diff_json`: 変更内容 (before/after)
- `request_id`: リクエスト追跡ID

### 検索機能
4キー検索: 期間(`from`/`to`)、操作者(`actor`)、操作種別(`action`)、対象種別(`entity_type`)

## SEC-005: アクセス制御 詳細

### ベースロール権限マトリクス

| 権限 | admin | accounting | approver | sales | viewer |
|------|-------|-----------|----------|-------|--------|
| users:read | ✓ | - | - | - | - |
| users:write | ✓ | - | - | - | - |
| settings:read | ✓ | - | - | - | - |
| settings:write | ✓ | - | - | - | - |
| documents:read | ✓ | ✓ | ✓ | ✓ | ✓ |
| documents:write | ✓ | ✓ | - | ✓ | - |
| journals:read | ✓ | ✓ | ✓ | - | ✓ |
| journals:write | ✓ | ✓ | - | - | - |
| invoices:read | ✓ | ✓ | ✓ | ✓ | ✓ |
| invoices:write | ✓ | ✓ | - | ✓ | - |
| approvals:read | ✓ | ✓ | ✓ | ✓ | ✓ |
| approvals:write | ✓ | ✓ | ✓ | - | - |
| partners:read | ✓ | ✓ | - | ✓ | ✓ |
| partners:write | ✓ | ✓ | - | ✓ | - |
| reports:read | ✓ | ✓ | ✓ | - | ✓ |
| audit_logs:read | ✓ | ✓ | - | - | - |

### カスタムロール
- `base_role`の権限に加え、`permissions` JSONB配列で追加権限を付与可能
- テナント単位で作成・管理
- `tenant_custom_roles`テーブルで管理

---

*作成日: 2026-02-18*
*対象要件: SEC-001〜SEC-005*
