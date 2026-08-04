Write-Host "=== User-level env vars ==="
[System.Environment]::GetEnvironmentVariables('User').GetEnumerator() | Sort-Object Name | ForEach-Object {
    Write-Host "$($_.Key) = $($_.Value)"
}
