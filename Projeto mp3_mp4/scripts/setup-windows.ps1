$ErrorActionPreference = 'Stop'
node (Join-Path $PSScriptRoot 'setup-windows.js')
if ($LASTEXITCODE -ne 0) { throw 'Instalacao falhou.' }
