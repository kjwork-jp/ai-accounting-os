#Requires -Version 5.1
<#
.SYNOPSIS
  Azure Container Apps へ Worker をデプロイする。

.DESCRIPTION
  前提:
    - az CLI ログイン済み (az login)
    - リソースグループ rg-aibo-stg に ACR / Redis / DI が作成済み
    - .env.local に必要な環境変数が設定済み

.PARAMETER Init
  初回デプロイ時に指定。ACA 環境 + Container App を新規作成する。

.EXAMPLE
  # 初回デプロイ
  .\scripts\deploy-worker.ps1 -Init

  # コード更新時 (イメージ再ビルド + リビジョン更新のみ)
  .\scripts\deploy-worker.ps1
#>
param(
  [switch]$Init
)

$ErrorActionPreference = "Stop"

# === 設定 ===
$RESOURCE_GROUP   = "rg-aibo-stg"
$LOCATION         = "japaneast"
$ACR_NAME         = "acraibostg"
$IMAGE_NAME       = "worker"
$IMAGE_TAG        = if ($env:IMAGE_TAG) { $env:IMAGE_TAG } else { Get-Date -Format "yyyyMMdd-HHmmss" }
$IMAGE_FULL       = "${ACR_NAME}.azurecr.io/${IMAGE_NAME}:${IMAGE_TAG}"

# Container Apps
$ACA_ENV_NAME     = "cae-aibo-stg"
$ACA_APP_NAME     = "ca-worker-stg"
$LOG_ANALYTICS_WS = "workspace-rgaibostgmThS"

# Worker sizing
$CPU           = "0.5"
$MEMORY        = "1.0Gi"
$MIN_REPLICAS  = "1"
$MAX_REPLICAS  = "1"

