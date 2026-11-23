param([switch]$VerifyOnly)
$ErrorActionPreference = "Stop"
$baselineRoot = $PSScriptRoot
$bundledNode = Join-Path $env:USERPROFILE ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe"
$nodePath = if (Test-Path -LiteralPath $bundledNode) { $bundledNode } else { (Get-Command node -ErrorAction Stop).Source }
$nodeMajor = [int](& $nodePath -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 18) { throw "Node.js 18 or newer is required." }
function Invoke-BaselineScript([string]$fileName, [string[]]$scriptArguments = @()) {
    & $nodePath (Join-Path $baselineRoot $fileName) @scriptArguments
    if ($LASTEXITCODE -ne 0) { throw "Failed: $fileName" }
}
if (-not $VerifyOnly) {
    Invoke-BaselineScript "test.mjs"
    Invoke-BaselineScript "evaluate.mjs" @("--sweep")
    Invoke-BaselineScript "evaluate.mjs" @("--full")
    Invoke-BaselineScript "freeze.mjs"
}
Invoke-BaselineScript "verify.mjs"
