# Operational Protocols

### Safe Server Startup (Windows/PowerShell)
To start long-running servers (like Node.js) without blocking the Gemini CLI or risking termination:

1.  **Avoid Foreground Execution:** Never run blocking commands like `npm run dev` directly in the main shell. It will hang the CLI interface.
2.  **Use `Start-Process`:** Launch processes in a separate, hidden window with output redirection.
    ```powershell
    Start-Process powershell -ArgumentList '-NoProfile', '-Command', 'npm run dev > server.out 2> server.err' -WindowStyle Hidden
    ```
3.  **Monitor Logs:** Do not use `-Wait`. Read logs on demand.
    ```powershell
    Get-Content -Tail 20 server.out
    ```
4.  **Cleanup:** Always check for and kill conflicting processes (via `Get-NetTCPConnection` or `Get-Process`) before starting new instances.