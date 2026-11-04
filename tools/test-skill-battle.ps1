param([switch]$ShowBattleLog)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$build = Join-Path $root "bin/skill-battle-tests"
$sources = @(
    (Join-Path $root "src/script/module/skillBattle/utils/SkillBattleConfigUtils.ts"),
    (Join-Path $root "src/script/module/skillBattle/manager/SkillBattleManager.ts"),
    (Join-Path $root "src/script/module/skillBattle/debug/SkillBattleDebug.ts"),
    (Join-Path $root "engine/types/LayaAir.d.ts")
)

& tsc --target ES2020 --module commonjs --lib "ES2020,DOM" --skipLibCheck --noEmit false --rootDir (Join-Path $root "src") --outDir $build @sources
if ($LASTEXITCODE -ne 0) { throw "Skill battle test compilation failed." }

$arguments = @((Join-Path $PSScriptRoot "skill-battle.test.cjs"), $build)
if ($ShowBattleLog) { $arguments += "--show-battle-log" }
& node @arguments
if ($LASTEXITCODE -ne 0) { throw "Skill battle tests failed." }
