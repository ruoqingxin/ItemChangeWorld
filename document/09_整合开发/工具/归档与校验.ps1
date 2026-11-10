param([switch]$ValidateOnly)

$ErrorActionPreference = "Stop"
$integratedRoot = Split-Path -Parent $PSScriptRoot
$documentRoot = Split-Path -Parent $integratedRoot
$archiveRoot = Join-Path $integratedRoot "参考资料/原始快照"
$manifestPath = Join-Path $integratedRoot "来源清单.json"
$utf8 = [System.Text.UTF8Encoding]::new($false)
$sourceDirectories = @(
    "00_总览", "01_mvp开发", "02_系统设计", "03_关卡秘境", "04_配置表",
    "05_待确认", "06_初版战斗设定", "07_技能战斗原型", "08_小说设定融合",
    "必读- 已确认规则", "第一版开发", "旧", "UI参考"
)
$topics = @(
    "01_项目定位与版本范围.md", "02_战斗资源与结算规则.md", "03_借道与局内构筑.md",
    "04_剑道内容与强化.md", "05_物品储物与终局结算.md", "06_地图搜索撤离与计时.md",
    "07_局外经济学习与成长.md", "08_界面交互与资源要求.md", "09_工程配置与存档约定.md",
    "10_待补充内容与扩展提案.md", "11_实施阶段与验收清单.md", "12_冲突处理与历史进度.md"
)

function Get-SourcePolicy([string]$relative) {
    $group = $relative.Split("/")[0]
    $name = [IO.Path]::GetFileName($relative)
    $status = "历史设计：有效方向已提炼，旧规则不再直接执行"
    $targets = @(1, 10, 12)
    switch ($group) {
        "00_总览" { $targets = @(1, 7, 10, 12) }
        "01_mvp开发" { $targets = @(1, 11, 12) }
        "02_系统设计" { $targets = @(2, 5, 7, 10, 12) }
        "03_关卡秘境" { $targets = @(1, 6, 10, 12) }
        "04_配置表" { $targets = @(9, 10, 12) }
        "05_待确认" { $targets = @(10, 12) }
        "06_初版战斗设定" { $targets = @(1, 3, 7, 12) }
        "第一版开发" { $targets = @(1, 3, 11, 12) }
        "旧" { $targets = @(1, 5, 9, 10, 12) }
        "必读- 已确认规则" {
            $status = "工程约定：保留分层、ID及源表原则，阶段限制已被后续覆盖"
            $targets = @(9, 12)
        }
        "UI参考" {
            $status = "图片参考：原图保留，不是需求或最终布局"
            $targets = @(8)
        }
        "07_技能战斗原型" {
            $status = "历史原型/验收：未被覆盖的工程原则保留，测试成绩不代表本轮"
            $targets = @(2, 8, 9, 11, 12)
            if ($name -match "平衡") { $targets = @(11, 12) }
        }
        "08_小说设定融合" {
            $status = "主要规则来源：按最新用户结论提炼，原文提案及历史段落不直接执行"
            $targets = @(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12)
            if ($name -match "^剑道") { $targets = @(4, 10, 12) }
            if ($name -match "^土道") {
                $status = "待确认提案：完整留存，未因整合或原型实现获得批准"
                $targets = @(10, 12)
            }
            if ($name -match "^借法与至强") { $targets = @(1, 3, 7, 10, 12) }
            if ($name -match "^阶段[123]") {
                $status = "历史实施记录：局部运行时/UI成果，须按当前规则重新核对"
                $targets = @(9, 11, 12)
            }
            if ($name -match "^首版推荐配置") {
                $status = "冲突推荐数据：禁止直接导表，未定数值不自动获准"
                $targets = @(9, 10, 12)
            }
            if ($name -eq "待确认问题汇总.md") { $targets = @(3, 4, 10, 12) }
            if ($name -match "^已确定事项总览") { $targets = @(1, 10, 11, 12) }
            if ($name -match "^八项待补充") { $targets = @(2, 5, 6, 7, 9, 11, 12) }
        }
        default { throw "Unmapped source directory: $group" }
    }
    [pscustomobject]@{
        status = $status
        integratedInto = @($targets | ForEach-Object { $topics[$_ - 1] })
    }
}

