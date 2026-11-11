$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$app = Join-Path $root 'Dimensionamento de Fossa 6.0'
$version = (Get-Content -LiteralPath (Join-Path $app 'resources/app/package.json') -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Versão inválida em package.json.' }

$output = Join-Path $root "INSTALAR FOSSA $version.exe"
$work = Join-Path $PSScriptRoot ('.build-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = Join-Path $work 'dre-payload.zip'
    [IO.Compression.ZipFile]::CreateFromDirectory($app, $zip, [IO.Compression.CompressionLevel]::Optimal, $false)

    $metadata = Join-Path $work 'Version.cs'
    @"
using System.Reflection;
[assembly: AssemblyTitle("Instalação do DRE")]
[assembly: AssemblyProduct("Dimensionamento de Fossa")]
[assembly: AssemblyVersion("$version.0")]
[assembly: AssemblyFileVersion("$version.0")]
"@ | Set-Content -LiteralPath $metadata -Encoding utf8

    $candidate = Join-Path $work 'setup.exe'
    $compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    $options = @(
        '/nologo', '/codepage:65001', '/target:winexe', '/platform:x64', '/optimize+', "/out:$candidate"
        "/win32icon:$(Join-Path $app 'resources/app/icon.ico')", "/resource:$zip,dre-payload.zip"
        '/r:System.IO.Compression.dll', '/r:System.IO.Compression.FileSystem.dll', '/r:System.Windows.Forms.dll'
        '/r:System.Drawing.dll', '/r:Microsoft.CSharp.dll', (Join-Path $PSScriptRoot 'Setup.cs'), $metadata
    )
    & $compiler @options
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar o instalador.' }
    if ([IO.File]::Exists($output)) { [IO.File]::Replace($candidate, $output, (Join-Path $work 'setup-anterior.exe')) }
    else { [IO.File]::Move($candidate, $output) }
    Get-Item -LiteralPath $output
} finally {
    $resolved = (Resolve-Path -LiteralPath $work).ProviderPath
    if ($resolved -eq $work -and (Split-Path -Parent $resolved) -eq $PSScriptRoot -and
        (Split-Path -Leaf $resolved) -match '^\.build-[a-f0-9]{32}$' -and !(Get-Item -LiteralPath $resolved).LinkType) {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
