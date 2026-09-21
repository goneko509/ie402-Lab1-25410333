@echo off
:: Batch file to restart SQL Server (SQLEXPRESS) Service
echo ==========================================
echo DANG KHOI DONG LAI KET NOI SQL SERVER...
echo ==========================================
net stop MSSQL$SQLEXPRESS
net start MSSQL$SQLEXPRESS
echo.
echo HOAN THANH! Vui long chay lai "node server.js" de kiem tra.
pause
