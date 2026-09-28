param(
    [switch]$Build
)

$ErrorActionPreference = "Stop"

$dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
$docker = if ($dockerCommand) {
    $dockerCommand.Source
} else {
    "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
}
if (-not (Test-Path -LiteralPath $docker) -and -not $dockerCommand) {
    throw "Docker CLI was not found. Install or start Docker Desktop first."
}

function Test-PortAvailable([int]$Port) {
    $listener = [System.Net.Sockets.TcpListener]::new(
        [System.Net.IPAddress]::Any,
        $Port
    )
    try {
        $listener.Start()
        return $true
    } catch [System.Net.Sockets.SocketException] {
        return $false
    } finally {
        $listener.Stop()
    }
}

function Find-FreePort([int]$PreferredPort) {
    for ($port = $PreferredPort; $port -le 65535; $port++) {
        if (Test-PortAvailable $port) {
            return $port
        }
    }
    throw "No free TCP port was found at or above $PreferredPort."
}

function Get-CurrentProjectPort([int]$ContainerPort) {
    try {
        $lines = & $docker compose ps --format json 2>$null
        foreach ($line in $lines) {
            if (-not $line) { continue }
            $service = $line | ConvertFrom-Json
            foreach ($publisher in $service.Publishers) {
                if ($publisher.TargetPort -eq $ContainerPort -and $publisher.PublishedPort) {
                    return [int]$publisher.PublishedPort
                }
            }
        }
    } catch {
        return $null
    }
    return $null
}

$currentWebPort = Get-CurrentProjectPort 3000
$currentApiPort = Get-CurrentProjectPort 8080
$webPort = if ($currentWebPort) { $currentWebPort } else { Find-FreePort 3000 }
$apiPort = if ($currentApiPort) { $currentApiPort } else { Find-FreePort 8080 }

$env:WEB_PORT = $webPort
$env:API_PORT = $apiPort
$env:PUBLIC_WEB_URL = "http://localhost:$webPort"
$env:PUBLIC_API_URL = "http://localhost:$apiPort"

Write-Host "Web: $env:PUBLIC_WEB_URL"
Write-Host "API: $env:PUBLIC_API_URL"
$composeArguments = @("compose", "up", "-d")
if ($Build) {
    $composeArguments += "--build"
}
& $docker @composeArguments
if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose failed with exit code $LASTEXITCODE."
}

& $docker buildx prune --force --max-used-space 8GB
if ($LASTEXITCODE -ne 0) {
    Write-Warning "The website started, but Docker build-cache maintenance failed."
}
