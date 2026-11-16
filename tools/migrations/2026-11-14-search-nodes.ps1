param([string]$Workbook = (Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '../../../config/Datas') -Filter 'N-*.xlsx').FullName)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$catalog = Get-Content -LiteralPath (Join-Path $PSScriptRoot '2026-11-14-search-nodes.json') -Encoding UTF8 -Raw | ConvertFrom-Json
$archive = [System.IO.Compression.ZipFile]::Open($Workbook, [System.IO.Compression.ZipArchiveMode]::Update)
$ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
function Read-Entry([string]$name) {
    $reader = New-Object System.IO.StreamReader($archive.GetEntry($name).Open())
    try { [xml]$reader.ReadToEnd() } finally { $reader.Dispose() }
}
function Write-Entry([string]$name, [xml]$document) {
    $archive.GetEntry($name).Delete()
    $stream = $archive.CreateEntry($name).Open()
    $writer = New-Object System.IO.StreamWriter($stream, (New-Object System.Text.UTF8Encoding($false)))
    try { $writer.Write($document.OuterXml) } finally { $writer.Dispose() }
}
function Column([int]$index) {
    $text = ''
    while ($index -gt 0) { $index--; $text = [char](65 + $index % 26) + $text; $index = [Math]::Floor($index / 26) }
    return $text
}
function Set-Cell([xml]$doc, [int]$rowIndex, [int]$colIndex, $value) {
    $data = $doc.worksheet.sheetData
    $row = $data.SelectSingleNode("*[local-name()='row' and @r='$rowIndex']")
    if (!$row) { $row = $doc.CreateElement('row', $ns); $row.SetAttribute('r', "$rowIndex"); [void]$data.AppendChild($row) }
    $ref = (Column $colIndex) + $rowIndex
    $cell = $row.SelectSingleNode("*[local-name()='c' and @r='$ref']")
    if (!$cell) { $cell = $doc.CreateElement('c', $ns); $cell.SetAttribute('r', $ref); [void]$row.AppendChild($cell) }
    while ($cell.HasChildNodes) { [void]$cell.RemoveChild($cell.FirstChild) }
    $cell.RemoveAttribute('t')
    if ($value -is [string]) {
        $cell.SetAttribute('t', 'inlineStr')
        $inline = $doc.CreateElement('is', $ns); $text = $doc.CreateElement('t', $ns); $text.InnerText = $value
        [void]$inline.AppendChild($text); [void]$cell.AppendChild($inline)
    } else {
        $number = $doc.CreateElement('v', $ns); $number.InnerText = [string]$value; [void]$cell.AppendChild($number)
    }
}
function Cell-Value($cell) {
    if (!$cell) { return '' }
    if ($cell.t -eq 's') { return $script:strings[[int]$cell.v] }
    if ($cell.t -eq 'inlineStr') { return $cell.is.InnerText }
    return [string]$cell.v
}
function Find-Row([xml]$doc, [int]$col, [string]$value) {
    foreach ($row in $doc.worksheet.sheetData.row) {
        $ref = (Column $col) + $row.r
        if ((Cell-Value ($row.c | Where-Object { $_.r -eq $ref })) -eq $value) { return [int]$row.r }
    }
    return 0
}
function Add-Field([xml]$doc, [int]$col, [string]$name, [string]$type) {
    Set-Cell $doc 1 $col $name; Set-Cell $doc 2 $col $type
    Set-Cell $doc 3 $col 'c'; Set-Cell $doc 4 $col $name
}
try {
    $script:strings = @()
    if ($archive.GetEntry('xl/sharedStrings.xml')) { $script:strings = @((Read-Entry 'xl/sharedStrings.xml').sst.si | ForEach-Object { $_.InnerText }) }
    $book = Read-Entry 'xl/workbook.xml'; $rels = Read-Entry 'xl/_rels/workbook.xml.rels'
    $sheets = @{}
    foreach ($sheet in $book.workbook.sheets.sheet) {
        $rid = $sheet.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
        $rel = $rels.Relationships.Relationship | Where-Object { $_.Id -eq $rid }
        $sheets[$sheet.name] = if ($rel.Target.StartsWith('/')) { $rel.Target.TrimStart('/') } else { 'xl/' + $rel.Target }
    }
    $nodes = Read-Entry $sheets.expedition_node
    Add-Field $nodes 11 'icon' 'string'
    Add-Field $nodes 12 'search_min' 'int'
    Add-Field $nodes 13 'search_max' 'int'
    Add-Field $nodes 14 'search_weight' 'int'
    foreach ($row in @($nodes.worksheet.sheetData.row | Where-Object { [int]$_.r -ge 5 })) {
        Set-Cell $nodes ([int]$row.r) 11 ''
        foreach ($col in 12..14) { Set-Cell $nodes ([int]$row.r) $col 0 }
    }
    foreach ($entry in $catalog.nodes) {
        $row = Find-Row $nodes 2 ([string]$entry.id)
        if (!$row) {
            $row = 1 + ($nodes.worksheet.sheetData.row | ForEach-Object { [int]$_.r } | Measure-Object -Maximum).Maximum
            Set-Cell $nodes $row 1 ''; Set-Cell $nodes $row 2 $entry.id
            Set-Cell $nodes $row 3 $entry.key; Set-Cell $nodes $row 4 'search'
            Set-Cell $nodes $row 6 ''; Set-Cell $nodes $row 8 -1
            Set-Cell $nodes $row 9 0; Set-Cell $nodes $row 10 0
        }
        Set-Cell $nodes $row 5 $entry.name; Set-Cell $nodes $row 7 $entry.pool
        Set-Cell $nodes $row 11 $entry.icon; Set-Cell $nodes $row 12 $entry.min
        Set-Cell $nodes $row 13 $entry.max; Set-Cell $nodes $row 14 $entry.weight
    }
    if ($nodes.worksheet.dimension) { $nodes.worksheet.dimension.SetAttribute('ref', 'A1:N40') }
    Write-Entry $sheets.expedition_node $nodes

    $pools = Read-Entry $sheets.expedition_pool
    foreach ($entry in $catalog.pools) {
        $row = Find-Row $pools 2 $entry.id
        if (!$row) { $row = 1 + ($pools.worksheet.sheetData.row | ForEach-Object { [int]$_.r } | Measure-Object -Maximum).Maximum }
        $values = @('', $entry.id, $entry.count[0], $entry.count[1], 50, $entry.durability[0], $entry.durability[1]) + @($entry.categories) + @($entry.qualities)
        for ($i = 0; $i -lt $values.Count; $i++) { Set-Cell $pools $row ($i + 1) $values[$i] }
    }
    if ($pools.worksheet.dimension) { $pools.worksheet.dimension.SetAttribute('ref', 'A1:V18') }
    Write-Entry $sheets.expedition_pool $pools

    $rules = Read-Entry $sheets.expedition_rule
    Set-Cell $rules 5 3 'stage4-20261114-search-sites'
    Set-Cell $rules 5 29 8; Set-Cell $rules 5 30 12
    $budgets = @('normal_min', 13, 'normal_max', 16, 'elite_min', 4, 'elite_max', 7,
        'insight_min', 2, 'insight_max', 4, 'borrow_min', 3, 'borrow_max', 5)
    for ($i = 0; $i -lt $budgets.Count; $i += 2) {
        $col = 31 + $i / 2
        Add-Field $rules $col $budgets[$i] 'int'; Set-Cell $rules 5 $col $budgets[$i + 1]
    }
    if ($rules.worksheet.dimension) { $rules.worksheet.dimension.SetAttribute('ref', 'A1:AL5') }
    Write-Entry $sheets.expedition_rule $rules
} finally { $archive.Dispose() }
Write-Output 'Updated source workbook: 9 search templates/pools, weighted budgets, restored expanded map rules.'
