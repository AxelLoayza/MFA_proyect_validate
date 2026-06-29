# Backend MFA - Proveedor de Autenticación

Este proyecto implementa un proveedor de autenticación con soporte para Multi-Factor Authentication (MFA) y niveles de garantía adaptativos (Adaptive Risk Control - ARC).

## 🎯 Objetivo

Proporcionar una capa de autenticación robusta que soporte:
- Autenticación básica con usuario/contraseña (ARC 0.5)
- Step-up authentication con biometría (ARC 1.0)
- Validación adaptativa basada en riesgo (ARC 2.0)
- Gestión de sesiones con tokens JWT

## 🏗️ Estructura del Proyecto

```
backend/
├── src/
│   ├── app.js                 # Configuración Express y middlewares
│   ├── server.js              # Entrada de la aplicación
│   ├── config/               
│   │   ├── database.js        # Configuración PostgreSQL
│   │   ├── cloud_keys.js      # Configuración JWKS y Cloud
│   │   ├── logger.js          # Configuración de logs
│   │   └── rateLimit.js       # Límites de peticiones
│   ├── controllers/          
│   │   ├── auth.controller.js # Lógica de autenticación
│   │   └── user.controller.js # Gestión de usuarios
│   ├── middleware/           
│   │   ├── arc.middleware.js  # Validación de nivel ARC
│   │   ├── jwt.middleware.js  # Validación de tokens
│   │   └── limiter.middleware.js
│   ├── models/              
│   │   ├── policy.models.js   # Políticas de acceso
│   │   ├── session.model.js   # Gestión de sesiones
│   │   └── user.model.js      # Modelo de usuario
│   ├── routes/              
│   │   ├── auth.routes.js     # Rutas de autenticación
│   │   └── user.routes.js     # Rutas de usuario
│   └── services/            
│       ├── auth.service.js    # Lógica de negocio auth
│       ├── cloudScoring.service.js
│       └── token.service.js   # Gestión de JWT
```

## 🚀 Funcionalidades Implementadas

1. **Autenticación Base (ARC 0.5)**
   - Login con email/password
   - Generación de token temporal
   - Validación de credenciales contra PostgreSQL

2. **Step-up Authentication (ARC 1.0)**
   - Verificación biométrica
   - Actualización de nivel de garantía
   - Token final con claims extendidos

3. **Gestión de Sesiones**
   - Manejo de estados pending/completed
   - TTL configurable para tokens
   - Invalidación de sesiones

## 🔜 Funcionalidades por Implementar

1. **Validación Adaptativa (ARC 2.0)**
   - Integración con motor de riesgo
   - Políticas dinámicas basadas en contexto
   - Factores adicionales configurables

2. **Mejoras de Seguridad**
   - Rate limiting por IP/usuario
   - Auditoría detallada de eventos
   - Rotación automática de claves

## 🔑 Conceptos Básicos

### Niveles ARC (Adaptive Risk Control)
- **ARC 0.5**: Autenticación básica (usuario/contraseña)
- **ARC 1.0**: Verificación biométrica adicional
- **ARC 2.0**: Validación adaptativa basada en riesgo

### Flujo de Autenticación
1. Usuario inicia login → obtiene token temporal (ARC 0.5)
2. Step-up con biometría → obtiene token final (ARC 1.0/2.0)
3. Token final incluye claims de autenticación y nivel ARC

## 🛠️ Configuración

### Variables de Entorno
Crea un archivo `.env` en la raíz del proyecto:

```env
# Server
PORT=4000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=your_db_name

# JWT Configuration
JWT_ALGO=RS256
JWT_ISSUER=LocalAzure
TEMP_TOKEN_TTL_SECONDS=120
FINAL_TOKEN_TTL_SECONDS=900

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=30

# Cloud Configuration
CLOUD_JWKS_URL=http://localhost:9000/.well-known/jwks.json
CLOUD_ISSUER=cloud-scorer.local
CLOUD_AUDIENCE=local-azure-emulator
```

### Generación de Claves JWT

1. Generar par de claves RSA:
```bash
# En el directorio src/keys
node generateKeys.js
```

2. Las claves se generan como:
   - `jwt_private.pem`: Clave privada para firmar tokens
   - `jwt_public.pem`: Clave pública para verificación

## 🚀 Inicio Rápido

1. **Instalar dependencias**
```bash
npm install
```

2. **Inicializar base de datos**
```bash
node src/scripts/init_db.js
```

3. **Iniciar el servidor**
```bash
npm start
```

## 📝 Flujo de Ejemplo

1. **Login inicial (ARC 0.5)**
```bash
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"UserPass123!"}'
```

2. **Step-up a ARC 1.0**
```bash
curl -X POST http://localhost:4000/auth/step-up \
  -H "Content-Type: application/json" \
  -d '{"signedAssertion":"..."}'
```

## 🔒 Seguridad

- Las claves privadas (*.pem) nunca deben subirse al repositorio
- Usar variables de entorno para configuración sensible
- Rotar claves JWT periódicamente
- Mantener las dependencias actualizadas

## 📚 Referencias

- [JWT Best Practices](https://auth0.com/blog/a-look-at-the-latest-draft-for-jwt-bcp/)
- [NIST Authentication Guidelines](https://pages.nist.gov/800-63-3/)
- [OAuth 2.0 Step-up Authentication](https://tools.ietf.org/html/draft-ietf-oauth-step-up-authn-challenge)