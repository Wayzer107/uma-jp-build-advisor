param(
    [string]$PythonLauncher = "py",
    [string]$NodeExecutable = "node",
    [string]$NpmExecutable = "npm"
)

$ErrorActionPreference = "Stop"

if ($env:OS -ne "Windows_NT") {
    throw "The game image extractor setup is for Windows, beside the installed Japanese game."
}

$stateRoot = Join-Path $env:LOCALAPPDATA "UmaBuildAdvisor"
$venvPath = Join-Path $stateRoot "image-extractor-venv"
$metaReaderPath = Join-Path $stateRoot "meta-reader"
$python = Join-Path $venvPath "Scripts\python.exe"

New-Item -ItemType Directory -Force -Path $stateRoot, $metaReaderPath | Out-Null

if (-not (Test-Path -LiteralPath $python)) {
    & $PythonLauncher -3.12 -m venv $venvPath
    if ($LASTEXITCODE -ne 0) { throw "Python 3.12 venv creation failed with exit code $LASTEXITCODE" }
}

& $python -m pip install --disable-pip-version-check "UnityPy==1.25.4" "Pillow==13.0.0"
if ($LASTEXITCODE -ne 0) { throw "Python extractor dependency setup failed with exit code $LASTEXITCODE" }

& $NodeExecutable --version
if ($LASTEXITCODE -ne 0) { throw "Node.js is required to read the installed asset index." }
& $NpmExecutable install --prefix $metaReaderPath --no-audit --no-fund "better-sqlite3-multiple-ciphers@13.0.3"
if ($LASTEXITCODE -ne 0) { throw "Encrypted SQLite reader setup failed with exit code $LASTEXITCODE" }

Write-Host "Extractor ready: $python"
Write-Host "Run scripts\extract_game_images.py --candidate --dry-run --support-id 10001 --trainee-id 100101"
