# Frontend MFA - Auditoria Biométrica

Interfaz Flutter para autenticación multi-factor con captura de firma biométrica digital.

## 🎯 Objetivo

Proporcionar una interfaz de usuario intuitiva que permita:
1. **Autenticación básica** con email/contraseña (ARC 0.5)
2. **Captura de firma biométrica** en tiempo real
3. **Envío de datos de trazo** al backend para validación

## 🏗️ Estructura del Proyecto

```
frontend/
├── lib/
│   ├── main.dart                # Punto de entrada de la aplicación
│   └── login_screen.dart        # Pantalla principal de autenticación MFA
├── pubspec.yaml                 # Dependencias del proyecto
├── android/                     # Configuración Android
├── ios/                         # Configuración iOS
├── web/                         # Configuración Web
├── windows/                     # Configuración Windows
├── macos/                       # Configuración macOS
├── linux/                       # Configuración Linux
└── README.md                    # Este archivo
```

## 📦 Dependencias

```yaml
dependencies:
  flutter:
    sdk: flutter
  http: ^1.2.0                   # Peticiones HTTP al backend
  json_annotation: ^4.8.0        # Anotaciones JSON para serialización
```

## 🚀 Funcionalidades Implementadas

### 1. **Autenticación Base (ARC 0.5)**
- Login con email/contraseña
- Validación contra PostgreSQL backend
- Generación de token temporal (TTL: 120s)
- Transición automática a captura biométrica

### 2. **Captura de Firma Biométrica**
- Canvas interactivo para dibujar firma
- Captura de puntos en tiempo real (x, y, timestamp)
- Visualización instantánea del trazo (sin retraso)
- Botones: Limpiar, Volver, Enviar Firma

### 3. **Envío de Datos de Trazo**
- JSON estructurado con datos de firma
- Timestamp de envío
- Array de puntos del trazo (x, y, t)
- Duración total del trazo

## 📱 Interfaz de Usuario

### Paso 1: Login (ARC 0.5)
```
┌─────────────────────────────┐
│ MFA - Autenticación         │
│                             │
│ Iniciar Sesión              │
│                             │
│ [📧 Email input]            │
│ [🔐 Contraseña input]       │
│                             │
│ [Iniciar Sesión]            │
└─────────────────────────────┘
```

### Paso 2: Firma Biométrica
```
┌─────────────────────────────┐
│ MFA - Autenticación    ARC 0.5
│                             │
│ Firma Biométrica            │
│                             │
│ ┌──────────────────────────┐│
│ │      [Canvas Area]       ││
│ │    (Dibuja tu firma)     ││
│ │                          ││
│ └──────────────────────────┘│
│                             │
│ [Limpiar] [Volver] [Enviar] │
└─────────────────────────────┘
```

### Paso 3: Completado
```
┌─────────────────────────────┐
│ MFA - Autenticación         │
│                             │
│ ✅ Autenticación Exitosa    │
│                             │
│ Token ARC: 0.5              │
│                             │
│ [Nueva Autenticación]       │
└─────────────────────────────┘
```

## 🔄 Flujo de Autenticación

```
┌──────────────────────────────────────────────────────┐
│                  FLUJO MFA COMPLETO                   │
├──────────────────────────────────────────────────────┤
│                                                       │
│ 1. Usuario ingresa email + contraseña                │
│    ↓                                                  │
│    POST /auth/login                                  │
│    ↓                                                  │
│    ✅ Recibe: access_token, arc: "0.5"              │
│    ↓                                                  │
│ 2. Usuario dibuja firma en canvas                    │
│    ↓                                                  │
│    Captura: [x, y, t] puntos en tiempo real         │
│    ↓                                                  │
│ 3. Envío de datos de trazo                          │
│    ↓                                                  │
│    POST /auth/step-up                               │
│    Body: {                                           │
│      "timestamp": "2025-10-23T...",                 │
│      "stroke_points": [                             │
│        {"x": 100, "y": 200, "t": 0},               │
│        {"x": 110, "y": 210, "t": 50},              │
│        ...                                           │
│      ],                                              │
│      "stroke_duration_ms": 1234                     │
│    }                                                 │
│    ↓                                                  │
│    ⏸️ Espera validación del backend                 │
│                                                       │
└──────────────────────────────────────────────────────┘
```

## 🎨 Componentes Principales

### `StrokePoint`
Clase que representa un punto del trazo biométrico.
```dart
class StrokePoint {
  final double x;      // Coordenada X en píxeles
  final double y;      // Coordenada Y en píxeles
  final int t;         // Tiempo relativo en milisegundos desde inicio del trazo
  
  Map<String, dynamic> toJson() {
    return {'x': x, 'y': y, 't': t};
  }
}
```

