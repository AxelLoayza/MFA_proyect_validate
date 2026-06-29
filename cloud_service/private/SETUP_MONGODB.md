# Configuración MongoDB Local - Cloud Service

## Guía Rápida de Instalación

### 1. Instalar MongoDB Community Edition

**Windows:**
1. Descargar desde: https://www.mongodb.com/try/download/community
2. Ejecutar el instalador `.msi`
3. Seleccionar "Complete" installation
4. Configurar como Windows Service (se inicia automáticamente)

Verificar que está corriendo:
```powershell
Get-Service MongoDB
```

**macOS:**
```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

**Linux (Ubuntu):**
```bash
sudo apt-get install -y mongodb
sudo systemctl start mongodb
sudo systemctl enable mongodb
```

---

### 2. Configurar Variables de Entorno

Se ha creado el archivo `.env` en la raíz del proyecto con la siguiente configuración para desarrollo local:

```env
# MongoDB
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=biometric_service
MONGO_COLLECTION_PROFILES=biometricprofile
MONGO_COLLECTION_LOGS=audit_logs

# API
API_HOST=0.0.0.0
API_PORT=8000
TLS_ENABLED=false

# Modelo
CONFIDENCE_THRESHOLD=95
MODEL_VERSION=lstm_v1

# Entorno
ENVIRONMENT=development
LOG_LEVEL=INFO
```

**IMPORTANTE:** Edita los valores según tu entorno específico.

---

### 3. Instalar Dependencias

```powershell
cd cloud_service
pip install -r src/requirements.txt
```

**Nuevas dependencias agregadas:**
- `pymongo==4.6.1` - Driver de Python para MongoDB
- `motor==3.3.2` - Driver async (para uso futuro)

---

### 4. Verificar la Conexión

```powershell
cd cloud_service
python test_mongo_connection.py
```

Este script:
- ✅ Carga y valida la configuración
- ✅ Intenta conectar a MongoDB
- ✅ Crea las colecciones necesarias
- ✅ Crea índices automáticamente
- ✅ Prueba operaciones básicas (insert/find/delete)

**Salida esperada:**
```
========================================================================
TESTING CLOUD SERVICE CONFIGURATION
========================================================================

[CONFIGURATION LOADED]
  Environment: development
  API Host: 0.0.0.0:8000
  ...

[MONGODB CONFIGURATION]
  URI: mongodb://localhost:27017
  Database: biometric_service
  ...

========================================================================
TESTING MONGODB CONNECTION
========================================================================

✓ Successfully connected to MongoDB!

[COLLECTIONS STATUS]
  Biometric Profiles: 0 documents
  Audit Logs: 0 documents

✓ MongoDB health check: PASSED

✓ ALL TESTS PASSED - Ready to start the service!
========================================================================
```

---

## Estructura de Archivos Añadida

```
cloud_service/
├── .env                                    # ✓ NUEVO - Configuración local
├── test_mongo_connection.py                # ✓ NUEVO - Script de prueba
│
└── src/app/
    ├── config.py                           # ✓ NUEVO - Gestión de variables de entorno
    ├── database.py                         # ✓ NUEVO - Conexión y operaciones MongoDB
    ├── main.py                             # ✓ ACTUALIZADO - Integración MongoDB
    ├── routes.py
    ├── models.py
    └── ...
```

---

## Archivos de Configuración

### `.env` - Variables de Entorno
- Especifica credenciales y URIs
- **Nunca** comitear a Git (añadir a `.gitignore`)
- Usar `.env.example` para documentar variables

### `config.py` - Gestión de Configuración
- Carga variables del archivo `.env`
- Usa `pydantic-settings` para validación
- Proporciona valores por defecto seguros
- Centraliza toda la configuración

### `database.py` - Conexión MongoDB
- `MongoDBConnection` - Maneja conexión/desconexión
- Crea colecciones automáticamente
- Crea índices para optimización
- Proporciona métodos helper

### `main.py` - Integración en Lifespan
- Conecta a MongoDB al iniciar
- Desconecta al apagar
- Log de estado de conexión

---

## Variables de Entorno para Producción

Para AWS/Docker, usar variables seguras:

```env
# Producción AWS
MONGO_URI=mongodb+srv://cloud_service:PASSWORD@cluster.mongodb.net/biometric_service
AWS_REGION=us-east-1
ENVIRONMENT=production
LOG_LEVEL=WARNING
TLS_ENABLED=true
```

**Usar AWS Secrets Manager para almacenar credenciales:**
```python
# Ejemplo (por implementar)
import boto3
secrets_client = boto3.client('secretsmanager')
mongo_password = secrets_client.get_secret_value(SecretId='mongo/password')['SecretString']
```

---

## Próximas Configuraciones

- [ ] MongoDB Atlas (producción)
- [ ] AWS Secrets Manager integration
- [ ] Dockerfile con MongoDB
- [ ] docker-compose para local
- [ ] CI/CD pipeline
- [ ] Health check endpoint para MongoDB

---

## Troubleshooting

### "Failed to connect to MongoDB"
```powershell
# Verificar que MongoDB está corriendo
Get-Service MongoDB

# Si no está corriendo:
Start-Service MongoDB

# Verificar conexión manual
mongosh "mongodb://localhost:27017"
```

### "Connection refused"
- Verificar puerto 27017: `netstat -ano | findstr :27017`
- Verificar firewall
- Reiniciar MongoDB service

### "Authentication failed"
- En desarrollo local, no usa autenticación por defecto
- Configurar usuario si MongoDB requires auth:
```bash
mongosh mongodb://localhost:27017/admin
> db.createUser({ user: "cloud_service", pwd: "password", roles: ["readWrite"] })
```

---

## Contacto & Notas

- Servicio diseñado para AWS ECS deployment
- Variables de entorno escalables a producción
- MongoDB local para desarrollo
- MongoDB Atlas recomendado para producción
