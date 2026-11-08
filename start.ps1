param(
    [switch]$Build
)

$ErrorActionPreference = "Stop"

$dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
$dockerCandidates = @(
    $(if ($dockerCommand) { $dockerCommand.Source }),
    "C:\Program Files\Docker\Docker\resources\bin\docker.exe",
    "$env:LOCALAPPDATA\Programs\Kiri\resources\bin\docker.exe",
    "$env:ProgramFiles\Kiri\resources\bin\docker.exe"
) | Where-Object { $_ }

$docker = $dockerCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $docker) {
    throw @"
Docker CLI was not found.
Install Kiri (recommended: https://runkiri.com/releases/) or Docker Desktop, then open Kiri and click Start for the Linux VM.
"@
}

function Get-PreferredDockerContext {
    if ($env:DOCKER_CONTEXT -and $env:DOCKER_CONTEXT.Trim()) {
        return $env:DOCKER_CONTEXT.Trim()
    }
    if ($env:NOTE_LEDGER_DOCKER_CONTEXT -and $env:NOTE_LEDGER_DOCKER_CONTEXT.Trim()) {
        return $env:NOTE_LEDGER_DOCKER_CONTEXT.Trim()
    }

    try {
        $names = & $docker context ls --format "{{.Name}}" 2>$null
        if ($LASTEXITCODE -ne 0) {
            return $null
        }
        foreach ($name in $names) {
            if ($name -eq "kiri") {
                return "kiri"
            }
        }
    } catch {
        return $null
    }
    return $null
}

function Get-DockerArgPrefix {
    $context = Get-PreferredDockerContext
    if ($context) {
        return @("--context", $context)
    }
    return @()
}

function Invoke-ProjectDocker {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$DockerArguments
    )

    # Do not name this $args — that shadows PowerShell's automatic variable.
    # Keep native docker stderr as progress (not terminating errors under $ErrorActionPreference Stop).
    $dockerCliArgs = @(Get-DockerArgPrefix) + $DockerArguments
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $docker @dockerCliArgs | Out-Host
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorAction
    }
    if ($null -eq $code) {
        return 0
    }
    return [int]$code
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
        $psArgs = @(Get-DockerArgPrefix) + @("compose", "ps", "--format", "json")
        $lines = & $docker @psArgs 2>$null
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

$preferredContext = Get-PreferredDockerContext
if ($preferredContext) {
    Write-Host "Docker context: $preferredContext"
} else {
    Write-Host "Docker context: default"
}

$engineExit = Invoke-ProjectDocker -DockerArguments @("info", "--format", "{{.ServerVersion}}")
if ($engineExit -ne 0) {
    throw @"
Docker engine is not reachable.
If you use Kiri: open Kiri and click Start for the Linux VM, then retry.
Docker Desktop / Docker Engine users: start the engine and retry.
Override context with DOCKER_CONTEXT or NOTE_LEDGER_DOCKER_CONTEXT if needed.
"@
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
$composeExit = Invoke-ProjectDocker -DockerArguments $composeArguments
if ($composeExit -ne 0) {
    throw "Docker Compose failed with exit code $composeExit."
}

$pruneExit = Invoke-ProjectDocker -DockerArguments @("buildx", "prune", "--force", "--max-used-space", "8GB")
if ($pruneExit -ne 0) {
    Write-Warning "The website started, but Docker build-cache maintenance failed."
}
