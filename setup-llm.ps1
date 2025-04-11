# setup-llm.ps1
# This script sets up the LLM environment for the Transaction Categorizer

Write-Host "Setting up LLM environment for Transaction Categorizer..." -ForegroundColor Cyan

# Check if Ollama is installed
$ollamaPath = "$env:LOCALAPPDATA\Ollama\ollama.exe"
$ollamaInstalled = Test-Path $ollamaPath

if (-not $ollamaInstalled) {
    Write-Host "Ollama not found. Downloading Ollama installer..." -ForegroundColor Yellow
    
    $tempDir = [System.IO.Path]::GetTempPath()
    $installerPath = Join-Path $tempDir "ollama-installer.exe"
    
    try {
        Invoke-WebRequest -Uri "https://ollama.com/download/ollama-installer.exe" -OutFile $installerPath
        
        Write-Host "Running Ollama installer. Please complete the installation process." -ForegroundColor Yellow
        Start-Process -FilePath $installerPath -Wait
        
        # Check again if installation was successful
        $ollamaInstalled = Test-Path $ollamaPath
        
        if (-not $ollamaInstalled) {
            Write-Host "Ollama installation could not be verified. Please install Ollama manually from https://ollama.com" -ForegroundColor Red
            exit 1
        }
    }
    catch {
        Write-Host "Failed to download Ollama installer. Please install manually from https://ollama.com" -ForegroundColor Red
        Write-Host "Error: $_" -ForegroundColor Red
        exit 1
    }
}

# Check if Ollama service is running
$ollamaRunning = Get-Process -Name "ollama" -ErrorAction SilentlyContinue

if (-not $ollamaRunning) {
    Write-Host "Starting Ollama service..." -ForegroundColor Yellow
    Start-Process -FilePath $ollamaPath -WindowStyle Hidden
    
    # Wait for service to start
    Write-Host "Waiting for Ollama service to start..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
}

# Check if model is available
Write-Host "Checking for Llama3 model..." -ForegroundColor Cyan
$modelCheckResult = & $ollamaPath list 2>&1

if ($modelCheckResult -match "llama3") {
    Write-Host "Llama3 model is already installed." -ForegroundColor Green
} else {
    Write-Host "Pulling Llama3 model (this may take a while)..." -ForegroundColor Yellow
    & $ollamaPath pull llama3
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to pull Llama3 model. You can try manually by running 'ollama pull llama3'" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "Llama3 model successfully installed." -ForegroundColor Green
}

# Check if API is responsive
try {
    Write-Host "Testing Ollama API..." -ForegroundColor Cyan
    # Just test the connection without storing the result
    Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get -ErrorAction Stop | Out-Null
    Write-Host "Ollama API is responsive." -ForegroundColor Green
}
catch {
    Write-Host "Ollama API is not responding. Please ensure Ollama is running properly." -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`nSetup completed successfully!" -ForegroundColor Green
Write-Host "You can now run your Transaction Categorizer with LLM capabilities." -ForegroundColor Cyan
Write-Host "The application will automatically detect and use the LLM when available." -ForegroundColor Cyan