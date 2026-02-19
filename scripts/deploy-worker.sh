#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# deploy-worker.sh
#
# Azure Container Apps へ Worker をデプロイするスクリプト。
# 前提:
#   - az CLI ログイン済み (az login)
#   - リソースグループ rg-aibo-stg に ACR / Redis / DI が作成済み
#   - .env.local に必要な環境変数が設定済み
#
# 使い方:
#   # 初回デプロイ (環境作成 + アプリ作成)
#   ./scripts/deploy-worker.sh --init
#
#   # コード更新時 (イメージ再ビルド + リビジョン更新のみ)
#   ./scripts/deploy-worker.sh
###############################################################################

# === 設定 ===
RESOURCE_GROUP="rg-aibo-stg"
LOCATION="japaneast"
ACR_NAME="acraibostg"
IMAGE_NAME="worker"
IMAGE_TAG="${IMAGE_TAG:-$(date +%Y%m%d-%H%M%S)}"
IMAGE_FULL="${ACR_NAME}.azurecr.io/${IMAGE_NAME}:${IMAGE_TAG}"

# Container Apps
ACA_ENV_NAME="cae-aibo-stg"
ACA_APP_NAME="ca-worker-stg"
LOG_ANALYTICS_WS="workspace-rgaibostgmThS"

# Worker sizing (1 replica, minimal resources)
CPU="0.5"
MEMORY="1.0Gi"
MIN_REPLICAS="1"
MAX_REPLICAS="1"

# === ヘルパー ===
info()  { echo -e "\033[1;34m[INFO]\033[0m  $*"; }
warn()  { echo -e "\033[1;33m[WARN]\033[0m  $*"; }
error() { echo -e "\033[1;31m[ERROR]\033[0m $*" >&2; exit 1; }

# === 環境変数の読み込み ===
ENV_FILE="${ENV_FILE:-.env.local}"
if [[ ! -f "$ENV_FILE" ]]; then
  error "$ENV_FILE が見つかりません。Worker に必要な環境変数を設定してください。"
fi

load_env_var() {
  local key="$1"
  local value
  value=$(grep "^${key}=" "$ENV_FILE" | head -1 | cut -d'=' -f2-)
  if [[ -z "$value" ]]; then
    error "$ENV_FILE に ${key} が設定されていません。"
  fi
  echo "$value"
}

info "環境変数を $ENV_FILE から読み込み中..."
NEXT_PUBLIC_SUPABASE_URL=$(load_env_var "NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY=$(load_env_var "SUPABASE_SERVICE_ROLE_KEY")
AZURE_REDIS_HOST=$(load_env_var "AZURE_REDIS_HOST")
AZURE_REDIS_PORT=$(load_env_var "AZURE_REDIS_PORT")
AZURE_REDIS_KEY=$(load_env_var "AZURE_REDIS_KEY")
AZURE_DI_ENDPOINT=$(load_env_var "AZURE_DI_ENDPOINT")
AZURE_DI_KEY=$(load_env_var "AZURE_DI_KEY")
ANTHROPIC_API_KEY=$(load_env_var "ANTHROPIC_API_KEY")
LLM_MODEL=$(load_env_var "LLM_MODEL")
info "環境変数の読み込み完了"

# === Step 1: ACR にイメージをビルド & プッシュ ===
info "Step 1: ACR リモートビルド (${IMAGE_FULL})..."
az acr build \
  --registry "$ACR_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --image "${IMAGE_NAME}:${IMAGE_TAG}" \
  --image "${IMAGE_NAME}:latest" \
  --file worker/Dockerfile \
  .

info "イメージのビルド & プッシュ完了"

# === Step 2: 初回のみ — ACA 環境作成 ===
if [[ "${1:-}" == "--init" ]]; then
  info "Step 2: Container Apps 環境を作成中..."

  # Log Analytics Workspace
  if ! az monitor log-analytics workspace show \
    --resource-group "$RESOURCE_GROUP" \
    --workspace-name "$LOG_ANALYTICS_WS" &>/dev/null; then
    info "Log Analytics Workspace を作成中..."
    az monitor log-analytics workspace create \
      --resource-group "$RESOURCE_GROUP" \
      --workspace-name "$LOG_ANALYTICS_WS" \
      --location "$LOCATION" \
      --retention-in-days 30
  fi

  LOG_ID=$(az monitor log-analytics workspace show \
    --resource-group "$RESOURCE_GROUP" \
    --workspace-name "$LOG_ANALYTICS_WS" \
    --query customerId -o tsv)
  LOG_KEY=$(az monitor log-analytics workspace get-shared-keys \
    --resource-group "$RESOURCE_GROUP" \
    --workspace-name "$LOG_ANALYTICS_WS" \
    --query primarySharedKey -o tsv)

  # Container Apps Environment
  if ! az containerapp env show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$ACA_ENV_NAME" &>/dev/null; then
    info "Container Apps Environment を作成中..."
    az containerapp env create \
      --resource-group "$RESOURCE_GROUP" \
      --name "$ACA_ENV_NAME" \
      --location "$LOCATION" \
      --logs-workspace-id "$LOG_ID" \
      --logs-workspace-key "$LOG_KEY"
  fi

  # ACR の資格情報を取得
  ACR_USERNAME=$(az acr credential show --name "$ACR_NAME" --query "username" -o tsv)
  ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)

  # Container App 作成
  info "Step 3: Container App を作成中..."
  az containerapp create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$ACA_APP_NAME" \
    --environment "$ACA_ENV_NAME" \
    --image "$IMAGE_FULL" \
    --registry-server "${ACR_NAME}.azurecr.io" \
    --registry-username "$ACR_USERNAME" \
    --registry-password "$ACR_PASSWORD" \
    --cpu "$CPU" \
    --memory "$MEMORY" \
    --min-replicas "$MIN_REPLICAS" \
    --max-replicas "$MAX_REPLICAS" \
    --env-vars \
      "NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}" \
      "SUPABASE_SERVICE_ROLE_KEY=secretref:supabase-service-role-key" \
      "AZURE_REDIS_HOST=${AZURE_REDIS_HOST}" \
      "AZURE_REDIS_PORT=${AZURE_REDIS_PORT}" \
      "AZURE_REDIS_KEY=secretref:azure-redis-key" \
      "AZURE_DI_ENDPOINT=${AZURE_DI_ENDPOINT}" \
      "AZURE_DI_KEY=secretref:azure-di-key" \
      "ANTHROPIC_API_KEY=secretref:anthropic-api-key" \
      "LLM_MODEL=${LLM_MODEL}" \
    --secrets \
      "supabase-service-role-key=${SUPABASE_SERVICE_ROLE_KEY}" \
      "azure-redis-key=${AZURE_REDIS_KEY}" \
      "azure-di-key=${AZURE_DI_KEY}" \
      "anthropic-api-key=${ANTHROPIC_API_KEY}"

  info "Container App の作成完了"
else
  # === 更新デプロイ (イメージ差し替え) ===
  info "Step 2: Container App のイメージを更新中..."
  az containerapp update \
    --resource-group "$RESOURCE_GROUP" \
    --name "$ACA_APP_NAME" \
    --image "$IMAGE_FULL"

  info "イメージの更新完了"
fi

# === 確認 ===
info "デプロイ状態を確認中..."
az containerapp show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$ACA_APP_NAME" \
  --query "{name:name, status:properties.runningStatus, replicas:properties.template.scale, image:properties.template.containers[0].image}" \
  -o table

info "=== デプロイ完了 ==="
info "ログ確認: az containerapp logs show -g $RESOURCE_GROUP -n $ACA_APP_NAME --follow"