# === ヘルパー ===
function Write-Info  { param($msg) Write-Host "[INFO]  $msg" -ForegroundColor Cyan }
function Write-Warn  { param($msg) Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Write-Err   { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red; exit 1 }

# === 環境変数の読み込み (.env.local) ===
$envFile = if ($env:ENV_FILE) { $env:ENV_FILE } else { ".env.local" }
if (-not (Test-Path $envFile)) {
  Write-Err "$envFile が見つかりません。Worker に必要な環境変数を設定してください。"
}

$envVars = @{}
Get-Content $envFile | ForEach-Object {
  if ($_ -match "^\s*([A-Z_][A-Z0-9_]*)=(.+)$") {
    $envVars[$Matches[1]] = $Matches[2].Trim()
  }
}

function Get-EnvVar {
  param([string]$Key)
  $val = $envVars[$Key]
  if (-not $val) { Write-Err "$envFile に $Key が設定されていません。" }
  return $val
}

Write-Info "環境変数を $envFile から読み込み中..."
$NEXT_PUBLIC_SUPABASE_URL = Get-EnvVar "NEXT_PUBLIC_SUPABASE_URL"
$SUPABASE_SERVICE_ROLE_KEY = Get-EnvVar "SUPABASE_SERVICE_ROLE_KEY"
$AZURE_REDIS_HOST          = Get-EnvVar "AZURE_REDIS_HOST"
$AZURE_REDIS_PORT          = Get-EnvVar "AZURE_REDIS_PORT"
$AZURE_REDIS_KEY           = Get-EnvVar "AZURE_REDIS_KEY"
$AZURE_DI_ENDPOINT         = Get-EnvVar "AZURE_DI_ENDPOINT"
$AZURE_DI_KEY              = Get-EnvVar "AZURE_DI_KEY"
$ANTHROPIC_API_KEY         = Get-EnvVar "ANTHROPIC_API_KEY"
$LLM_MODEL                 = Get-EnvVar "LLM_MODEL"
Write-Info "環境変数の読み込み完了"

# === Step 1: ACR にイメージをビルド & プッシュ ===
Write-Info "Step 1: ACR リモートビルド ($IMAGE_FULL)..."
az acr build `
  --registry $ACR_NAME `
  --resource-group $RESOURCE_GROUP `
  --image "${IMAGE_NAME}:${IMAGE_TAG}" `
  --image "${IMAGE_NAME}:latest" `
  --file worker/Dockerfile `
  .
if ($LASTEXITCODE -ne 0) { Write-Err "ACR ビルドに失敗しました。" }
Write-Info "イメージのビルド & プッシュ完了"

# === Step 2/3: 初回 or 更新 ===
if ($Init) {
  Write-Info "Step 2: Container Apps 環境を確認中..."

  # Log Analytics Workspace (既存確認)
  $wsExists = az monitor log-analytics workspace show `
    --resource-group $RESOURCE_GROUP `
    --workspace-name $LOG_ANALYTICS_WS 2>$null
  if (-not $wsExists) {
    Write-Info "Log Analytics Workspace を作成中..."
    az monitor log-analytics workspace create `
      --resource-group $RESOURCE_GROUP `
      --workspace-name $LOG_ANALYTICS_WS `
      --location $LOCATION `
      --retention-in-days 30
  }

  $LOG_ID = az monitor log-analytics workspace show `
    --resource-group $RESOURCE_GROUP `
    --workspace-name $LOG_ANALYTICS_WS `
    --query customerId -o tsv
  $LOG_KEY = az monitor log-analytics workspace get-shared-keys `
    --resource-group $RESOURCE_GROUP `
    --workspace-name $LOG_ANALYTICS_WS `
    --query primarySharedKey -o tsv

  # Container Apps Environment (既存確認)
  $envExists = az containerapp env show `
    --resource-group $RESOURCE_GROUP `
    --name $ACA_ENV_NAME 2>$null
  if (-not $envExists) {
    Write-Info "Container Apps Environment を作成中..."
    az containerapp env create `
      --resource-group $RESOURCE_GROUP `
      --name $ACA_ENV_NAME `
      --location $LOCATION `
      --logs-workspace-id $LOG_ID `
      --logs-workspace-key $LOG_KEY
  } else {
    Write-Info "Container Apps Environment は既に存在します (スキップ)"
  }

  # ACR 資格情報
  $ACR_USERNAME = az acr credential show --name $ACR_NAME --query "username" -o tsv
  $ACR_PASSWORD = az acr credential show --name $ACR_NAME --query "passwords[0].value" -o tsv

  # Container App 作成
  Write-Info "Step 3: Container App を作成中..."
  az containerapp create `
    --resource-group $RESOURCE_GROUP `
    --name $ACA_APP_NAME `
    --environment $ACA_ENV_NAME `
    --image $IMAGE_FULL `
    --registry-server "${ACR_NAME}.azurecr.io" `
    --registry-username $ACR_USERNAME `
    --registry-password $ACR_PASSWORD `
    --cpu $CPU `
    --memory $MEMORY `
    --min-replicas $MIN_REPLICAS `
    --max-replicas $MAX_REPLICAS `
    --env-vars `
      "NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL" `
      "SUPABASE_SERVICE_ROLE_KEY=secretref:supabase-service-role-key" `
      "AZURE_REDIS_HOST=$AZURE_REDIS_HOST" `
      "AZURE_REDIS_PORT=$AZURE_REDIS_PORT" `
      "AZURE_REDIS_KEY=secretref:azure-redis-key" `
      "AZURE_DI_ENDPOINT=$AZURE_DI_ENDPOINT" `
      "AZURE_DI_KEY=secretref:azure-di-key" `
      "ANTHROPIC_API_KEY=secretref:anthropic-api-key" `
      "LLM_MODEL=$LLM_MODEL" `
    --secrets `
      "supabase-service-role-key=$SUPABASE_SERVICE_ROLE_KEY" `
      "azure-redis-key=$AZURE_REDIS_KEY" `
      "azure-di-key=$AZURE_DI_KEY" `
      "anthropic-api-key=$ANTHROPIC_API_KEY"

  if ($LASTEXITCODE -ne 0) { Write-Err "Container App の作成に失敗しました。" }
  Write-Info "Container App の作成完了"

} else {
  # 更新デプロイ
  Write-Info "Step 2: Container App のイメージを更新中..."
  az containerapp update `
    --resource-group $RESOURCE_GROUP `
    --name $ACA_APP_NAME `
    --image $IMAGE_FULL
  if ($LASTEXITCODE -ne 0) { Write-Err "イメージの更新に失敗しました。" }
  Write-Info "イメージの更新完了"
}

# === 確認 ===
Write-Info "デプロイ状態を確認中..."
az containerapp show `
  --resource-group $RESOURCE_GROUP `
  --name $ACA_APP_NAME `
  --query "{name:name, status:properties.runningStatus, image:properties.template.containers[0].image}" `
  -o table

Write-Host ""
Write-Info "=== デプロイ完了 ==="
Write-Info "ログ確認: az containerapp logs show -g $RESOURCE_GROUP -n $ACA_APP_NAME --follow"
