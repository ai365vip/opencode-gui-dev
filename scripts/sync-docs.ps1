param(
  [string]$OpencodeRef = "dev"
)

$ErrorActionPreference = "Stop"

function Save-Url {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][string]$OutFile
  )

  $dir = Split-Path -Parent $OutFile
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Force $dir | Out-Null
  }

  $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 30
  Set-Content -Path $OutFile -Value $resp.Content -Encoding UTF8
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$out = Join-Path $root "docs/_local"

# -------------------------
# OpenCode docs (MIT)
# -------------------------
$opencodeOut = Join-Path $out "opencode"
$opencodeBase = "https://raw.githubusercontent.com/anomalyco/opencode/$OpencodeRef/packages/web/src/content/docs"

Save-Url "$opencodeBase/server.mdx" (Join-Path $opencodeOut "server.mdx")
Save-Url "$opencodeBase/sdk.mdx" (Join-Path $opencodeOut "sdk.mdx")
Save-Url "$opencodeBase/ide.mdx" (Join-Path $opencodeOut "ide.mdx")
Save-Url "https://raw.githubusercontent.com/anomalyco/opencode/$OpencodeRef/LICENSE" (Join-Path $opencodeOut "LICENSE")

# -------------------------
# oh-my-opencode docs (Sustainable Use License)
# -------------------------
$ohmyOut = Join-Path $out "oh-my-opencode"

Save-Url "https://ohmyopencode.com/documentation/" (Join-Path $ohmyOut "documentation.html")
Save-Url "https://ohmyopencode.com/configuration/" (Join-Path $ohmyOut "configuration.html")
Save-Url "https://ohmyopencode.com/agents/" (Join-Path $ohmyOut "agents.html")
Save-Url "https://ohmyopencode.com/installation/" (Join-Path $ohmyOut "installation.html")
Save-Url "https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/LICENSE.md" (Join-Path $ohmyOut "LICENSE.md")

# -------------------------
# learn-opencode docs (CC BY-NC-SA 4.0) - local snapshot only (gitignored)
# -------------------------
$learnOut = Join-Path $out "learn-opencode"

Save-Url "https://raw.githubusercontent.com/vbgate/learn-opencode/main/docs/5-advanced/10a-sdk-basics.md" (Join-Path $learnOut "10a-sdk-basics.md")
Save-Url "https://raw.githubusercontent.com/vbgate/learn-opencode/main/docs/5-advanced/10b-sdk-reference.md" (Join-Path $learnOut "10b-sdk-reference.md")
Save-Url "https://raw.githubusercontent.com/vbgate/learn-opencode/main/LICENSE" (Join-Path $learnOut "LICENSE")

Write-Host "Synced docs to: $out"
