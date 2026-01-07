# UserPromptSubmit Hook: Smart Context Compression
# Automatically compresses conversation context when message count exceeds threshold
# Uses LLM-powered analysis to intelligently preserve, compress, or drop messages
# Runs on EVERY user message to keep context lean continuously

param(
    [int]$Threshold = 10,              # Compress when message count > this
    [string]$Mode = "conservative",    # conservative | aggressive | context-aware
    [string]$Provider = "lmstudio",    # lmstudio | claude
    [int]$SkipLast = 5,                # Always preserve last N messages
    [switch]$UseRAG = $false           # Enable RAG semantic analysis
)

# Error handling
$ErrorActionPreference = "Stop"

try {
    # Get environment variables from Claude Code
    $transcriptPath = $env:CLAUDE_TRANSCRIPT_PATH
    $projectDir = $env:CLAUDE_PROJECT_DIR

    if (-not $transcriptPath) {
        Write-Error "CLAUDE_TRANSCRIPT_PATH environment variable not set"
        exit 1
    }

    if (-not (Test-Path $transcriptPath)) {
        Write-Error "Transcript file not found: $transcriptPath"
        exit 1
    }

    # Log hook start to Summy server
    $hookId = $null
    try {
        $logStartUrl = "http://localhost:3001/api/hooks/log-start"
        $logStartData = @{
            hookName = "UserPromptSubmit-Smart"
            transcriptPath = $transcriptPath
            settings = @{
                threshold = $Threshold
                mode = $Mode
                provider = $Provider
                useRAG = $UseRAG.IsPresent
            }
        } | ConvertTo-Json -Depth 5

        $response = Invoke-RestMethod -Uri $logStartUrl -Method POST -Body $logStartData -ContentType "application/json" -ErrorAction SilentlyContinue
        $hookId = $response.id
    } catch {
        Write-Warning "Failed to log hook start: $_"
    }

    # Read transcript
    $transcript = Get-Content -Path $transcriptPath -Raw

    if ([string]::IsNullOrWhiteSpace($transcript)) {
        # Empty transcript - nothing to compress
        $output = @{
            hookSpecificOutput = @{
                hookEventName = "UserPromptSubmit"
                additionalContext = ""
            }
        } | ConvertTo-Json -Depth 10

        Write-Output $output
        exit 0
    }

    # Count messages in JSONL
    $messageLines = $transcript -split "`n" | Where-Object { $_.Trim() -ne "" }
    $messageCount = $messageLines.Count

    # Check if compression should run
    if ($messageCount -le $Threshold) {
        # Below threshold - no compression needed
        if ($hookId) {
            try {
                $logCompleteUrl = "http://localhost:3001/api/hooks/log-complete"
                $logCompleteData = @{
                    id = $hookId
                    summary = "Skipped: message count ($messageCount) below threshold ($Threshold)"
                    duration = 0
                } | ConvertTo-Json -Depth 5

                Invoke-RestMethod -Uri $logCompleteUrl -Method POST -Body $logCompleteData -ContentType "application/json" -ErrorAction SilentlyContinue
            } catch {
                Write-Warning "Failed to log hook completion: $_"
            }
        }

        # Return no additional context
        $output = @{
            hookSpecificOutput = @{
                hookEventName = "UserPromptSubmit"
                additionalContext = ""
            }
        } | ConvertTo-Json -Depth 10

        Write-Output $output
        exit 0
    }

    # Message count exceeds threshold - trigger compression
    Write-Host "Smart compression triggered: $messageCount messages (threshold: $Threshold)" -ForegroundColor Cyan

    # Get project directory (remove .claude if present)
    $actualProjectDir = if ($projectDir -like "*\.claude") {
        (Get-Item $projectDir).Parent.FullName
    } else {
        $projectDir
    }

    # Path to smart compression CLI
    $cliPath = Join-Path $actualProjectDir "server\src\cli\smart-compress-cli.ts"

    if (-not (Test-Path $cliPath)) {
        Write-Warning "Smart compression CLI not found: $cliPath - continuing without compression"

        if ($hookId) {
            try {
                $logCompleteUrl = "http://localhost:3001/api/hooks/log-complete"
                $logCompleteData = @{
                    id = $hookId
                    summary = "CLI not found - compression skipped"
                    duration = 0
                    status = "warning"
                } | ConvertTo-Json -Depth 5

                Invoke-RestMethod -Uri $logCompleteUrl -Method POST -Body $logCompleteData -ContentType "application/json" -ErrorAction SilentlyContinue
            } catch {}
        }

        # Continue without compression
        $output = @{
            hookSpecificOutput = @{
                hookEventName = "UserPromptSubmit"
                additionalContext = ""
            }
        } | ConvertTo-Json -Depth 10

        Write-Output $output
        exit 0
    }

    $startTime = Get-Date

    # Build CLI command
    $cliArgs = @(
        "--smart"
        "--mode", $Mode
        "--provider", $Provider
        "--skip-last", $SkipLast
    )

    if ($UseRAG) {
        $cliArgs += "--use-rag"
    }

    # Redirect stderr to avoid polluting output
    $tempErrorFile = Join-Path $env:TEMP "smart-compress-error.txt"

    # Run compression
    Write-Host "Running smart compression with $Provider provider..." -ForegroundColor Yellow

    try {
        $compressed = $transcript | npx tsx $cliPath @cliArgs 2>$tempErrorFile

        if ($LASTEXITCODE -ne 0) {
            $errorOutput = if (Test-Path $tempErrorFile) { Get-Content $tempErrorFile -Raw } else { "Unknown error" }
            throw "Compression CLI failed with exit code $LASTEXITCODE`n$errorOutput"
        }

        $duration = ((Get-Date) - $startTime).TotalMilliseconds

        Write-Host "Compression complete in $([math]::Round($duration))ms" -ForegroundColor Green

        # Parse compressed transcript (JSONL output)
        $compressedLines = $compressed -split "`n" | Where-Object { $_.Trim() -ne "" }
        $compressedCount = $compressedLines.Count

        Write-Host "Compressed: $messageCount -> $compressedCount messages" -ForegroundColor Cyan

        # Log completion
        if ($hookId) {
            try {
                $logCompleteUrl = "http://localhost:3001/api/hooks/log-complete"
                $logCompleteData = @{
                    id = $hookId
                    summary = "Compressed $messageCount -> $compressedCount messages"
                    duration = [int]$duration
                    status = "success"
                    metadata = @{
                        originalCount = $messageCount
                        compressedCount = $compressedCount
                        mode = $Mode
                        provider = $Provider
                    }
                } | ConvertTo-Json -Depth 5

                Invoke-RestMethod -Uri $logCompleteUrl -Method POST -Body $logCompleteData -ContentType "application/json" -ErrorAction SilentlyContinue
            } catch {
                Write-Warning "Failed to log hook completion: $_"
            }
        }

        # Return compressed transcript as additional context
        # Format: newline-separated JSONL
        $additionalContext = $compressed

        $output = @{
            hookSpecificOutput = @{
                hookEventName = "UserPromptSubmit"
                additionalContext = $additionalContext
            }
        } | ConvertTo-Json -Depth 10

        Write-Output $output
        exit 0

    } catch {
        $duration = ((Get-Date) - $startTime).TotalMilliseconds

        Write-Warning "Compression failed: $_"
        Write-Host "Continuing without compression..." -ForegroundColor Yellow

        # Log failure
        if ($hookId) {
            try {
                $logCompleteUrl = "http://localhost:3001/api/hooks/log-complete"
                $logCompleteData = @{
                    id = $hookId
                    summary = "Compression failed: $($_.Exception.Message)"
                    duration = [int]$duration
                    status = "failed"
                } | ConvertTo-Json -Depth 5

                Invoke-RestMethod -Uri $logCompleteUrl -Method POST -Body $logCompleteData -ContentType "application/json" -ErrorAction SilentlyContinue
            } catch {}
        }

        # Continue without compression (never block conversation)
        $output = @{
            hookSpecificOutput = @{
                hookEventName = "UserPromptSubmit"
                additionalContext = ""
            }
        } | ConvertTo-Json -Depth 10

        Write-Output $output
        exit 0
    } finally {
        # Cleanup temp file
        if (Test-Path $tempErrorFile) {
            Remove-Item $tempErrorFile -Force -ErrorAction SilentlyContinue
        }
    }

} catch {
    Write-Error "Fatal hook error: $_"

    # Never block conversation - return empty context on fatal error
    $output = @{
        hookSpecificOutput = @{
            hookEventName = "UserPromptSubmit"
            additionalContext = ""
        }
    } | ConvertTo-Json -Depth 10

    Write-Output $output
    exit 0  # Exit with success to not block Claude Code
}
