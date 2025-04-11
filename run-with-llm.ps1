# run-with-llm.ps1
# This script starts the Transaction Categorizer with LLM support

$ollamaPath = "$env:LOCALAPPDATA\Ollama\ollama.exe"
$ollamaInstalled = Test-Path $ollamaPath

function Start-OllamaService {
    $ollamaRunning = Get-Process -Name "ollama" -ErrorAction SilentlyContinue
    
    if (-not $ollamaRunning) {
        Write-Host "Starting Ollama service..." -ForegroundColor Yellow
        Start-Process -FilePath $ollamaPath -WindowStyle Hidden
        
        # Give it a moment to start up
        Write-Host "Waiting for Ollama service to initialize..." -ForegroundColor Yellow
        Start-Sleep -Seconds 5
    }
    
    # Quick check to see if API is responsive
    try {
        # Just test the connection without storing the result
        Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get -ErrorAction Stop | Out-Null
        Write-Host "Ollama service is running." -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "Ollama API is not responsive. Make sure setup-llm.ps1 has been run." -ForegroundColor Red
        return $false
    }
}

# Check if Ollama is installed
if (-not $ollamaInstalled) {
    Write-Host "Ollama is not installed. Please run setup-llm.ps1 first." -ForegroundColor Red
    exit 1
}

# Start Ollama service
$serviceRunning = Start-OllamaService
if (-not $serviceRunning) {
    $answer = Read-Host "Would you like to continue without LLM capabilities? (y/n)"
    if ($answer -ne "y") {
        exit 1
    }
    Write-Host "Continuing without LLM capabilities..." -ForegroundColor Yellow
}

# Start the application
Write-Host "Starting Transaction Categorizer..." -ForegroundColor Cyan

# If this is a dev environment, use npm run dev
if (Test-Path "package.json") {
    # Check if we have a dev script
    $packageJson = Get-Content "package.json" | ConvertFrom-Json
    if ($packageJson.scripts.dev) {
        Write-Host "Running in development mode..." -ForegroundColor Cyan
        npm run dev
    } else {
        # Otherwise use npm start
        Write-Host "Running in production mode..." -ForegroundColor Cyan
        npm start
    }
} else {
    # If no package.json, look for a build directory
    if (Test-Path "build") {
        Write-Host "Running built application..." -ForegroundColor Cyan
        # Check if there's a server.js file
        if (Test-Path "build/server.js") {
            node build/server.js
        } else {
            # Otherwise try to serve the static files
            npx serve build
        }
    } else {
        Write-Host "Could not find application files. Please run this script from the project root directory." -ForegroundColor Red
        exit 1
    }
}