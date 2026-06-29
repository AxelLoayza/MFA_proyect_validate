@echo off
title Inicializador de Proyecto MFA
echo =======================================================
echo   INICIALIZANDO PROYECTO MFA DE EXTREMO A EXTREMO
echo =======================================================

echo.
echo [1/8] Instalando dependencias de Node.js en client/backend...
pushd client\backend
call npm install
popd
echo.
echo [2/8] Ejecutando migraciones de base de datos Postgres...
pushd client\backend
call npm run migrate
popd

echo.
echo [3/8] Instalando dependencias de Node.js en cloud_service/public/backend...
pushd cloud_service\public\backend
call npm install
popd

echo.
echo [4/8] Instalando dependencias del frontend React de admin/acceso en cloud_service/public/frontend...
pushd cloud_service\public\frontend
call npm install
if not exist .env if exist .env.example copy /y .env.example .env >nul
popd

echo.
echo [5/8] Instalando dependencias del frontend Flutter de login en client/frontend...
pushd client\frontend
call flutter pub get
popd

echo.
echo [6/8] Instalando dependencias de Python faltantes en apiContainer (bmfa)...
call apiContainer\bmfa\Scripts\python.exe -m pip install -r apiContainer\requirements.txt

echo.
echo [7/8] Instalando dependencias de Python faltantes en cloud_service (bmcloud)...
call cloud_service\bmcloud\Scripts\python.exe -m pip install PyJWT==2.8.0 cryptography==41.0.7 cffi==2.0.0 pycparser==3.0 pymongo motor dnspython

echo.
echo =======================================================
echo [8/8] INICIANDO TODOS LOS SERVICIOS CONCURRENTEMENTE
echo =======================================================
echo Los servicios se abriran en terminales independientes:
echo   - Backend Externo Node: Puerto 4000
echo   - Frontend Admin/Acceso React: Puerto 5173
echo   - Frontend Flutter Login: Puerto 59671
echo   - apiContainer Normalizador SDK: Puerto 9001
echo   - Public Gateway Node: Puerto 4003
echo   - Private ML Service FastAPI: Puerto 8000
echo.

:: 1. Backend Externo Node
start "Backend Externo (4000)" cmd /k "cd /d %~dp0client\backend && npm run dev"

:: 2. Frontend Admin/Acceso React
start "Frontend Admin/Acceso (5173)" cmd /k "cd /d %~dp0cloud_service\public\frontend && npm run dev"

:: 3. Frontend Flutter Login
start "Frontend Flutter Login (59671)" cmd /k "cd /d %~dp0client\frontend && flutter run -d edge --web-hostname=localhost --web-port=59671"

:: 4. apiContainer Normalizador
start "apiContainer Normalizador (9001)" cmd /k "cd /d %~dp0apiContainer\src && ..\bmfa\Scripts\python.exe -m uvicorn app:app --port 9001 --reload"

:: 5. Public Gateway
start "Public Gateway (4003)" cmd /k "cd /d %~dp0cloud_service\public\backend && npm run dev"

:: 6. Private ML Service
start "Private ML Service (8000)" cmd /k "cd /d %~dp0cloud_service\private\src && ..\..\bmcloud\Scripts\python.exe -m uvicorn app.main:app --port 8000 --reload"

echo.
echo ¡Levantamiento iniciado con exito!
echo Puedes ver las consolas individuales de cada servicio que acaban de abrirse.
echo.
echo Ahora puedes ejecutar los scripts de simulacion en una terminal separada:
echo   - Registrar usuario:  node 2_registrar_usuario.js
echo   - Loguear usuario:    node 3_loguear_usuario.js
echo.
pause
