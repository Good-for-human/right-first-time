# Push local main to GitHub using GitHub CLI (account: Good-for-human).
# Prerequisite: run once: gh auth login
# Docs: https://cli.github.com/manual/gh_repo_create

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$null = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "GitHub CLI is not logged in. Run this first, then re-run this script:" -ForegroundColor Yellow
    Write-Host "  gh auth login" -ForegroundColor Cyan
    exit 1
}

$repoName = 'right-first-time'

if (git remote get-url origin 2>$null) {
    Write-Host "Remote 'origin' exists. Pushing main..." -ForegroundColor Green
    git push -u origin main
    exit $LASTEXITCODE
}

Write-Host "Creating github.com/Good-for-human/$repoName and pushing..." -ForegroundColor Green
gh repo create $repoName --public --source . --remote origin --push --description "Right First Time - listing workspace"

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "If the repo already exists on GitHub, add remote and push manually:" -ForegroundColor Yellow
    Write-Host "  git remote add origin https://github.com/Good-for-human/$repoName.git" -ForegroundColor Cyan
    Write-Host "  git push -u origin main" -ForegroundColor Cyan
    exit $LASTEXITCODE
}

Write-Host "Done. Open: https://github.com/Good-for-human/$repoName" -ForegroundColor Green
