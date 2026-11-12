param([switch]$ShowBattleLog, [switch]$RulesOnly)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$build = Join-Path $root "bin/gameplay-tests"
$workspaceNode = Join-Path (Split-Path -Parent $root) ".node/node-v22.14.0-win-x64"
if (Test-Path (Join-Path $workspaceNode "node.exe")) {
    $env:Path = "$workspaceNode;$env:Path"
}
$node = (Get-Command node -ErrorAction Stop).Source
$bundledNode = Join-Path $env:USERPROFILE ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe"
if ([int](& $node -p "process.versions.node.split('.')[0]") -lt 18 -and (Test-Path -LiteralPath $bundledNode)) {
    $node = $bundledNode
}
if ([int](& $node -p "process.versions.node.split('.')[0]") -lt 18) {
    throw "Battle tests require Node.js 18 or newer."
}
$localTsc = Join-Path $root "node_modules/.bin/tsc.cmd"
$tsc = if (Test-Path $localTsc) { $localTsc } else { "tsc" }
$sources = @(
    (Join-Path $root "src/script/module/skillBattle/utils/SkillBattleConfigUtils.ts"),
    (Join-Path $root "src/script/module/skillBattle/manager/SkillBattleManager.ts"),
    (Join-Path $root "src/script/module/skillBattle/debug/SkillBattleDebug.ts"),
    (Join-Path $root "src/script/module/skillBattle/view/SkillBattlePresenter.ts"),
    (Join-Path $root "src/script/module/skillBattle/utils/BattleRules.ts"),
    (Join-Path $root "src/script/module/skillBattle/utils/BattleConfigUtils.ts"),
    (Join-Path $root "src/script/module/skillBattle/manager/BattleTrialManager.ts"),
    (Join-Path $root "src/script/module/build/utils/BuildConfigUtils.ts"),
    (Join-Path $root "src/script/module/build/manager/BuildManager.ts"),
    (Join-Path $root "src/script/module/inventory/manager/InventoryManager.ts"),
    (Join-Path $root "src/script/module/inventory/utils/InventoryConfigUtils.ts"),
    (Join-Path $root "src/script/module/expedition/utils/ExpeditionRunConfigUtils.ts"),
    (Join-Path $root "src/script/module/expedition/manager/ExpeditionRunManager.ts"),
    (Join-Path $root "src/script/module/expedition/utils/ExpeditionConfigUtils.ts"),
    (Join-Path $root "src/script/module/gameplay/utils/GameplayLifecycleHelper.ts"),
    (Join-Path $root "engine/types/LayaAir.d.ts")
)

& $tsc --target ES2020 --module commonjs --lib "ES2020,DOM" --skipLibCheck --noEmit false --rootDir (Join-Path $root "src") --outDir $build @sources
if ($LASTEXITCODE -ne 0) { throw "Skill battle test compilation failed." }

$arguments = @((Join-Path $PSScriptRoot "skill-battle.test.cjs"), $build)
if ($ShowBattleLog) { $arguments += "--show-battle-log" }
& $node @arguments
if ($LASTEXITCODE -ne 0) { throw "Skill battle tests failed." }
& $node (Join-Path $PSScriptRoot "new-battle-core.test.cjs") $build
if ($LASTEXITCODE -ne 0) { throw "New battle core tests failed." }
& $node (Join-Path $PSScriptRoot "new-build.test.cjs") $build
if ($LASTEXITCODE -ne 0) { throw "New build flow tests failed." }
& $node (Join-Path $PSScriptRoot "new-inventory.test.cjs") $build
if ($LASTEXITCODE -ne 0) { throw "Inventory transaction tests failed." }
$expeditionArguments = @((Join-Path $PSScriptRoot "new-expedition.test.cjs"), $build)
if ($RulesOnly) { $expeditionArguments += "--rules-only" }
& $node @expeditionArguments
if ($LASTEXITCODE -ne 0) { throw "Expedition transaction tests failed." }
& $node (Join-Path $PSScriptRoot "feature-modules.test.cjs") $build
if ($LASTEXITCODE -ne 0) { throw "Feature module boundary tests failed." }
& $node (Join-Path $PSScriptRoot "skill-battle-prefab.test.cjs")
if ($LASTEXITCODE -ne 0) { throw "Skill battle prefab tests failed." }
& $node (Join-Path $PSScriptRoot "ui-assets.cjs")
if ($LASTEXITCODE -ne 0) { throw "UI resource references or dependency map are invalid." }
