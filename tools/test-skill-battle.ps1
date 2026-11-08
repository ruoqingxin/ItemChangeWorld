param([switch]$ShowBattleLog)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$build = Join-Path $root "bin/skill-battle-tests"
$workspaceNode = Join-Path (Split-Path -Parent $root) ".node/node-v22.14.0-win-x64"
if (Test-Path (Join-Path $workspaceNode "node.exe")) {
    $env:Path = "$workspaceNode;$env:Path"
}
$localTsc = Join-Path $root "node_modules/.bin/tsc.cmd"
$tsc = if (Test-Path $localTsc) { $localTsc } else { "tsc" }
$sources = @(
    (Join-Path $root "src/script/module/skillBattle/utils/SkillBattleConfigUtils.ts"),
    (Join-Path $root "src/script/module/skillBattle/manager/SkillBattleManager.ts"),
    (Join-Path $root "src/script/module/skillBattle/debug/SkillBattleDebug.ts"),
    (Join-Path $root "src/script/module/skillBattle/view/SkillBattlePresenter.ts"),
    (Join-Path $root "src/script/module/expedition/utils/ExpeditionConfigUtils.ts"),
    (Join-Path $root "engine/types/LayaAir.d.ts")
)

& $tsc --target ES2020 --module commonjs --lib "ES2020,DOM" --skipLibCheck --noEmit false --rootDir (Join-Path $root "src") --outDir $build @sources
if ($LASTEXITCODE -ne 0) { throw "Skill battle test compilation failed." }

$arguments = @((Join-Path $PSScriptRoot "skill-battle.test.cjs"), $build)
if ($ShowBattleLog) { $arguments += "--show-battle-log" }
& node @arguments
if ($LASTEXITCODE -ne 0) { throw "Skill battle tests failed." }
& node (Join-Path $PSScriptRoot "skill-battle-prefab.test.cjs")
if ($LASTEXITCODE -ne 0) { throw "Skill battle prefab tests failed." }
