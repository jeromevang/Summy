# PowerShell Test for PreCompact Hook
# Tests the hook script with a mock transcript

Write-Host "=== Testing PreCompact Hook ===" -ForegroundColor Cyan

# Create test directory
$testDir = Join-Path $PSScriptRoot "temp"
New-Item -ItemType Directory -Path $testDir -Force | Out-Null

# Create mock transcript with 10 messages
$mockMessages = @(
    '{"role":"user","content":"Hello, I need help with my code"}'
    '{"role":"assistant","content":"I would be happy to help you with your code"}'
    '{"role":"user","content":"I have a bug in my authentication module"}'
    '{"role":"assistant","content":"Let me help you debug the authentication"}'
    '{"role":"user","content":"Users cannot log in"}'
    '{"role":"assistant","content":"This sounds like a token validation issue"}'
    '{"role":"user","content":"The tokens are generated correctly"}'
    '{"role":"assistant","content":"The issue might be in verification middleware"}'
    '{"role":"user","content":"Should I check the secret key?"}'
    '{"role":"assistant","content":"Yes, verify the secret key matches"}'
)

$transcriptPath = Join-Path $testDir "test-transcript.jsonl"
Set-Content -Path $transcriptPath -Value ($mockMessages -join "`n")

Write-Host "Created mock transcript: $transcriptPath" -ForegroundColor Green
Write-Host "Total messages: 10" -ForegroundColor Gray

# Set environment variables
$env:CLAUDE_TRANSCRIPT_PATH = $transcriptPath
$env:CLAUDE_PROJECT_DIR = (Get-Item $PSScriptRoot).Parent.Parent.FullName

Write-Host "Environment variables set" -ForegroundColor Green

# Run the hook script
$hookScript = Join-Path (Get-Item $PSScriptRoot).Parent.FullName "precompact-summarize.ps1"

Write-Host "`nRunning hook script..." -ForegroundColor Cyan

try {
    $result = & $hookScript 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Host "Hook executed successfully" -ForegroundColor Green

        # Try to parse JSON
        try {
            $json = $result | ConvertFrom-Json

            if ($json.hookSpecificOutput) {
                Write-Host "Valid JSON output received" -ForegroundColor Green
                Write-Host "`nGenerated Context:" -ForegroundColor Cyan
                Write-Host $json.hookSpecificOutput.additionalContext -ForegroundColor Gray
            } else {
                Write-Host "Invalid JSON structure" -ForegroundColor Red
                exit 1
            }
        }
        catch {
            Write-Host "Failed to parse JSON" -ForegroundColor Red
            Write-Host "Output: $result" -ForegroundColor Gray
            exit 1
        }
    } else {
        Write-Host "Hook failed with exit code: $LASTEXITCODE" -ForegroundColor Red
        Write-Host "Output: $result" -ForegroundColor Gray
        exit 1
    }
}
catch {
    Write-Host "Exception during hook execution" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
finally {
    # Cleanup
    if (Test-Path $testDir) {
        Remove-Item -Path $testDir -Recurse -Force
        Write-Host "`nCleanup complete" -ForegroundColor Green
    }
}

Write-Host "`n=== All Tests Passed ===" -ForegroundColor Green
exit 0
