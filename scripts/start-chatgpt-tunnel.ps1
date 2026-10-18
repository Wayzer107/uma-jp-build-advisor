[CmdletBinding()]
param(
    [string]$ProfileName = 'uma-build-advisor',
    [string]$TunnelClientPath = 'tunnel-client.exe'
)

$ErrorActionPreference = 'Stop'

$clientCommand = Get-Command -Name $TunnelClientPath -ErrorAction SilentlyContinue
if (-not $clientCommand -and (Test-Path -LiteralPath $TunnelClientPath -PathType Leaf)) {
    $clientPath = (Resolve-Path -LiteralPath $TunnelClientPath).Path
} elseif ($clientCommand) {
    $clientPath = $clientCommand.Source
} else {
    throw "Could not find tunnel-client at '$TunnelClientPath'. Download the official OpenAI release or pass -TunnelClientPath with its full path."
}

$askedForKey = [string]::IsNullOrWhiteSpace($env:CONTROL_PLANE_API_KEY)
$keyPointer = [IntPtr]::Zero
$secureKey = $null

try {
    if ($askedForKey) {
        $secureKey = Read-Host -Prompt 'OpenAI Platform runtime API key (hidden; not saved)' -AsSecureString
        if ($secureKey.Length -eq 0) {
            throw 'A runtime API key is required to start Secure MCP Tunnel.'
        }
        $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
        $env:CONTROL_PLANE_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
    }

    & $clientPath doctor --profile $ProfileName --explain
    if ($LASTEXITCODE -ne 0) {
        throw "tunnel-client doctor failed with exit code $LASTEXITCODE. Check the profile, tunnel permissions, and runtime key."
    }

    Write-Host 'Starting Secure MCP Tunnel. Keep this PowerShell window open while using the advisor in ChatGPT web. Press Ctrl+C to stop it.'
    & $clientPath run --profile $ProfileName
    if ($LASTEXITCODE -ne 0) {
        throw "tunnel-client run exited with code $LASTEXITCODE."
    }
} finally {
    if ($keyPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
    }
    if ($secureKey) {
        $secureKey.Dispose()
    }
    if ($askedForKey) {
        Remove-Item Env:\CONTROL_PLANE_API_KEY -ErrorAction SilentlyContinue
    }
}
