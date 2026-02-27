# WBS 3.3〜3.7 テスト・評価レビュー（S3実装）

実施日: 2026-02-27  
対象: WBS 3.3 帳簿・出力 / 3.4 明細取込・突合 / 3.5 取引先管理 / 3.6 証憑検索(電帳法) / 3.7 既存会計CSV取込(簡易)

## 1. レビュー方法

- 要件・設計の参照元として `docs/plan-wbs3.3-3.7-s3-implementation.md` を基準に、API/画面/ロジックを突合。
- 4-point check（lint → typecheck → test → build）を実行。
- 仕様適合・バグ・保守性・運用性・ドキュメント整合性の観点で評価。

## 2. 4-point check結果

- `pnpm lint`: 成功（Warningあり）
- `pnpm tsc --noEmit`: 成功
- `pnpm test`: 成功（45 tests）
- `pnpm build`: 成功（Warningあり）

## 3. 総合評価

- **機能実装の到達度**: 高い（WBS 3.3〜3.7の主要API/画面は存在）
- **本番運用観点**: **要改善**（Critical 1件、High 3件、Medium 4件）
- **総合判定**: **条件付き合格（B）**

## 4. 指摘事項（優先度順）

## 4.1 Critical

### C-1. 明細突合の「確定」UIが実際には確定APIを呼ばない

- 現状、`ReconciliationList` の `handleConfirm()` は `POST /api/v1/reconciliations/suggest` を再度呼ぶのみで、`/api/v1/reconciliations/[id]/confirm` を呼んでいない。
- そのため「確定しました」のトースト表示とUI除外は行うが、DB状態は確定に遷移しない可能性が高い。

**該当箇所**
- `src/components/payments/reconciliation-list.tsx`

**推奨対応**
1. suggest APIで `reconciliation.id` を返却。
2. UIはそのIDで confirm APIを呼ぶ。
3. confirm成功時にのみUIから行を除外し、失敗時は明示エラー表示。

## 4.2 High

### H-1. 3.6 電帳法6キー検索が設計値に未達（tax_rate未実装）

- 計画書では `documentsListQuerySchema` に `tax_rate` を追加する設計。
- 実装は `registration_number` と `partner_name` のみで、`tax_rate` の入力・バリデーション・APIフィルタが未実装。

**該当箇所**
- `docs/plan-wbs3.3-3.7-s3-implementation.md`
- `src/lib/validators/documents.ts`
- `src/components/documents/document-search-panel.tsx`
- `src/app/api/v1/documents/route.ts`

**推奨対応**
- `tax_rate` フィルタをUI/validator/APIに追加し、6キー要件を満たす。

### H-2. 会計CSV取込で仕訳行insert失敗時も `imported++` される

- `journal_entries` insert成功後、`journal_lines` insertが失敗しても `imported++` される実装。
- 結果として「取込成功件数」が過大報告される。

**該当箇所**
- `src/app/api/v1/imports/accounting-csv/route.ts`

**推奨対応**
- 行insert失敗時は `failed++` に振替し、必要なら作成済みentryをロールバック（削除）する。
- 可能なら1レコード単位トランザクション化。

### H-3. 計画書上の冪等性方針と実装が不一致

- 計画書では confirm系APIに `Idempotency-Key` を明記。
- `partners/:id/merge` と `reconciliations/:id/confirm` はヘッダ受理や一意制約連動の実装がない。

**該当箇所**
- `docs/plan-wbs3.3-3.7-s3-implementation.md`
- `src/app/api/v1/partners/[id]/merge/route.ts`
- `src/app/api/v1/reconciliations/[id]/confirm/route.ts`

**推奨対応**
- `Idempotency-Key` を保存・再利用できる共通機構（idempotency table）を導入。

## 4.3 Medium

### M-1. `journals` ページの責務とS3計画の記述が不一致

- 計画書では `src/app/(dashboard)/journals/page.tsx` をS3タブ構成化とあるが、実際のS3機能（仕訳一覧/試算表/消費税）は `reports/page.tsx` 側に実装。
- `journals/page.tsx` はAI仕訳ドラフト管理専用のまま。

**該当箇所**
- `docs/plan-wbs3.3-3.7-s3-implementation.md`
- `src/app/(dashboard)/journals/page.tsx`
- `src/app/(dashboard)/reports/page.tsx`

**推奨対応**
- 設計書を実装実態に合わせて更新（または画面再編）。

### M-2. 3.6.2 検索DB最適化（INDEX/pg_trgm）の成果が確認困難

- 計画書に「複合INDEX + pg_trgm」がある一方、現行migrationsでは該当DDLを確認できない。

**該当箇所**
- `docs/plan-wbs3.3-3.7-s3-implementation.md`
- `supabase/migrations/*.sql`

**推奨対応**
- 追加したINDEX/拡張をmigrationとして明示。
- ベンチ結果（実行計画）をレビュー資料に追記。

### M-3. 月次試算表APIの戻り値が設計例より簡略化

- 計画書例では `summary` に `bs_balance`, `pl_balance` があるが、実装は `total_debit`, `total_credit` のみ。

**該当箇所**
- `docs/plan-wbs3.3-3.7-s3-implementation.md`
- `src/app/api/v1/reports/trial-balance/route.ts`

**推奨対応**
- 仕様を「簡略版」に更新するか、APIを設計に合わせる。

### M-4. S3対象機能の自動テスト不足

- 現在のテストは主にworkerジョブ中心で、S3のAPI/UI（3.3〜3.7）を直接検証するテストが見当たらない。

**該当箇所**
- `src/__tests__/*.test.ts`

**推奨対応**
- API単体テスト: journals export / reports / partners / payments / imports。
- E2E: documents検索6キー、reconciliation suggest→confirm、CSV import preview→import。

## 5. 良好点

- WBS 3.3〜3.7で計画されたAPI・画面コンポーネントの実装範囲は概ね揃っている。
- 4-point checkが通過しており、ビルド可能性は担保されている。
- 取引先更新で楽観ロック（`updated_at`）が実装されている。

## 6. 推奨アクション（実施順）

1. **P0**: C-1修正（confirm導線の実体化）
2. **P1**: H-1/H-2/H-3修正（6キー完成、成功件数の正確化、冪等性）
3. **P2**: M-1/M-3のドキュメント整合化
4. **P2**: M-2（検索INDEX migration化）
5. **P2**: M-4（S3回帰テスト追加）