### `StrokePainter`
CustomPainter que dibuja el trazo en tiempo real.
```dart
class StrokePainter extends CustomPainter {
  final List<StrokePoint> points;
  
  void paint(Canvas canvas, Size size) {
    // Dibuja líneas conectando todos los puntos
    // Actualización inmediata (shouldRepaint siempre retorna true)
  }
}
```

### `LoginResponse`
Modelo para parsear respuesta del backend.
```dart
class LoginResponse {
  final String accessToken;
  final String arc;           // "0.5"
  final String userId;
  final int expiresIn;       // TTL en segundos
}
```

### `_LoginScreenState`
State principal que maneja:
- Campos de login (email, contraseña)
- Captura de trazo (_strokePoints, _strokeStartTime)
- Tokens (_tempToken)
- Estado de autenticación (_authStep: 1/2/3)

## 📤 Datos Enviados al Backend

### POST /auth/login
**Request:**
```json
{
  "email": "test@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGc...",
  "token_type": "Bearer",
  "arc": "0.5",
  "userId": "39271eab-cc7e-4b93-92fe-28d9fddd2ba7",
  "expires_in": 120
}
```

### POST /auth/step-up
**Request:** (con Authorization header)
```json
{
  "timestamp": "2025-10-23T16:45:32.123Z",
  "stroke_points": [
    {"x": 450, "y": 350, "t": 0},
    {"x": 460, "y": 355, "t": 10},
    {"x": 470, "y": 360, "t": 20},
    {"x": 480, "y": 365, "t": 30}
  ],
  "stroke_duration_ms": 2500
}
```

## 🔧 Configuración

### URL del Backend
Definida en `login_screen.dart`:
```dart
static const String backendUrl = 'http://localhost:4000';
```

**Para cambiar a producción:**
```dart
static const String backendUrl = 'https://api.production.com';
```

## 🎯 Estados de Autenticación

| _authStep | Descripción | Pantalla |
|-----------|-------------|---------|
| 1 | Login form | Formulario email/contraseña |
| 2 | Canvas signature | Área de firma biométrica |
| 3 | Success | Mensaje de éxito |

## 🖌️ Personalización de Estilos

### Colores principales (Teal)
```dart
const Color(0xFF0D9488)  // Teal principal
const Color(0xFF1F2937)  // Gris oscuro (trazo)
const Color(0xFFE5E7EB)  // Gris claro (bordes)
```

### Dimensiones del Canvas
```dart
height: 240,  // Alto del área de firma
```

### Grosor del trazo
```dart
strokeWidth: 2.5
```

## 📊 Características de Captura

- **Resolución**: Captura cada movimiento del mouse/dedo
- **Precisión**: Coordenadas en píxeles (0-1920, 0-1080 según pantalla)
- **Timing**: Milisegundos desde inicio del trazo
- **Validación**: Solo captura dentro del área del canvas (0-240px altura)

## 🧪 Prueba Local

```bash
# Ejecutar en web
flutter run -d web --web-port=8080

# Ejecutar en Android
flutter run -d android

# Ejecutar en iOS
flutter run -d ios
```

## 📱 Plataformas Soportadas

✅ Web (Chrome, Firefox, Safari, Edge)
✅ Android
✅ iOS
✅ Windows
✅ macOS
✅ Linux

## 🔐 Seguridad

- ✅ Contraseñas nunca se almacenan localmente
- ✅ Token guardado en memoria volátil (no persistente)
- ✅ HTTPS recomendado para producción
- ✅ CORS habilitado para desarrollo local

## 🚀 Próximas Mejoras

- [ ] Persistencia de token con SharedPreferences
- [ ] Refresh token logic
- [ ] Modo offline
- [ ] Biometric fingerprint validation
- [ ] Animaciones mejoradas
- [ ] Soporte para múltiples idiomas

## 📚 Referencias

- [Flutter Documentation](https://flutter.dev/docs)
- [HTTP Package](https://pub.dev/packages/http)
- [Canvas Drawing](https://api.flutter.dev/flutter/dart-ui/Canvas-class.html)
- [GestureDetector](https://api.flutter.dev/flutter/widgets/GestureDetector-class.html)

## 👨‍💻 Desarrollador

Proyecto de autenticación multi-factor con firma biométrica digital.

**Estado:** En desarrollo - Frontend completado para envío de datos de trazo