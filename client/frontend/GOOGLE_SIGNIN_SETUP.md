# 📱 Configuración Google Sign-In para Flutter

## 1️⃣ Instalación de Dependencias

### En `pubspec.yaml`

```yaml
dependencies:
  flutter:
    sdk: flutter
  google_sign_in: ^6.2.0
  http: ^1.2.0
  http_parser: ^4.0.2
  flutter_dotenv: ^5.1.0

dev_dependencies:
  flutter_test:
    sdk: flutter
```

### Instalar dependencias
```bash
flutter pub get
```

---

## 2️⃣ Configuración en Código

### Crear `.env` en raíz del proyecto Flutter

```env
GOOGLE_CLIENT_ID=246681881290-tpsk8rdg9rlt9t69j7o6dnfjf6cq21uq.apps.googleusercontent.com
BACKEND_URL=http://localhost:4000
```

### En `lib/main.dart` - Cargar variables de entorno

```dart
import 'package:flutter_dotenv/flutter_dotenv.dart';

void main() async {
  await dotenv.load(fileName: ".env");
  runApp(const MyApp());
}
```

---

## 3️⃣ Implementar Google Sign-In en Flutter

### Crear `lib/services/google_signin_service.dart`

```dart
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter/material.dart';

class GoogleSignInService {
  static final GoogleSignInService _instance = GoogleSignInService._internal();
  
  late GoogleSignIn _googleSignIn;
  late String _clientId;
  late String _backendUrl;

  factory GoogleSignInService() {
    return _instance;
  }

  GoogleSignInService._internal();

  /// Inicializar servicio
  Future<void> init() async {
    _clientId = dotenv.env['GOOGLE_CLIENT_ID'] ?? 
      '246681881290-tpsk8rdg9rlt9t69j7o6dnfjf6cq21uq.apps.googleusercontent.com';
    _backendUrl = dotenv.env['BACKEND_URL'] ?? 'http://localhost:4000';

    _googleSignIn = GoogleSignIn(
      clientId: _clientId,
      scopes: [
        'email',
        'profile',
      ],
    );

    print('[Google Sign-In] Inicializado con CLIENT_ID: $_clientId');
  }

  /// Realizar login con Google
  Future<Map<String, dynamic>> signIn() async {
    try {
      print('[Google Sign-In] Iniciando flujo de login...');

      // Paso 1: Abrir diálogo de Google Sign-In
      final googleUser = await _googleSignIn.signIn();
      
      if (googleUser == null) {
        print('[Google Sign-In] Usuario canceló el login');
        throw Exception('Usuario canceló el login');
      }

      print('[Google Sign-In] Usuario autenticado: ${googleUser.email}');

      // Paso 2: Obtener id_token
      final googleAuth = await googleUser.authentication;
      final idToken = googleAuth.idToken;

      if (idToken == null) {
        throw Exception('No se pudo obtener id_token de Google');
      }

      print('[Google Sign-In] id_token obtenido (${idToken.length} caracteres)');

      // Paso 3: Enviar id_token a Backend Node.js
      print('[Google Sign-In] Enviando a Backend Node.js...');
      
      final response = await http.post(
        Uri.parse('$_backendUrl/auth/google/verify'),
        headers: {
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'id_token': idToken,
        }),
      );

      print('[Google Sign-In] Respuesta del Backend: ${response.statusCode}');

      if (response.statusCode != 200) {
        final errorBody = jsonDecode(response.body);
        throw Exception(
          errorBody['error'] ?? 'Backend error: ${response.statusCode}'
        );
      }

      final result = jsonDecode(response.body);

      print('[Google Sign-In] ✓ ARC ${result['arc']} token recibido');

      return {
        'success': true,
        'access_token': result['access_token'],
        'arc': result['arc'],
        'amr': result['amr'],
        'user': result['user'],
        'arcSessionId': result['arcSessionId'],
        'expires_in': result['expires_in'],
      };

    } catch (e) {
      print('[Google Sign-In] ✗ Error: $e');
      rethrow;
    }
  }

  /// Cerrar sesión
  Future<void> signOut() async {
    await _googleSignIn.signOut();
    print('[Google Sign-In] Sesión cerrada');
  }

  /// Obtener usuario actual
  GoogleSignInAccount? get currentUser => _googleSignIn.currentUser;

  /// Verificar si está autenticado
  Future<bool> isSignedIn() async {
    return await _googleSignIn.isSignedIn();
  }
}
```

---

## 4️⃣ Usar en Login Screen

### Modificar `lib/login_screen.dart`

