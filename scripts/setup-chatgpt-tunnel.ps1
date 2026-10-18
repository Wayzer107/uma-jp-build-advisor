[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^tunnel_[a-z0-9_]+$')]
    [string]$TunnelId,

    [string]$InstallRoot = 'C:\UmaBuildAdvisorPlugin',
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

$installPath = (Resolve-Path -LiteralPath $InstallRoot -ErrorAction Stop).Path
if ($installPath -match '\s') {
    throw 'InstallRoot must not contain spaces because the stdio command is stored in a tunnel-client profile.'
}

$mcpEntry = Join-Path $installPath 'mcp-server\dist\index.js'
if (-not (Test-Path -LiteralPath $mcpEntry -PathType Leaf)) {
    throw "The bundled MCP server was not found at '$mcpEntry'. Install the built plugin package at InstallRoot first."
}

$command = "node $($mcpEntry.Replace('\', '/'))"
& $clientPath init `
    --sample sample_mcp_stdio_local `
    --profile $ProfileName `
    --tunnel-id $TunnelId `
    --mcp-command $command

if ($LASTEXITCODE -ne 0) {
    throw "tunnel-client init failed with exit code $LASTEXITCODE."
}

Write-Host "Created tunnel-client profile '$ProfileName'."
Write-Host "MCP command: $command"
Write-Host "Create the remote ChatGPT plugin package with: python `"$PSScriptRoot\package_chatgpt_web_plugin.py`" --tunnel-id `"$TunnelId`""
Write-Host 'Then run scripts/start-chatgpt-tunnel.ps1 from the public repository clone.'
