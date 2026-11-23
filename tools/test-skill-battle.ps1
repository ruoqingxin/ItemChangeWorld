param()
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$build = Join-Path $root "bin/gameplay-tests"
$resolvedBuild = [System.IO.Path]::GetFullPath($build)
$expectedBuild = [System.IO.Path]::GetFullPath((Join-Path $root "bin/gameplay-tests"))
if ($resolvedBuild -ne $expectedBuild) { throw "测试输出目录无效" }
if (Test-Path -LiteralPath $resolvedBuild) { Remove-Item -LiteralPath $resolvedBuild -Recurse -Force }
$bundledNode = Join-Path $env:USERPROFILE ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe"
$node = if (Test-Path -LiteralPath $bundledNode) { $bundledNode } else { (Get-Command node -ErrorAction Stop).Source }
$tsc = Join-Path $root "node_modules/typescript/bin/tsc"
if (!(Test-Path -LiteralPath $tsc)) { $tsc = Join-Path (Split-Path (Get-Command tsc).Source) "node_modules/typescript/bin/tsc" }
$sources = @(
    (Join-Path $root "src/script/module/expedition/manager/ExpeditionRunManager.ts"),
    (Join-Path $root "src/script/module/expedition/utils/ExpeditionRunConfigUtils.ts"),
    (Join-Path $root "src/script/module/inventory/utils/InventoryTransferUtils.ts"),
    (Join-Path $root "src/script/module/manualTest/manager/RogueTestManager.ts"),
    (Join-Path $root "engine/types/LayaAir.d.ts")
)
& $node $tsc --target ES2020 --module commonjs --lib "ES2020,DOM" --skipLibCheck --noEmit false --rootDir (Join-Path $root "src") --outDir $build @sources
if ($LASTEXITCODE -ne 0) { throw "当前规则测试编译失败" }
foreach ($test in @("qingming-formal.test.cjs","rogue-enemies.test.cjs","weapon-trial.test.cjs","equipment-trial.test.cjs","inventory-map.test.cjs","project-structure.test.cjs")) {
    & $node (Join-Path $PSScriptRoot $test) $build
    if ($LASTEXITCODE -ne 0) { throw "测试失败：$test" }
}
& $node (Join-Path $PSScriptRoot "ui-assets.cjs")
if ($LASTEXITCODE -ne 0) { throw "界面资源引用检查失败" }
