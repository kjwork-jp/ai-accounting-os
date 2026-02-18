# 監視設計書

## 1. 監視アーキテクチャ

```
[ブラウザ] → [Vercel Edge] → [Next.js API Routes] → [Supabase]
                                       ↓                   ↓
                                  [Console Log]      [DB Metrics]
                                       ↓
                              [Vercel Analytics]
```

## 2. 監視項目一覧

### 2.1 アプリケーション監視

| 監視項目 | 方法 | 閾値 | アラート |
|---------|------|------|---------|
| API応答時間 | Vercel Analytics | p95 > 3s | Warning |
| APIエラー率 | Vercel Functions Log | 5xx > 5%/h | Critical |
| ヘルスチェック | `/api/v1/health` 外部監視 | 連続3回失敗 | Critical |
| ビルド失敗 | GitHub Actions / Vercel | ビルド失敗 | Warning |

### 2.2 データベース監視

| 監視項目 | 方法 | 閾値 | アラート |
|---------|------|------|---------|
| DB接続数 | Supabase Dashboard | > 80% of pool | Warning |
| ディスク使用量 | Supabase Dashboard | > 80% | Warning |
| クエリ実行時間 | Supabase Log Explorer | > 5s | Warning |
| RLS違反 | Supabase Log Explorer | 任意のRLS拒否 | Info |

### 2.3 認証監視

| 監視項目 | 方法 | 閾値 | アラート |
|---------|------|------|---------|
| ログイン失敗 | Supabase Auth Logs | 同一IP 10回/10min | Warning |
| セッション数 | Supabase Dashboard | 異常増加 | Info |
| MFA登録率 | カスタムクエリ | - | レポート |

### 2.4 ストレージ監視

| 監視項目 | 方法 | 閾値 | アラート |
|---------|------|------|---------|
| Storage使用量 | Supabase Dashboard | > 80% of limit | Warning |
| アップロード失敗 | アプリログ | > 5回/h | Warning |

### 2.5 外部サービス監視

| 監視項目 | 方法 | 閾値 | アラート |
|---------|------|------|---------|
| Azure DI応答時間 | アプリログ | > 30s | Warning |
| Azure DI API制限 | 429レスポンス | > 3回/min | Warning |
| Claude API応答時間 | アプリログ | > 10s | Info |
| Claude APIコスト | `tenant_settings.ai_daily_cost_limit_jpy` | 日次上限超過 | Critical |

## 3. ログ設計

### 3.1 ログレベル

| レベル | 用途 | 例 |
|--------|------|-----|
| ERROR | サーバーエラー、外部API障害 | DB接続失敗、DI API 500 |
| WARN | 異常だが回復可能 | レート制限、リトライ |
| INFO | 通常業務ログ | ユーザー操作、APIリクエスト |
| DEBUG | 開発用 | クエリ詳細、処理中間データ |

### 3.2 構造化ログフォーマット

```json
{
  "level": "INFO",
  "timestamp": "2026-02-18T12:00:00.000Z",
  "requestId": "req_1708257600_1",
  "tenantId": "uuid",
  "userId": "uuid",
  "action": "document.upload",
  "details": {
    "fileName": "invoice.pdf",
    "fileSize": 1024000,
    "sha256": "abc123..."
  }
}
```

### 3.3 監査ログ（`audit_logs`テーブル）

業務操作の追跡は専用テーブル `audit_logs` で管理。
詳細は `docs/sec-mapping.md` SEC-004 を参照。

## 4. アラート設定方針

### 4.1 通知チャネル

| 重要度 | 通知先 | 応答目標 |
|--------|--------|---------|
| Critical | メール + Slack | 15分以内 |
| Warning | Slack | 1時間以内 |
| Info | ダッシュボード | 日次確認 |

### 4.2 エスカレーション

```
1. 自動復旧試行（リトライ/フェイルオーバー）
   ↓ 復旧しない場合
2. 運用担当者に通知
   ↓ 30分以内に対応なし
3. 開発チームに通知
   ↓ 1時間以内に復旧しない場合
4. マネージャーに通知
```

## 5. ダッシュボード構成

### Vercel Analytics
- リクエスト数/秒
- レスポンスタイム p50/p95/p99
- エラー率
- 地域別レイテンシ

### Supabase Dashboard
- アクティブ接続数
- クエリパフォーマンス
- ストレージ使用量
- Auth アクティブユーザー数
- API リクエスト数

### カスタムダッシュボード（S5実装予定）
- KPI: 月次処理件数/エラー率/AI精度
- テナント別利用状況
- コスト推移

## 6. 定期レポート

| レポート | 頻度 | 内容 |
|---------|------|------|
| ヘルスレポート | 日次 | API可用性、エラー率、レスポンスタイム |
| セキュリティレポート | 週次 | ログイン試行、MFA利用率、監査ログサマリー |
| コストレポート | 月次 | サービス利用量、API呼出数、コスト推移 |
| キャパシティレポート | 月次 | DB使用量、Storage使用量、利用者数推移 |

---

*作成日: 2026-02-18*
*対象: WBS 2.4.3 監視設計*