```dart
import 'package:flutter/material.dart';
import 'services/google_signin_service.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  late GoogleSignInService _googleSignInService;
  bool _isLoading = false;
  String _statusMessage = '';

  @override
  void initState() {
    super.initState();
    _initializeGoogleSignIn();
  }

  Future<void> _initializeGoogleSignIn() async {
    _googleSignInService = GoogleSignInService();
    await _googleSignInService.init();
  }

  /// Botón: "Login con Google"
  Future<void> _handleGoogleLogin() async {
    setState(() {
      _isLoading = true;
      _statusMessage = 'Iniciando sesión con Google...';
    });

    try {
      final result = await _googleSignInService.signIn();

      if (!mounted) return;

      if (result['success']) {
        final arcToken = result['access_token'];
        final arc = result['arc'];
        final user = result['user'];

        print('✓ Login exitoso - ARC $arc');
        print('✓ Usuario: ${user['email']}');

        // Guardar token y navegar a siguiente pantalla
        // (enrolamiento o dashboard)
        
        setState(() {
          _statusMessage = 'Login exitoso (ARC $arc)';
          _isLoading = false;
        });

        // Navegar a enrollment o home
        // Navigator.of(context).pushNamed('/enroll', arguments: arcToken);
      }
    } catch (e) {
      print('✗ Error en Google login: $e');
      
      if (!mounted) return;

      setState(() {
        _statusMessage = 'Error: $e';
        _isLoading = false;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Error en login: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Login'),
        backgroundColor: const Color(0xFF1F2937),
        foregroundColor: Colors.white,
      ),
      body: Center(
        child: _isLoading
            ? Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const CircularProgressIndicator(),
                  const SizedBox(height: 20),
                  Text(_statusMessage),
                ],
              )
            : Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  ElevatedButton.icon(
                    onPressed: _handleGoogleLogin,
                    icon: Image.asset('assets/google_icon.png', width: 24),
                    label: const Text('Login con Google'),
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 24,
                        vertical: 12,
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  if (_statusMessage.isNotEmpty)
                    Text(
                      _statusMessage,
                      style: const TextStyle(fontSize: 14),
                      textAlign: TextAlign.center,
                    ),
                ],
              ),
      ),
    );
  }
}
```

---

## 5️⃣ Configuración en Android (`android/app/build.gradle`)

```gradle
android {
    compileSdkVersion 34
    
    defaultConfig {
        minSdkVersion 21
        targetSdkVersion 34
    }
}

dependencies {
    implementation 'com.google.android.gms:play-services-auth:21.1.1'
}
```

---

## 6️⃣ Configuración en iOS (`ios/Runner/Info.plist`)

```xml
<dict>
    ...
    <key>GIDClientID</key>
    <string>246681881290-tpsk8rdg9rlt9t69j7o6dnfjf6cq21uq.apps.googleusercontent.com</string>
    
    <key>CFBundleURLTypes</key>
    <array>
        <dict>
            <key>CFBundleTypeRole</key>
            <string>Editor</string>
            <key>CFBundleURLSchemes</key>
            <array>
                <string>com.googleusercontent.apps.246681881290-tpsk8rdg9rlt9t69j7o6dnfjf6cq21uq</string>
            </array>
        </dict>
    </array>
</dict>
```

---

## 🌐 Puertos Únicos (Web/Mobile)

```
Flutter (Web o Mobile)
    ↓ (usa Google OAuth con CLIENT_ID)
Backend Node.js :4000
    ↓
ApiContainer (SDK) :8000
    ↓
Cloud Service :4003
```

---

## ✅ Flujo de Login Completo

```
1. Usuario toca "Login con Google"
   ↓
2. Google OAuth dialog aparece
   ↓
3. Usuario inicia sesión en Google (usa Explorer, no Chrome)
   ↓
4. Flutter recibe id_token de Google
   ↓
5. Flutter envía id_token a Backend Node.js (:4000)
   POST /auth/google/verify
   ↓
6. Backend Node.js delega a ApiContainer (:8000)
   POST /api/auth/google/verify
   ↓
7. ApiContainer delega a Cloud Service (:4003)
   POST /auth/google/verify-arc-05
   ↓
8. Cloud Service:
   - Verifica id_token con Google (tiene CLIENT_SECRET)
   - Busca usuario en MongoDB (users o tenant_invites)
   - Genera ARC 0.5 token
   ↓
9. Retorna ARC 0.5 a Flutter
   ↓
10. Flutter almacena token y muestra siguiente pantalla
    (Enrolamiento de firma o Dashboard)
```

---

## 🔧 Pruebas

### En Web (Explorer)
```bash
flutter run -d web
```

### En Emulador Android
```bash
flutter run -d emulator-5554
```

### En Device iOS
```bash
flutter run -d <device_id>
```

---

## 📝 Notas

- ✅ El CLIENT_ID es público, puede estar en Flutter
- ✅ El CLIENT_SECRET está solo en Cloud Service (nube)
- ✅ Los puertos son: 4000 (client), 8000 (SDK), 4003 (cloud)
- ✅ Explorer soporta Google OAuth igual que Chrome
- ✅ El mismo puerto funciona para Web y Mobile
