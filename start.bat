@echo off
setlocal EnableDelayedExpansion

:: Change directory to where the script is located
cd /d "%~dp0"

echo [Info] Checking for Bun installation...
where bun >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [Info] Bun is not found. Attempting to install Bun automatically...
    powershell -NoProfile -Command "Invoke-RestMethod -Uri https://bun.sh/install.ps1 | Invoke-Expression"
    
    :: Add the default Bun installation path to the current session's PATH
    if exist "%USERPROFILE%\.bun\bin\bun.exe" (
        set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
    ) else (
        echo [Warning] Could not find bun.exe in the default path.
        echo [Warning] You might need to restart your terminal or install Bun manually.
        pause
        exit /b 1
    )
    
    where bun >nul 2>&1
    if !ERRORLEVEL! NEQ 0 (
        echo [Error] Failed to verify Bun installation.
        pause
        exit /b 1
    )
    echo [Info] Bun installed successfully.
) else (
    echo [Info] Bun is already installed.
)

:: Check and install dependencies
if not exist "node_modules\" (
    echo [Info] node_modules not found. Installing project dependencies...
    call bun install
    if !ERRORLEVEL! NEQ 0 (
        echo [Error] Failed to install dependencies.
        pause
        exit /b 1
    )
    echo [Info] Dependencies installed successfully.
) else (
    echo [Info] Dependencies are already installed.
)

:: Check and install frontend dependencies
if not exist "frontend\node_modules\" (
    echo [Info] frontend node_modules not found. Installing frontend dependencies...
    pushd frontend
    call bun install
    if !ERRORLEVEL! NEQ 0 (
        echo [Error] Failed to install frontend dependencies.
        popd
        pause
        exit /b 1
    )
    popd
    echo [Info] Frontend dependencies installed successfully.
) else (
    echo [Info] Frontend dependencies are already installed.
)

:: Build frontend assets when missing
if not exist "frontend\dist\index.html" (
    echo [Info] Frontend dist not found. Building frontend assets...
    pushd frontend
    call bun run build
    if !ERRORLEVEL! NEQ 0 (
        echo [Error] Failed to build frontend assets.
        popd
        pause
        exit /b 1
    )
    popd
    echo [Info] Frontend built successfully.
) else (
    echo [Info] Frontend dist is already available.
)

:: Start the application
echo [Info] Starting the application...
call bun run start

if %ERRORLEVEL% NEQ 0 (
    echo [Error] Application exited with an error code.
    pause
    exit /b 1
)

pause
