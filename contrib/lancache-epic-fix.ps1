<#
.SYNOPSIS
    Configure the Epic Games Launcher to use HTTP CDNs so LANCache can
    intercept and cache Fortnite / Epic Games Store downloads.

.DESCRIPTION
    LANCache only caches HTTP traffic. HTTPS is SNI-proxied straight through
    and is NOT cached — every chunk shows up as a MISS no matter how many
    times it is downloaded. The Epic Games Launcher will negotiate HTTPS
    CDN endpoints by default, which is why users report "Fortnite cached
    for ~20 seconds and then every chunk is a MISS" (upstream issue
    lancachenet/monolithic#192).

    The fix is a single setting in the launcher's Engine.ini:

        [Launcher]
        ForceNonSslCdn=false

    Yes — `false`. The naming is confusing but this is the documented
    LANCache + community value: setting it to `false` tells the launcher
    "do NOT force the non-SSL CDN to upgrade to SSL", i.e. leave the HTTP
    CDN endpoints alone so LANCache can see them.

    This script is idempotent:
      * If the [Launcher] section + ForceNonSslCdn=false line are already
        present, it does nothing.
      * If the line exists with a different value, it is corrected.
      * If the section or line is missing, it is appended.
      * If Engine.ini (or its parent directory) does not exist, it is
        created.

    NOTE: There was a community PowerShell script floating around on
    Discord that used literal `n` characters instead of real PowerShell
    backtick-n newlines, so it wrote a single-line garbage Engine.ini.
    This script uses real backtick-n (`n) newlines.

.PARAMETER EnginePath
    Optional override for the Engine.ini path. Defaults to
    %LOCALAPPDATA%\EpicGamesLauncher\Saved\Config\Windows\Engine.ini.

.EXAMPLE
    PS> .\lancache-epic-fix.ps1
    Applies the fix to the current user's Epic Games Launcher.

.EXAMPLE
    PS> .\lancache-epic-fix.ps1 -EnginePath "C:\tmp\Engine.ini"
    Applies the fix to a custom path (useful for testing).

.NOTES
    Run AFTER you have installed the Epic Games Launcher at least once
    (so the Saved\Config\Windows directory exists). Restart the launcher
    after running this script for the setting to take effect.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$EnginePath = (Join-Path -Path $env:LOCALAPPDATA -ChildPath 'EpicGamesLauncher\Saved\Config\Windows\Engine.ini')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- typed helpers ----------------------------------------------------------

function Get-EngineIniContent {
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return [string]::Empty
    }

    return [System.IO.File]::ReadAllText($Path)
}

function Set-EngineIniContent {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [AllowEmptyString()]
        [string]$Content
    )

    $parent = Split-Path -Path $Path -Parent
    if (-not [string]::IsNullOrEmpty($parent) -and -not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }

    # UTF-8 without BOM is the safest match for what the launcher writes.
    $utf8NoBom = New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $false
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Update-LauncherSetting {
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyString()]
        [string]$Content,

        [Parameter(Mandatory = $true)]
        [string]$Section,

        [Parameter(Mandatory = $true)]
        [string]$Key,

        [Parameter(Mandatory = $true)]
        [string]$Value,

        [Parameter(Mandatory = $true)]
        [ref]$Changed
    )

    $Changed.Value = $false

    # Use real PowerShell newlines (backtick-n). Do NOT use literal 'n'.
    $nl = "`n"

    # Split into lines while preserving content of empty files.
    $lines = if ([string]::IsNullOrEmpty($Content)) {
        @()
    } else {
        $Content -split "`r?`n"
    }

    $sectionHeader = "[$Section]"
    $desiredLine   = "$Key=$Value"
    $keyPattern    = "^\s*$([Regex]::Escape($Key))\s*="

    # Locate the section header.
    $sectionIndex = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i].Trim() -ieq $sectionHeader) {
            $sectionIndex = $i
            break
        }
    }

    if ($sectionIndex -lt 0) {
        # Section missing -> append [Section]\nKey=Value at end of file.
        $builder = New-Object -TypeName System.Text.StringBuilder
        if (-not [string]::IsNullOrEmpty($Content)) {
            [void]$builder.Append($Content)
            if (-not $Content.EndsWith("`n")) {
                [void]$builder.Append($nl)
            }
            # Blank line separator before a brand-new section, but only if
            # the file already had non-empty content.
            [void]$builder.Append($nl)
        }
        [void]$builder.Append($sectionHeader)
        [void]$builder.Append($nl)
        [void]$builder.Append($desiredLine)
        [void]$builder.Append($nl)
        $Changed.Value = $true
        return $builder.ToString()
    }

    # Section present — scan its body until the next [Section] header
    # (or EOF) for the key.
    $bodyEnd = $lines.Count
    for ($j = $sectionIndex + 1; $j -lt $lines.Count; $j++) {
        if ($lines[$j].Trim() -match '^\[.+\]$') {
            $bodyEnd = $j
            break
        }
    }

    $keyIndex = -1
    for ($k = $sectionIndex + 1; $k -lt $bodyEnd; $k++) {
        if ($lines[$k] -match $keyPattern) {
            $keyIndex = $k
            break
        }
    }

    if ($keyIndex -ge 0) {
        if ($lines[$keyIndex] -eq $desiredLine) {
            # Already correct — no-op.
            return $Content
        }
        $lines[$keyIndex] = $desiredLine
        $Changed.Value = $true
    } else {
        # Key missing inside an existing section — insert immediately after
        # the section header for predictability.
        $newLines = New-Object -TypeName System.Collections.Generic.List[string]
        for ($m = 0; $m -lt $lines.Count; $m++) {
            $newLines.Add($lines[$m])
            if ($m -eq $sectionIndex) {
                $newLines.Add($desiredLine)
            }
        }
        $lines = $newLines.ToArray()
        $Changed.Value = $true
    }

    return ($lines -join $nl)
}

# --- main -------------------------------------------------------------------

Write-Host "LANCache Epic Games fix"
Write-Host "Target Engine.ini : $EnginePath"

$existing = Get-EngineIniContent -Path $EnginePath
$changed  = $false

$updated = Update-LauncherSetting `
    -Content $existing `
    -Section 'Launcher' `
    -Key     'ForceNonSslCdn' `
    -Value   'false' `
    -Changed ([ref]$changed)

if ($changed) {
    Set-EngineIniContent -Path $EnginePath -Content $updated
    Write-Host "Updated [Launcher] ForceNonSslCdn=false"
    Write-Host "Restart the Epic Games Launcher for the change to take effect."
} else {
    Write-Host "Already configured: [Launcher] ForceNonSslCdn=false — no changes made."
}
