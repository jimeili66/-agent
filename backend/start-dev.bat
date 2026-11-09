@echo off
setlocal
cd /d "%~dp0.."

if exist ".env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do (
    set "%%A=%%B"
  )
)

python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
