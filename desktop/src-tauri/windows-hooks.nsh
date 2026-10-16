; Stop the bundled hq (dashboard backend, MCP servers started from this install) so its files can be replaced or removed.
!macro NSIS_HOOK_PREINSTALL
  nsExec::Exec `powershell -NoProfile -Command "Get-Process hq -ErrorAction SilentlyContinue | Where-Object { $$_.Path -like '$INSTDIR*' } | Stop-Process -Force"`
!macroend
!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec `powershell -NoProfile -Command "Get-Process hq -ErrorAction SilentlyContinue | Where-Object { $$_.Path -like '$INSTDIR*' } | Stop-Process -Force"`
!macroend
