@echo off
title FinFlow Bot & Server Status Checker
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\check-status.ps1"
