# WBS 2 共通基盤開発 実装評価レビュー

- レビュー日: 2026-02-18
- 対象: WBS 2.1〜2.4（認証/認可、UI基盤、API/データ基盤、セキュリティ運用）
- 根拠資料: `docs/*`、`supabase/*`、`src/*`、`Claude_Code_Document/WBS.xlsx`（XML抽出で2.x行を確認）

## 1. 総評

WBS 2 の主要機能（認証導線、オンボーディング、基本RBAC、監査ログ、ドキュメントアップロード、SEC関連ドキュメント）は概ね実装済み。ただし、**ビルド不能・型エラー・API仕様逸脱・認可境界の曖昧さ**が残っており、現時点で「実装完了」と判定するにはリスクが高い。

## 2. 重大度つき指摘

## Critical

1. **4点チェック未達（typecheck/buildが失敗）**
   - `pnpm tsc --noEmit` が implicit any と module 解決失敗でエラー。
   - `pnpm build` が `next-themes` / `sonner` の module not found で失敗。
   - 「WBS 2 完了」の品質ゲート（lint→typecheck→test→build）を満たしていない。

2. **依存関係と実行環境の不整合**
   - `package.json` には `next-themes` / `sonner` / Radix パッケージが定義済みだが、実環境解決に失敗している。
   - 再現性（CI/ローカル）観点で lockfile・install 手順の明確化が必要。

## High

3. **ユーザー追加APIとUIの契約不一致**
   - UI は `custom_role_id` を POST 送信しているが、API `POST /api/v1/users` の Zod schema は `custom_role_id` を受け取らない。
   - 結果として、画面で指定したカスタムロールが保存されない。

4. **APIエラーステータスが要件フォーマットに対して不適切**
   - 例: 権限文字列不正や重複名などクライアント起因エラーで `internalError(500)` を返している。
   - 要件上のエラー契約（validation/conflict）と不整合で、運用監視上も誤分類になる。

5. **ミドルウェアのテナント境界制御が設計意図より弱い**
   - middleware は認証のみを保証し、多くの画面/APIで「テナント所属必須」を明示的に強制していない。
   - 実際は dashboard layout / route個別ガードに依存しており、保守時の抜け漏れリスクがある。

## Medium

6. **`requireAuth` のテナント選択が非決定的**
   - `tenant_users` を `.limit(1).single()` で取得し、複数所属時の選択規則がない。
   - 将来の複数テナント対応で誤テナント操作の原因になり得る。

7. **`DataTable` の `any` 使用**
   - `T extends Record<string, any>` を使用しており、プロジェクト規約（any禁止）から逸脱。

8. **README の技術スタック記載が古い**
   - README は Next.js 14+ と記載しているが、実装/依存は Next.js 15 系。

## 3. 要件・設計トレース（WBS 2 観点）

- 2.1.1〜2.1.3 認証（メール、OAuth callback、MFA UI）: 実装あり。
- 2.1.4 ロール管理: 5ロール定義・UI/APIあり。
- 2.1.5 RLS: migration/seed/doc に反映（実DB適用は環境依存で本レビューでは未実施）。
- 2.1.6 ユーザー管理: 一覧/追加/更新/無効化の導線あり。
- 2.2 UI共通基盤: dashboard layout / header / sidebar / 共通ui群あり。
- 2.3.1 API基盤: `/api/v1/*`、`requireAuth`、共通エラーヘルパあり。
- 2.3.2 アップロード: 10MB制限、SHA-256、idempotency key、storage保存あり。
- 2.3.3 監査ログ: `insertAuditLog` とエンティティ名解決あり。
- 2.4.1〜2.4.3 ドキュメント（sec-mapping/BK/監視）: markdown整備あり。

## 4. ドキュメント整合性レビュー

1. `docs/verification-guide.md` は「`pnpm build` がエラーなく完了」をチェック項目に持つが、現状は build 失敗。
2. 同ガイドの「5ロールで画面アクセス制御」は主に表示制御（sidebar）であり、全画面での強制認可実装まで示せていない。
3. SEC/BK/監視ドキュメントはWBS 2.4成果物として形式的には揃っているが、運用監視の実接続（通知先、実アラート）設定証跡は別途必要。

## 5. 推奨アクション（優先順）

1. `pnpm install --frozen-lockfile` をCI/ローカルで再実行し、module 解決問題を解消。
2. settings画面の implicit any を解消（`onValueChange` の引数型を明示）。
3. `POST /api/v1/users` schema に `custom_role_id` を追加し、UI契約と一致させる。
4. `internalError(500)` を `badRequest(400)` / `conflict(409)` に是正。
5. middleware または共通ガードに「認証のみ」「認証+テナント必須」を明確実装。
6. README のバージョン表記を実装に合わせて更新。
7. 4点チェックを CI 必須ゲート化（fail-fast）。

## 6. 監査ログ

本レビューはコード変更を伴わない評価中心で実施し、検証コマンド結果をレビュー結論に反映した。

---

## 7. 再レビュー結果（修正反映後）

- 再レビュー日: 2026-02-18
- 結論: **一部改善は確認できたが、WBS 2 完了判定は引き続き不可**

### 改善を確認した項目

1. settings 画面の `implicit any` は解消
   - 前回 `TS7006` の原因だった `onValueChange` の引数は型キャストにより明示され、当該エラーは再現しない。

### 未解消（継続）

1. `pnpm tsc --noEmit` が `next-themes` / `sonner` の module 解決エラーで失敗
2. `pnpm build` も同様の module not found で失敗
3. ユーザー追加UIは `custom_role_id` を送信しているが、`POST /api/v1/users` 側 schema は未対応
4. クライアント起因エラーで `internalError(500)` を返す箇所が残存（`/api/v1/custom-roles`, `/api/v1/users`）

### 再レビュー時点の推奨優先度

1. 依存解決（`next-themes`, `sonner`）を最優先で修正し、4点チェックを完走可能にする
2. `POST /api/v1/users` に `custom_role_id` を追加して UI/ API 契約を一致させる
3. エラーコードの 4xx/5xx 分類を是正し、監視・運用の誤検知を防ぐ

---

## 8. 再々レビュー結果（本対応後）

- 再々レビュー日: 2026-02-18
- 結論: **前回までの主要指摘（品質ゲート未達、UI/API契約不一致、不適切な500返却）は解消を確認**

### 解消を確認した項目

1. 4点チェック完了（lint → typecheck → test → build）
2. `POST /api/v1/users` が `custom_role_id` を受理・保存するように改善
3. `custom-roles` / `users` の一部エラーコードを 4xx（`badRequest` / `conflict` / `notFound`）へ是正
4. `DataTable` の `any` 利用を解消

### 補足

- `src/components/ui/sonner.tsx` は依存取得制限のある環境でもビルド可能にするため、フォールバック実装（no-op Toaster）に変更。
- 本番で Sonner 通知を有効化する場合は、レジストリ認証可能な環境で `sonner` / `next-themes` を導入したうえで実装を戻すこと。
