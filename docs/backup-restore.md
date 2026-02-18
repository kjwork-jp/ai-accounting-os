# バックアップ・リストア手順書

## 1. バックアップ体制

### 1.1 Supabase 自動バックアップ

| 項目 | 設定 |
|------|------|
| バックアップ頻度 | 日次自動バックアップ (Supabase管理) |
| 保持期間 | Pro: 7日間 / Team: 14日間 |
| 対象 | PostgreSQL全データ + Storage |
| 暗号化 | AES-256 (保存時暗号化) |
| Point-in-Time Recovery | Pro以上で利用可能 |

### 1.2 バックアップ対象一覧

| データ種別 | 保存場所 | バックアップ方法 | RPO |
|-----------|---------|----------------|-----|
| PostgreSQL全テーブル | Supabase DB | 自動日次バックアップ | 24h (PITR有効時: 数分) |
| Storageファイル | Supabase Storage | 自動日次バックアップ | 24h |
| 環境変数 | Vercel | プラットフォーム管理 | - |
| ソースコード | GitHub | Git履歴 | リアルタイム |

## 2. 手動バックアップ手順

### 2.1 PostgreSQLダンプ

```bash
# Supabase CLIでデータベースダンプ
supabase db dump --linked -f backup_$(date +%Y%m%d).sql

# データのみダンプ（スキーマ除外）
supabase db dump --linked --data-only -f data_$(date +%Y%m%d).sql
```

### 2.2 特定テーブルのバックアップ

```sql
-- 監査ログのCSVエクスポート
COPY (
  SELECT * FROM audit_logs
  WHERE created_at >= NOW() - INTERVAL '30 days'
  ORDER BY created_at
) TO STDOUT WITH CSV HEADER;
```

### 2.3 Storageファイルのバックアップ

```bash
# Supabase CLIでStorageファイル一覧取得
supabase storage ls documents --linked

# 個別ファイルダウンロード
supabase storage cp documents/<file_key> ./backup/ --linked
```

## 3. リストア手順

### 3.1 Supabase管理画面からのリストア

1. [Supabase Dashboard](https://supabase.com/dashboard) にログイン
2. プロジェクト選択 → **Settings** → **Database**
3. **Backups** セクションで対象日時のバックアップを選択
4. **Restore** ボタンをクリック
5. 確認ダイアログで **Confirm** を押下
6. リストア完了まで待機（数分〜数十分）

### 3.2 SQLダンプからのリストア

```bash
# フルリストア（注意: 既存データを上書き）
psql $DATABASE_URL < backup_20260218.sql

# データのみリストア
psql $DATABASE_URL < data_20260218.sql
```

### 3.3 Point-in-Time Recovery (PITR)

1. Supabase Dashboard → **Settings** → **Database** → **Backups**
2. **Point in Time Recovery** タブを選択
3. 復旧対象の日時を指定
4. **Recover** をクリック
5. 新しいブランチまたはプロジェクトとしてリストア

## 4. 障害時の対応フロー

```
1. 障害検知
   ↓
2. 影響範囲の確認
   - データ損失の有無
   - サービス影響の範囲
   ↓
3. 最新バックアップの確認
   - Supabase Dashboard → Backups
   - 最終バックアップ日時の確認
   ↓
4. リストア方式の決定
   - 全体リストア: Supabase管理画面から
   - 部分リストア: SQLダンプから特定テーブル
   - PITR: 特定時点への復旧
   ↓
5. リストア実行
   ↓
6. 動作確認
   - ヘルスチェック: GET /api/v1/health
   - ログイン確認
   - データ整合性確認
   ↓
7. 正常復旧の報告
```

## 5. テスト手順

### 月次バックアップテスト

1. 開発環境でバックアップを取得
2. テスト環境にリストア
3. 以下を確認:
   - テーブル数・レコード数の一致
   - RLSポリシーの動作
   - 認証の動作
   - Storage内ファイルの存在

---

*作成日: 2026-02-18*
*対象: WBS 2.4.2 BK・リストア手順書*
