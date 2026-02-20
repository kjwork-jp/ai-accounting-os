#Requires -Version 5.1
<#
.SYNOPSIS
  Deploy Worker to Azure Container Apps.

.DESCRIPTION
  Prerequisites:
    - az CLI logged in (az login)
    - Resource group rg-aibo-stg with ACR / Redis / DI already created
    - .env.local with all required environment variables

.PARAMETER Init
  First-time deploy: create ACA environment + Container App.

.EXAMPLE
  .\scripts\deploy-worker.ps1 -Init

  .\scripts\deploy-worker.ps1
#>
param(
  [switch]$Init
)

# Use "Continue" globally so az CLI stderr warnings don't become terminating errors.
# We check $LASTEXITCODE after every az call instead.
$ErrorActionPreference = "Continue"

# === Config ===
$RESOURCE_GROUP   = "rg-aibo-stg"
$LOCATION         = "japaneast"
$ACR_NAME         = "acraibostg"
$IMAGE_NAME       = "worker"
$IMAGE_TAG        = $(if ($env:IMAGE_TAG) { $env:IMAGE_TAG } else { Get-Date -Format "yyyyMMdd-HHmmss" })
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

# === Helpers ===
function Write-Info  { param($msg) Write-Host "[INFO]  $msg" -ForegroundColor Cyan }
function Write-Warn  { param($msg) Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Write-Err   { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red; exit 1 }

function Assert-AzSuccess {
  param([string]$Step)
  if ($LASTEXITCODE -ne 0) { Write-Err "$Step (exit code: $LASTEXITCODE)" }
}

# === Load env vars from .env.local ===
$envFile = $(if ($env:ENV_FILE) { $env:ENV_FILE } else { ".env.local" })
if (-not (Test-Path $envFile)) {
  Write-Err "$envFile not found. Set required env vars for Worker."
}

$envVars = @{}
Get-Content $envFile -Encoding UTF8 | ForEach-Object {
  if ($_ -match '^\s*([A-Z_][A-Z0-9_]*)=(.+)$') {
    $envVars[$Matches[1]] = $Matches[2].Trim()
  }
}

function Get-EnvVar {
  param([string]$Key)
  $val = $envVars[$Key]
  if (-not $val) { Write-Err "$Key is not set in $envFile" }
  return $val
}

Write-Info "Loading env vars from $envFile ..."
$NEXT_PUBLIC_SUPABASE_URL  = Get-EnvVar "NEXT_PUBLIC_SUPABASE_URL"
$SUPABASE_SERVICE_ROLE_KEY = Get-EnvVar "SUPABASE_SERVICE_ROLE_KEY"
$AZURE_REDIS_HOST          = Get-EnvVar "AZURE_REDIS_HOST"
$AZURE_REDIS_PORT          = Get-EnvVar "AZURE_REDIS_PORT"
$AZURE_REDIS_KEY           = Get-EnvVar "AZURE_REDIS_KEY"
$AZURE_DI_ENDPOINT         = Get-EnvVar "AZURE_DI_ENDPOINT"
$AZURE_DI_KEY              = Get-EnvVar "AZURE_DI_KEY"
$ANTHROPIC_API_KEY         = Get-EnvVar "ANTHROPIC_API_KEY"
$LLM_MODEL                 = Get-EnvVar "LLM_MODEL"
Write-Info "Env vars loaded OK"

# === Step 1: Build & push image to ACR ===
Write-Info "Step 1: ACR remote build ($IMAGE_FULL) ..."
az acr build `
  --registry $ACR_NAME `
  --resource-group $RESOURCE_GROUP `
  --image "${IMAGE_NAME}:${IMAGE_TAG}" `
  --image "${IMAGE_NAME}:latest" `
  --file worker/Dockerfile `
  .
Assert-AzSuccess "ACR build failed"
Write-Info "Image build & push complete"

# === Step 2/3: Init or Update ===
if ($Init) {
  Write-Info "Step 2: Checking Container Apps Environment ..."

  # Log Analytics Workspace
  az monitor log-analytics workspace show `
    --resource-group $RESOURCE_GROUP `
    --workspace-name $LOG_ANALYTICS_WS 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Info "Creating Log Analytics Workspace ..."
    az monitor log-analytics workspace create `
      --resource-group $RESOURCE_GROUP `
      --workspace-name $LOG_ANALYTICS_WS `
      --location $LOCATION `
      --retention-in-days 30
    Assert-AzSuccess "Log Analytics Workspace creation failed"
  }

  $LOG_ID = az monitor log-analytics workspace show `
    --resource-group $RESOURCE_GROUP `
    --workspace-name $LOG_ANALYTICS_WS `
    --query customerId -o tsv
  $LOG_KEY = az monitor log-analytics workspace get-shared-keys `
    --resource-group $RESOURCE_GROUP `
    --workspace-name $LOG_ANALYTICS_WS `
    --query primarySharedKey -o tsv

  # Container Apps Environment
  az containerapp env show `
    --resource-group $RESOURCE_GROUP `
    --name $ACA_ENV_NAME 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Info "Creating Container Apps Environment ..."
    az containerapp env create `
      --resource-group $RESOURCE_GROUP `
      --name $ACA_ENV_NAME `
      --location $LOCATION `
      --logs-workspace-id $LOG_ID `
      --logs-workspace-key $LOG_KEY
    Assert-AzSuccess "Container Apps Environment creation failed"
  } else {
    Write-Info "Container Apps Environment already exists (skip)"
  }

  # ACR credentials
  $ACR_USERNAME = az acr credential show --name $ACR_NAME --query "username" -o tsv
  Assert-AzSuccess "ACR credential fetch failed"
  $ACR_PASSWORD = az acr credential show --name $ACR_NAME --query "passwords[0].value" -o tsv

  # Create Container App
  Write-Info "Step 3: Creating Container App ..."
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
  Assert-AzSuccess "Container App creation failed"
  Write-Info "Container App created"

} else {
  # Update deploy
  Write-Info "Step 2: Updating Container App image ..."
  az containerapp update `
    --resource-group $RESOURCE_GROUP `
    --name $ACA_APP_NAME `
    --image $IMAGE_FULL
  Assert-AzSuccess "Image update failed"
  Write-Info "Image update complete"
}

# === Verify ===
Write-Info "Checking deploy status ..."
az containerapp show `
  --resource-group $RESOURCE_GROUP `
  --name $ACA_APP_NAME `
  --query "{name:name, status:properties.runningStatus, image:properties.template.containers[0].image}" `
  -o table

Write-Host ""
Write-Info "=== Deploy complete ==="
Write-Info "View logs: az containerapp logs show -g $RESOURCE_GROUP -n $ACA_APP_NAME --follow"
