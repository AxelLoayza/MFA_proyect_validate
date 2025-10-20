# Prototipo de Auditoría Biométrica - Cliente Flutter

## 📱 Descripción del Proyecto

Este proyecto forma parte de una tesis de ingeniería cuyo objetivo es desarrollar un **Prototipo de Auditoría Biométrica mediante Análisis Adaptativo de Trazos Dinámicos**.

### 🎯 Problema a Resolver
Los métodos de autenticación estáticos (contraseñas, PINs) son vulnerables a ataques como phishing y robo de credenciales.

### 💡 Solución Implementada
Implementar una capa de seguridad biométrica conductual que analice el ritmo y la cadencia del trazo (firma o gesto) del usuario en dispositivos móviles para validar la identidad, incluso si la contraseña es robada.

## 🏗️ Arquitectura del Sistema

El sistema completo se divide en tres partes:

1. **Cliente (Flutter)** - Este proyecto 📱
   - Captura el trazo biométrico del usuario
   - Implementa autenticación OAuth2 con Google
   - Envía datos por JSON al microservicio

2. **Microservicio (FastAPI)** - No implementado en esta fase
   - Recibe los datos del cliente
   - Preprocesa la secuencia para ML

3. **Modelo de Inferencia (LSTM)** - No implementado en esta fase
   - Analiza la serie temporal del trazo
   - Emite una decisión de seguridad

## 🚀 Funcionalidades Implementadas

### ✅ Autenticación OAuth2 con Google
- Integración real con Google Sign-In
- Obtención del `user_id` único e inmutable
- Manejo de sesiones y logout

### ✅ Captura de Trazo Biométrico
- Área de dibujo interactiva con `CustomPaint`
- Captura de coordenadas X, Y y tiempo relativo
- Visualización en tiempo real del trazo
- Función de limpiar trazo

### ✅ Comunicación con Microservicio
- Envío HTTP POST con datos JSON
- Estructura de datos optimizada para ML
- Manejo de errores y respuestas

### ✅ Interfaz de Usuario Moderna
- Diseño basado en el prototipo de Figma
- Esquinas redondeadas y colores modernos
- Responsive y accesible
- Estados de carga y feedback visual

## 📁 Estructura del Proyecto

```
frond_end_tesis/
├── lib/
│   ├── main.dart              # Punto de entrada de la aplicación
│   └── login_screen.dart      # Pantalla principal con toda la funcionalidad
├── pubspec.yaml               # Dependencias del proyecto
└── README.md                  # Este archivo
```

## 🔧 Dependencias

```yaml
dependencies:
  flutter:
    sdk: flutter
  cupertino_icons: ^1.0.8
  google_sign_in: ^6.2.1      # Autenticación OAuth2
  http: ^1.2.0                # Cliente HTTP
  json_annotation: ^4.8.1     # Manejo de JSON
```

## 📊 Estructura de Datos

### StrokePoint
```dart
class StrokePoint {
  final double x;  // Coordenada X
  final double y;  // Coordenada Y  
  final int t;     // Tiempo relativo en milisegundos
}
```

### Payload JSON Enviado al Microservicio
```json
{
  "user_id": "google_user_id_unique",
  "stroke_data": [
    {"x": 100.0, "y": 150.0, "t": 0},
    {"x": 105.0, "y": 155.0, "t": 50},
    {"x": 110.0, "y": 160.0, "t": 100}
  ],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## 🛠️ Configuración y Ejecución

### Prerrequisitos
- Flutter SDK 3.9.0 o superior
- Android Studio / VS Code
- Cuenta de Google para OAuth2

### Pasos de Instalación

1. **Clonar el proyecto**
   ```bash
   cd frond_end_tesis
   ```

2. **Instalar dependencias**
   ```bash
   flutter pub get
   ```

3. **Configurar Google Sign-In**
   - Crear proyecto en [Google Cloud Console](https://console.cloud.google.com/)
   - Habilitar Google Sign-In API
   - Configurar OAuth2 credentials
   - Actualizar `android/app/google-services.json`

4. **Ejecutar la aplicación**
   ```bash
   flutter run
   ```

## 🔐 Flujo de Autenticación

1. **Inicio de Sesión con Google**
   - Usuario presiona "Continuar con Google"
   - Se obtiene el `user_id` único de OAuth2
   - Este ID se usa como identificador biométrico

2. **Captura Biométrica**
   - Usuario dibuja su gesto/firma en el área designada
   - Se capturan coordenadas y tiempos relativos
   - Visualización en tiempo real

3. **Validación**
   - Datos se envían al microservicio
   - Microservicio compara con patrón almacenado
   - Respuesta de autorización/denegación

## 🌐 Endpoint del Microservicio

```
POST http://<IP_del_Microservicio>:<Puerto>/api/auth/validate
Content-Type: application/json

{
  "user_id": "string",
  "stroke_data": [StrokePoint],
  "timestamp": "ISO8601"
}
```

## 🎨 Diseño Visual

- **Colores principales**: Teal (#0D9488), Grises modernos
- **Tipografía**: Roboto, pesos 400-600
- **Componentes**: Esquinas redondeadas, sombras sutiles
- **Responsive**: Adaptable a diferentes tamaños de pantalla

## 🔍 Características Técnicas

### Captura de Trazo
- `GestureDetector` para eventos táctiles
- `CustomPaint` para renderizado
- Algoritmo de suavizado de trazos
- Normalización de coordenadas

### Manejo de Estado
- `StatefulWidget` para gestión de estado
- Variables reactivas para UI
- Manejo de estados de carga
- Persistencia de sesión

### Comunicación HTTP
- Cliente HTTP asíncrono
- Manejo de errores robusto
- Timeouts configurables
- Serialización JSON automática

## 🚧 Limitaciones Actuales

- **Microservicio**: No implementado (simulado)
- **Modelo ML**: No implementado
- **Persistencia**: Solo en memoria
- **Validación**: Básica de entrada

## 🔮 Próximos Pasos

1. Implementar microservicio FastAPI
2. Desarrollar modelo LSTM
3. Añadir persistencia de datos
4. Implementar validación avanzada
5. Añadir métricas de seguridad

## 📝 Notas de Desarrollo

- El código está documentado en español para facilitar la comprensión
- Se incluyen comentarios explicativos en funciones críticas
- La estructura es modular y extensible
- Compatible con Flutter 3.9.0+

## 👨‍💻 Autor

Proyecto desarrollado como parte de una tesis de ingeniería en sistemas.

---

**Versión**: 1.0.0  
**Última actualización**: Enero 2024  
**Flutter**: 3.9.0+
