@echo off
title Inicializador de Proyecto MFA
echo =======================================================
echo   INICIALIZANDO PROYECTO MFA DE EXTREMO A EXTREMO
echo =======================================================

echo.
echo [1/6] Instalando dependencias de Node.js en client/backend...
cd client\backend
call npm install
echo.
echo [2/6] Ejecutando migraciones de base de datos Postgres...
call npm run migrate
cd ..\..

echo.
echo [3/6] Instalando dependencias de Node.js en cloud_service/public/backend...
cd cloud_service\public\backend
call npm install
cd ..\..

echo.
echo [4/6] Instalando dependencias de Python faltantes en apiContainer (bmfa)...
cd apiContainer
call bmfa\Scripts\activate.bat
pip install numpy fastapi uvicorn pydantic pydantic-settings python-dotenv python-multipart PyJWT requests
call bmfa\Scripts\deactivate.bat
cd ..

echo.
echo [5/6] Instalando dependencias de Python faltantes en cloud_service (bmcloud)...
cd cloud_service
call bmcloud\Scripts\activate.bat
pip install pymongo motor dnspython
call bmcloud\Scripts\deactivate.bat
cd ..

echo.
echo =======================================================
echo [6/6] INICIANDO TODOS LOS SERVICIOS CONCURRENTEMENTE
echo =======================================================
echo Los servicios se abriran en terminales independientes:
echo   - Backend Externo Node: Puerto 4000
echo   - apiContainer Normalizador SDK: Puerto 9001
echo   - Public Gateway Node: Puerto 4003
echo   - Private ML Service FastAPI: Puerto 8000
echo.

:: 1. Backend Externo Node
start "Backend Externo (4000)" cmd /k "cd client\backend && npm run dev"

:: 2. apiContainer Normalizador
start "apiContainer Normalizador (9001)" cmd /k "cd apiContainer && call bmfa\Scripts\activate.bat && uvicorn src.main:app --port 9001 --reload"

:: 3. Public Gateway
start "Public Gateway (4003)" cmd /k "cd cloud_service\public\backend && npm run dev"

:: 4. Private ML Service
start "Private ML Service (8000)" cmd /k "cd cloud_service\private\src && call ..\..\bmcloud\Scripts\activate.bat && uvicorn app.main:app --port 8000 --reload"

echo.
echo ¡Levantamiento iniciado con exito!
echo Puedes ver las consolas individuales de cada servicio que acaban de abrirse.
echo.
echo Ahora puedes ejecutar los scripts de simulacion en una terminal separada:
echo   - Registrar usuario:  node 2_registrar_usuario.js
echo   - Loguear usuario:    node 3_loguear_usuario.js
echo.
pause
