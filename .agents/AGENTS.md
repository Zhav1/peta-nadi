# Token Optimization Rule

To reduce LLM token usage and optimize command execution outputs, all shell commands in this workspace should be routed through the `rtk` (Rust Token Killer) CLI proxy.

## Guidelines
1. Prefix standard shell commands with `rtk` (e.g., `rtk git status`, `rtk npm run test`, `rtk cargo test`).
2. If `rtk` is not directly recognized in a new terminal session, refresh the shell PATH environment variable from the system registry before running it:
   ```powershell
   $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
   ```
   You can combine this like:
   ```powershell
   $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User"); rtk <command>
   ```