$unexpectedDirectories = @(
    Get-ChildItem -LiteralPath $documentRoot -Directory |
        Where-Object { $_.Name -ne "09_整合开发" -and $_.Name -notin $sourceDirectories }
)
if ($unexpectedDirectories.Count -gt 0) { throw "Unmapped source directories found." }
$unexpectedRootFiles = @(
    Get-ChildItem -LiteralPath $documentRoot -File |
        Where-Object { $_.Name -notin @("README.md", "AGENTS.md") }
)
if ($unexpectedRootFiles.Count -gt 0) { throw "Unmapped root documents found." }
$sourceFiles = @(
    foreach ($directory in $sourceDirectories) {
        Get-ChildItem -LiteralPath (Join-Path $documentRoot $directory) -File -Recurse
    }
) | Sort-Object FullName

if (-not $ValidateOnly) {
    $entries = @(
        foreach ($source in $sourceFiles) {
            $relative = [IO.Path]::GetRelativePath($documentRoot, $source.FullName).Replace("\", "/")
            $snapshotRelative = "参考资料/原始快照/$relative"
            $snapshot = Join-Path $integratedRoot $snapshotRelative
            $hash = (Get-FileHash -LiteralPath $source.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
            if (Test-Path -LiteralPath $snapshot) {
                $snapshotHash = (Get-FileHash -LiteralPath $snapshot -Algorithm SHA256).Hash.ToLowerInvariant()
                if ($snapshotHash -ne $hash) { throw "Frozen snapshot differs: $relative" }
            } else {
                $parent = Split-Path -Parent $snapshot
                New-Item -ItemType Directory -Path $parent -Force | Out-Null
                Copy-Item -LiteralPath $source.FullName -Destination $snapshot
            }
            $policy = Get-SourcePolicy $relative
            [pscustomobject][ordered]@{
                source = $relative
                snapshot = $snapshotRelative
                bytes = $source.Length
                sha256 = $hash
                status = $policy.status
                integratedInto = $policy.integratedInto
            }
        }
    )
    $images = @($entries | Where-Object source -like "UI参考/*")
    $manifest = [ordered]@{
        snapshotDate = "2026-11-09"
        sourceRoot = $documentRoot
        authority = "README.md"
        sourceCount = $entries.Count
        textAndDataCount = $entries.Count - $images.Count
        imageCount = $images.Count
        entries = $entries
    }
    [IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 8) + "`n", $utf8)
    $lines = [Collections.Generic.List[string]]::new()
    $lines.Add("# 来源清单")
    $lines.Add("")
    $lines.Add("整合日期：2026-11-09。全部原文件保留原位置，快照按原目录完整保存，不改文件字节。")
    $lines.Add("")
    $lines.Add("共 $($entries.Count) 个来源文件：$($entries.Count - $images.Count) 份文本/JSON、$($images.Count) 张 UI 图片。每个来源均映射到现行主题；原稿仅供追溯，不作为第二套开发依据。")
    $lines.Add("")
    $lines.Add("下表哈希显示 SHA-256 前十二位；完整值与字节数见 [机器清单](来源清单.json)。编号 01-12 对应 [入口导航](README.md)。")
    $lines.Add("")
    $lines.Add("| 原始文件/完整快照 | 性质 | 整合主题 | SHA-256 前缀 |")
    $lines.Add("| --- | --- | --- | --- |")
    foreach ($entry in $entries) {
        $links = @(
            $entry.integratedInto | ForEach-Object {
                $number = $_.Substring(0, 2)
                "[$number](<$_>)"
            }
        ) -join "、"
        $prefix = $entry.sha256.Substring(0, 12)
        $lines.Add("| [$($entry.source)](<$($entry.snapshot)>) | $($entry.status) | $links | ``$prefix`` |")
    }
    $lines.Add("")
    $lines.Add("## 完整性验证")
    $lines.Add("")
    $lines.Add("在本目录执行 `pwsh -File ./工具/归档与校验.ps1 -ValidateOnly`，只读检查来源覆盖、原文件/快照哈希、整合文档链接、JSON、关键规则参数与开发入口。游戏逻辑与浏览器测试不在此验证范围。")
    [IO.File]::WriteAllText((Join-Path $integratedRoot "来源清单.md"), ($lines -join "`n") + "`n", $utf8)
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding utf8 | ConvertFrom-Json
$entries = @($manifest.entries)
if ($entries.Count -ne $sourceFiles.Count) { throw "Source coverage count mismatch." }
$sourceNames = @(
    $sourceFiles | ForEach-Object { [IO.Path]::GetRelativePath($documentRoot, $_.FullName).Replace("\", "/") }
)
if (@(Compare-Object $sourceNames @($entries.source)).Count -ne 0) { throw "Source coverage path mismatch." }
$snapshotFiles = @(Get-ChildItem -LiteralPath $archiveRoot -File -Recurse)
if ($snapshotFiles.Count -ne $entries.Count) { throw "Snapshot count mismatch." }
foreach ($entry in $entries) {
    $source = Join-Path $documentRoot $entry.source
    $snapshot = Join-Path $integratedRoot $entry.snapshot
    foreach ($path in @($source, $snapshot)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing file: $path" }
        if ((Get-Item -LiteralPath $path).Length -ne $entry.bytes) { throw "Size mismatch: $path" }
        if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $entry.sha256) {
            throw "Hash mismatch: $path"
        }
    }
    foreach ($target in $entry.integratedInto) {
        if (-not (Test-Path -LiteralPath (Join-Path $integratedRoot $target))) {
            throw "Missing integrated topic: $target"
        }
    }
}

$activeMarkdown = @(
    Get-ChildItem -LiteralPath $integratedRoot -Filter "*.md" -Recurse -File |
        Where-Object { -not $_.FullName.StartsWith($archiveRoot, [StringComparison]::OrdinalIgnoreCase) }
)
$linkCount = 0
foreach ($file in $activeMarkdown) {
    $text = Get-Content -LiteralPath $file.FullName -Raw -Encoding utf8
    foreach ($match in [regex]::Matches($text, '\[[^\]\r\n]*\]\((?:<(?<path>[^>]+)>|(?<path>[^)\r\n]+))\)')) {
        $target = $match.Groups["path"].Value
        if ($target -match "^(https?://|#)") { continue }
        $target = [Uri]::UnescapeDataString(($target -split "#", 2)[0])
        $resolved = [IO.Path]::GetFullPath((Join-Path $file.DirectoryName $target))
        if (-not (Test-Path -LiteralPath $resolved)) { throw "Broken link in $($file.Name): $target" }
        $linkCount++
    }
}

$jsonFiles = @(Get-ChildItem -LiteralPath $integratedRoot -Filter "*.json" -File -Recurse)
foreach ($file in $jsonFiles) {
    Get-Content -LiteralPath $file.FullName -Raw -Encoding utf8 | ConvertFrom-Json | Out-Null
}
$baseline = Get-Content -LiteralPath (Join-Path $integratedRoot "数据/已确认规则基线.json") -Raw -Encoding utf8 | ConvertFrom-Json
$checks = @(
    ($baseline.confirmed.firstMap.realTimeLimitSeconds -eq 1200),
    ($baseline.confirmed.inventory.safeBoxInitialCells -eq 2),
    ($baseline.confirmed.inventory.battleBoxCells -eq 5),
    ($baseline.confirmed.inventory.warehousePageRows -eq 7),
    ($baseline.confirmed.inventory.warehousePageColumns -eq 8),
    ($baseline.confirmed.inventory.warehousePageCells -eq 56),
    ($baseline.confirmed.inventory.warehouseManualReposition -eq $true),
    ($baseline.confirmed.inventory.warehouseLayoutSaved -eq $true),
    ($baseline.confirmed.inventory.warehouseInboundDragUsesExactDrop -eq $true),
    ($baseline.confirmed.inventory.maxEquippedBags -eq 1),
    ($baseline.confirmed.inventory.unequippedContainerAllowedInBag -eq $true),
    ($baseline.confirmed.inventory.nestedContainerStorageEnabled -eq $false),
    ($baseline.confirmed.outside.transactionCurrency -eq "愿力"),
    ($baseline.confirmed.outside.spiritStoneCurrencyEnabled -eq $false),
    ($baseline.confirmed.battle.enchantingEnabledForFirstRelease -eq $false),
    ($baseline.confirmed.firstMap.clickReachableEnemyEntersBattleDirectly -eq $false),
    ($baseline.confirmed.firstMap.nodeClickOpensRightActionPanel -eq $true),
    ($baseline.confirmed.firstMap.nodeSelectionCommitsTravel -eq $false),
    ($baseline.confirmed.firstMap.firstSourceSearchOpenStartsAutomatically -eq $true),
    ($baseline.confirmed.firstMap.searchDurationIncreasesWithQuality -eq $true),
    ($baseline.confirmed.firstMap.undefeatedEnemiesBlockChosenPath -eq $true),
    ($baseline.confirmed.firstMap.bossVictoryDaoyun -eq 30),
    ($baseline.acceptedAdjustableTestStartingPoints.stage4MapApproval.approvedOn -eq "2026-11-10"),
    ($baseline.acceptedAdjustableTestStartingPoints.stage4MapApproval.mainNodeCount -eq 16),
    ($baseline.acceptedAdjustableTestStartingPoints.stage4MapApproval.branchNodeCount -eq 11),
    ($baseline.acceptedAdjustableTestStartingPoints.stage4MapApproval.branchCrossLinks.Count -eq 7),
    ($baseline.acceptedAdjustableTestStartingPoints.stage4MapApproval.fixedEdgeCount -eq 37),
    ($baseline.acceptedAdjustableTestStartingPoints.stage4MapApproval.mapViewport -eq "continuous-scroll-revealed-bounds-only"),
    ($baseline.acceptedAdjustableTestStartingPoints.stage4MapApproval.groundPageCount -eq 7),
    ($baseline.acceptedAdjustableTestStartingPoints.stage4MapApproval.groundCategoryTabs -eq $false),
    ($baseline.acceptedAdjustableTestStartingPoints.stage4MapApproval.nodeArtReplacementDeferred -eq $true),
    ($baseline.acceptedAdjustableTestStartingPoints.stage4MapApproval.searchBaseMs -eq 1000),
    (($baseline.acceptedAdjustableTestStartingPoints.stage4MapApproval.searchQualityDurationsMs -join ",") -eq "1000,2000,3000,4000,5000,6000"),
    ($baseline.acceptedAdjustableTestStartingPoints.stage4MapApproval.searchCheckpointMs -eq 250),
    ($baseline.acceptedAdjustableTestStartingPoints.stage4MapApproval.oldSaveAndObsoleteTestCompatibilityRequired -eq $false),
    ($baseline.acceptedAdjustableTestStartingPoints.stage4MapApproval.deletingOtherApplicationDataAllowed -eq $false),
    ($null -eq $baseline.confirmed.inventory.bagWidth),
    ($baseline.confirmed.outside.automaticStarterWeaponGift -eq $false),
    ($baseline.acceptedAdjustableTestStartingPoints.stage3InventoryApproval.approvedOn -eq "2026-11-09"),
    (($baseline.acceptedAdjustableTestStartingPoints.stage3InventoryApproval.battleBox -join ",") -eq "5,1"),
    (($baseline.acceptedAdjustableTestStartingPoints.stage3InventoryApproval.safeBox -join ",") -eq "2,1"),
    (($baseline.acceptedAdjustableTestStartingPoints.stage3InventoryApproval.bagTiers[0] -join ",") -eq "6,5"),
    (($baseline.acceptedAdjustableTestStartingPoints.stage3InventoryApproval.bagTiers[1] -join ",") -eq "8,6"),
    ($baseline.acceptedAdjustableTestStartingPoints.stage3InventoryApproval.repairCurrentEquippedWeaponOnly -eq 20),
    ($baseline.acceptedAdjustableTestStartingPoints.stage3InventoryApproval.oneAtomicSaveForInventoryBuildBattleAndSettlement -eq $true),
    ($baseline.acceptedAdjustableTestStartingPoints.stage3InventoryApproval.primaryInventoryInteraction -eq "drag-and-release-with-synchronous-image-rotation"),
    ($baseline.acceptedAdjustableTestStartingPoints.stage3InventoryApproval.ordinaryMoveRequiresExtraConfirmation -eq $false),
    ($baseline.acceptedAdjustableTestStartingPoints.stage3InventoryApproval.automaticRotationWhenOnlyOtherOrientationFits -eq $true),
    ($baseline.acceptedAdjustableTestStartingPoints.stage3InventoryApproval.automaticRotationHoverMs -eq 400),
    ($baseline.confirmed.inventory.allWeaponsEntityCells -eq 6),
    ($baseline.confirmed.inventory.allContainersEntityCells -eq 4),
    ($baseline.confirmed.inventory.equipmentUsesActualCellFootprint -eq $true),
    ($baseline.confirmed.inventory.uniformCellSizeAcrossInventoryRegions -eq $true),
    (($baseline.acceptedAdjustableTestStartingPoints.stage3InventoryApproval.rectangularShapes.weapon -join ",") -eq "2,3"),
    ($baseline.acceptedAdjustableTestStartingPoints.stage3InventoryApproval.inventoryCellPitchPixels -eq 56),
    ($baseline.confirmed.inventory.equipmentDragRequiresExtraConfirmation -eq $false),
    ($baseline.confirmed.inventory.containerSwapAutomaticallyRepacks -eq $true),
    ($baseline.confirmed.inventory.containerSwapPreparationOverflow -eq "warehouse"),
    ($baseline.confirmed.inventory.containerSwapActiveOverflow -eq "current-revealed-ground"),
    ($baseline.confirmed.inventory.weaponSwapOldDestination -eq "incoming-weapon-source"),
    ($baseline.acceptedAdjustableTestStartingPoints.stage3InventoryApproval.containerContentsStillUseAtomicPlanConfirmation -eq $false),
    ($baseline.acceptedAdjustableTestStartingPoints.stage3InventoryApproval.containerContentsStillUseAtomicTransaction -eq $true),
    ($baseline.acceptedAdjustableTestStartingPoints.stage3InventoryApproval.containerSwapOverflowRejectsWholeTransaction -eq $false),
    ($baseline.acceptedAdjustableTestStartingPoints.stage3InventoryApproval.invalidContainerSwapPlanRejectsWholeTransaction -eq $true)
)
if ($checks -contains $false) { throw "Confirmed baseline assertions failed." }
$projectRoot = Split-Path -Parent $documentRoot
$workspaceRoot = Split-Path -Parent $projectRoot
$pointers = @(
    (Join-Path $projectRoot "AGENTS.md"),
    (Join-Path $documentRoot "AGENTS.md"),
    (Join-Path $documentRoot "README.md"),
    (Join-Path $workspaceRoot "config/document/AGENTS.md")
)
foreach ($pointer in $pointers) {
    $text = Get-Content -LiteralPath $pointer -Raw -Encoding utf8
    if (-not $text.Contains("09_整合开发")) { throw "Missing authority pointer: $pointer" }
}

Write-Output "Source files: $($entries.Count); source and snapshot SHA-256 checks: $($entries.Count * 2)"
Write-Output "Active Markdown files: $($activeMarkdown.Count); valid local links: $linkCount; valid JSON files: $($jsonFiles.Count)"
Write-Output "Confirmed baseline assertions: $($checks.Count); authority pointers: $($pointers.Count)"
Write-Output "PASS: documentation coverage, integrity, links, JSON, baseline and authority pointers."
