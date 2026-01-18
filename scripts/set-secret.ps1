param(
  [string]$Webhook
)
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Error "gh CLI no encontrado. Instálalo desde https://cli.github.com/"
  exit 1
}
$repo = "jgr-ry/ZeroRP"
if (-not $Webhook) {
  $Webhook = Read-Host -Prompt "Introduce la URL del webhook (no se guardará en el repo)"
}
if (-not $Webhook) {
  Write-Error "No se proporcionó webhook. Abortando."
  exit 1
}
$Webhook | gh secret set DISCORD_WEBHOOK_URL -b -R $repo
Write-Host "Secret DISCORD_WEBHOOK_URL establecido para $repo"