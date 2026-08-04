# Search PowerShell profile files
Write-Host "=== PowerShell Profiles ==="
$profiles = @(
    $PROFILE.AllUsersAllHosts,
    $PROFILE.AllUsersCurrentHost,
    $PROFILE.CurrentUserAllHosts,
    $PROFILE.CurrentUserCurrentHost
)
foreach ($p in $profiles) {
    Write-Host "Profile: $p"
    if (Test-Path $p) {
        Write-Host "  EXISTS - content:"
        Get-Content $p | Select-String -Pattern "ANTHROPIC|1337|jan" -CaseSensitive:$false | ForEach-Object { Write-Host "    >> $_" }
    } else {
        Write-Host "  not found"
    }
}

# Search .bashrc / .zshrc equivalent
Write-Host "`n=== Windows Terminal / CMD startup ==="
$cmdAutorun = Get-ItemProperty "HKCU:\Software\Microsoft\Command Processor" -ErrorAction SilentlyContinue
Write-Host "CMD AutoRun: $($cmdAutorun.AutoRun)"

# Check if Jan set a machine-level env var somewhere unusual
Write-Host "`n=== Searching AppData for Jan config ==="
$janPaths = @(
    "$env:APPDATA\jan",
    "$env:LOCALAPPDATA\jan",
    "$env:USERPROFILE\.jan"
)
foreach ($p in $janPaths) {
    if (Test-Path $p) { Write-Host "Found Jan data: $p"; Get-ChildItem $p -Recurse -Include "*.json","*.env","*.toml","*.yaml" -ErrorAction SilentlyContinue | Select-Object FullName }
}

# Check VSCode / terminal settings that might inject env vars
Write-Host "`n=== VS Code terminal env settings ==="
$vsSettings = "$env:APPDATA\Code\User\settings.json"
if (Test-Path $vsSettings) {
    Get-Content $vsSettings | Select-String -Pattern "ANTHROPIC|1337|jan" -CaseSensitive:$false | ForEach-Object { Write-Host "  >> $_" }
} else { Write-Host "VS Code settings not found" }
