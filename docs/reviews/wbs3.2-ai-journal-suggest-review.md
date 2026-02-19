# WBS 3.2 AI仕訳生成 テスト・評価レビュー（実装監査）

- 実施日: 2026-02-19
- 対象: WBS 3.2（3.2.1〜3.2.5）
- レビュー観点:
  1. 要件/設計トレーサビリティ
  2. バグ・要件漏れ
  3. 運用保守性・効率性
  4. ドキュメント整合性
  5. テスト妥当性

## 1. レビュー手法と参照範囲

### 1.1 ドキュメント
- `Claude_Code_Document/WBS.xlsx`（WBS 3.2要件行を抽出確認）
- `docs/plan-wbs3.2-ai-journal-suggest.md`
- `docs/plan-wbs3.1-receipt-ocr.md`
- `docs/verification-guide.md`
- `docs/sec-mapping.md`

### 1.2 実装（主要）
- Worker
  - `worker/src/jobs/journal-suggest.ts`
  - `worker/src/jobs/invoice-validate.ts`
  - `worker/src/index.ts`
- API
  - `src/app/api/v1/journals/drafts/route.ts`
  - `src/app/api/v1/journals/drafts/[id]/route.ts`
  - `src/app/api/v1/journals/drafts/[id]/confirm/route.ts`
  - `src/app/api/v1/journals/entries/route.ts`
- UI
  - `src/components/journals/journal-draft-list.tsx`
  - `src/components/journals/journal-confirm-dialog.tsx`
  - `src/components/journals/document-journal-section.tsx`
- 共通
  - `src/lib/api/helpers.ts`
  - `src/lib/auth/helpers.ts`
  - `src/lib/validators/journals.ts`

### 1.3 テスト実行
- `pnpm lint`
- `pnpm tsc --noEmit`
- `pnpm test`
- `pnpm build`

## 2. 総評

WBS 3.2 の主要フロー（`invoice_validate -> journal_suggest -> drafts表示 -> confirm`）は実装済みで、4-point check も通過。  
一方で、**本番事故につながる設計/実装ギャップが3件（Critical 1件 / High 2件）**確認された。特に `confirm` API の冪等性未実装は二重計上リスクに直結するため、最優先修正を推奨。

## 3. 指摘事項（優先度順）

## 3.1 [Critical] 仕訳確定APIに Idempotency-Key 対応がない（重複確定リスク）

- 要件/設計:
  - プロジェクトルールで `journals/confirm` は Idempotency-Key 対象。
  - WBS3.2計画にも「推奨（二重確定防止）」記載あり。
- 実装:
  - `POST /api/v1/journals/drafts/:id/confirm` でヘッダ読取・保管・再送判定ロジックなし。
- 影響:
  - クライアント再送/タイムアウト再実行で二重リクエストが発生した場合、トランザクション境界次第で重複計上の運用事故リスク。
- 推奨:
  - `Idempotency-Key` を必須化または推奨強制（未指定時は警告ログ）。
  - `journal_entries` か専用テーブルで `(tenant_id, endpoint, idempotency_key)` の一意制約を導入。
  - レスポンス再利用（初回結果返却）を実装。

## 3.2 [High] `journals:view` 権限と API 認可の実装が不整合（viewer が閲覧不可）

- 要件/設計:
  - RBAC定義上 `journals:view` は `viewer` を含む。
- 実装:
  - journals系 GET API で `requireRole(..., ['admin', 'accounting'])` を固定利用。
  - `hasPermission()` ベースの認可を使っていない。
- 影響:
  - 要件上閲覧可能な `viewer` が仕訳一覧/詳細にアクセス不能。
  - ロール追加（custom role）時の拡張性も低い。
- 推奨:
  - API層をロール固定から permission ベースへ移行。
  - `requirePermission('journals:view')` を共通ヘルパとして追加。

## 3.3 [High] 信頼度閾値ロジックで `auto_confirm_mid` を取得しているが未使用

- 要件/設計:
  - 0.9↑ / 0.7-0.9 / 0.7↓ の3段階運用を想定。
- 実装:
  - `worker/src/jobs/journal-suggest.ts` で `auto_confirm_high, auto_confirm_mid` を取得するが、実判定は `high` のみ。
- 影響:
  - テナント設定の `auto_confirm_mid` を変更しても挙動に反映されない。
  - 運用チューニング性が仕様と乖離。
- 推奨:
  - ステータスは現行2値でも、少なくとも `mid` 未満の区分を `ai_reason` や補助フラグに残す。
  - 仕様を2値運用に変更するなら docs/WBS 側を明示修正。

## 3.4 [Medium] 過去学習パターン抽出が「同一取引先」条件になっていない

- 要件/設計:
  - 過去確定パターンの優先は「同一取引先」を前提。
- 実装:
  - `feedback_events` 取得時に `vendor_name` での絞り込みが無く、テナント全体の直近10件を参照。
- 影響:
  - 異なる取引先の修正履歴が混入し、候補品質を悪化させる可能性。
- 推奨:
  - `entity` 側メタデータまたは `user_correction_json` に取引先キーを保存し、条件絞り込みを実装。

## 3.5 [Medium] テストは通るが、異常系の担保が弱い

- 観測:
  - `journal-suggest.test.ts` ではエラー時に「error draft を insert する」分岐でモック不足ログが出ている（`insert is not a function`）。
  - ただしテスト自体は例外期待で通過してしまう。
- 影響:
  - 障害時フォールバック（error draft可視化）の品質保証が不足。
- 推奨:
  - 異常系で `journal_drafts(status=error)` が実際に insert されることを明示assertするテストを追加。
  - API confirm の統合テスト（重複確定、同時実行、権限）を追加。

## 4. ドキュメント整合性レビュー

- 良い点:
  - `docs/plan-wbs3.2-ai-journal-suggest.md` は実装対象・テスト計画・既知課題を詳細化しており、実装コードとの対応は概ね取れている。
  - SSE未実装について、計画内で段階導入方針（ポーリング代替）を明示している点は妥当。
- 改善点:
  - 実装上は permission ではなく role 固定認可となっているため、RBAC節の記載と実態差分がある。
  - `auto_confirm_mid` の実効性がない点を、仕様か実装のどちらかに合わせて統一すべき。

## 5. 推奨アクション（実施順）

1. **P0**: confirm API の冪等性実装（キー受理 + 一意制約 + 再送時再利用）。
2. **P1**: journals API を permission ベース認可に変更。
3. **P1**: journal_suggest の mid 閾値を実動作へ反映（または仕様明確化）。
4. **P2**: 過去パターンを同一取引先で絞るデータ設計を追加。
5. **P2**: 異常系テスト（error draft insert、同時確定競合）を補強。

## 6. 判定

- 実装完成度: **高（主要機能は動作）**
- リリース可否: **条件付き可**（P0/P1を是正後に本番投入推奨）
- 総合評価: **B+**（機能は揃っているが、会計基盤としては再送安全性と認可整合が未達）
