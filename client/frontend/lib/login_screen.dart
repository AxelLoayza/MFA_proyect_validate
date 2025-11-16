import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

/// Clase para representar un punto del trazo biométrico
/// Captura coordenadas x, y, tiempo relativo en milisegundos y presión
class StrokePoint {
  final double x;
  final double y;
  final int t; // Tiempo relativo en milisegundos desde el inicio del trazo
  final double p; // Presión normalizada (0.0 a 1.0)

  StrokePoint({
    required this.x,
    required this.y,
    required this.t,
    required this.p,
  });

  /// Convierte el punto a JSON para envío al microservicio
  Map<String, dynamic> toJson() {
    return {
      'x': x,
      'y': y,
      't': t,
      'p': p,
    };
  }
}

/// Modelo para representar la respuesta del servidor en login
class LoginResponse {
  final String accessToken;
  final String tokenType;
  final String arc;
  final String userId;
  final int expiresIn;
  final String? loginId; // Para futuro uso en step-up
  final String? nonce;

  LoginResponse({
    required this.accessToken,
    required this.tokenType,
    required this.arc,
    required this.userId,
    required this.expiresIn,
    this.loginId,
    this.nonce,
  });

  factory LoginResponse.fromJson(Map<String, dynamic> json) {
    return LoginResponse(
      accessToken: json['access_token'] ?? '',
      tokenType: json['token_type'] ?? 'Bearer',
      arc: json['arc'] ?? '0.5',
      userId: json['userId'] ?? '',
      expiresIn: json['expires_in'] ?? 120,
      loginId: json['login_id'],
      nonce: json['nonce'],
    );
  }
}

/// Clase para pintar el trazo biométrico en el canvas
class StrokePainter extends CustomPainter {
  final List<StrokePoint> points;

  StrokePainter(this.points);

  @override
  void paint(Canvas canvas, Size size) {
    if (points.isEmpty) return;

    final paint = Paint()
      ..color = const Color(0xFF1F2937) // Color gris oscuro
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..isAntiAlias = true;

    // Conectar puntos con líneas individuales
    for (int i = 1; i < points.length; i++) {
      canvas.drawLine(
        Offset(points[i - 1].x, points[i - 1].y),
        Offset(points[i].x, points[i].y),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(StrokePainter oldDelegate) {
    // SIEMPRE repintar para que sea en tiempo real
    return true;
  }
}

/// Pantalla principal de autenticación biométrica
/// Implementa flujo: Login (email/password) -> Firma Biométrica -> Step-up
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  // Controladores de formulario
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();

  // URL base del backend (ajustar según tu configuración)
  static const String backendUrl = 'http://localhost:4000';

  // Variables para captura biométrica
  List<StrokePoint> _strokePoints = [];
  bool _isDrawing = false;
  DateTime? _strokeStartTime;

  // Variables de estado de la autenticación
  String? _tempToken; // Token temporal ARC 0.5
  String? _loginId; // login_id para vincular con step-up
  String _currentArc = ''; // Estado actual del ARC

  // Variables de estado de la UI
  bool _isLoading = false;
  bool _isPasswordVisible = false;
  String _statusMessage = '';
  int _authStep = 1; // 1: Login, 2: Firma, 3: Completado

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  /// Realiza login con email/password contra el backend Node.js
  /// Retorna token temporal ARC 0.5
  Future<void> _performLogin() async {
    if (_emailController.text.isEmpty || _passwordController.text.isEmpty) {
      _showMessage('Por favor completa email y contraseña');
      return;
    }

    try {
      setState(() {
        _isLoading = true;
        _statusMessage = 'Autenticando...';
      });

      final response = await http.post(
        Uri.parse('$backendUrl/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'email': _emailController.text,
          'password': _passwordController.text,
        }),
      );

      if (response.statusCode == 200) {
        final loginResp = LoginResponse.fromJson(jsonDecode(response.body));
        
        setState(() {
          _tempToken = loginResp.accessToken;
          _loginId = loginResp.loginId; // Guardar login_id para step-up
          _currentArc = loginResp.arc;
          _authStep = 2;
          _statusMessage = 'Login exitoso (ARC ${loginResp.arc}). Dibuja tu firma.';
          _strokePoints.clear();
        });

        _showMessage('✓ Login exitoso. Ahora captura tu firma biométrica.');
      } else {
        final error = jsonDecode(response.body);
        setState(() {
          _statusMessage = 'Error: ${error['error'] ?? 'Login fallido'}';
        });
        _showMessage('Credenciales inválidas');
      }
    } catch (e) {
      setState(() {
        _statusMessage = 'Error de conexión: $e';
      });
      _showMessage('Error conectando con el servidor');
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  /// Realiza step-up enviando stroke_points a Node.js
  /// Node.js internamente llamará a BMFA para normalización (si está disponible)
  /// Por ahora: ARC 2 simulado (dev-step-up)
  /// Futuro: Node.js recibirá signedAssertion de BMFA → ARC 1.0 (step-up)
  Future<void> _performStepUp() async {
    if (_tempToken == null || _strokePoints.isEmpty || _loginId == null) {
      _showMessage('Primero debes capturar tu firma');
      return;
    }

    try {
      setState(() {
        _isLoading = true;
        _statusMessage = 'Enviando firma biométrica...';
      });

      // Construir payload con stroke_points originales
      // Node.js se encargará de llamar a BMFA si está disponible
      final tracePayload = {
        'login_id': _loginId,
        'timestamp': DateTime.now().toIso8601String(),
        'stroke_points': _strokePoints.map((p) => p.toJson()).toList(),
        'stroke_duration_ms': _strokeStartTime != null 
            ? DateTime.now().difference(_strokeStartTime!).inMilliseconds 
            : 0,
      };

      // Enviar a Node.js /auth/dev-step-up
      // Node.js internamente puede llamar a BMFA para normalización
      final response = await http.post(
        Uri.parse('$backendUrl/auth/dev-step-up'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_tempToken',
        },
        body: jsonEncode(tracePayload),
      );

      if (response.statusCode == 200) {
        final finalResp = jsonDecode(response.body);
        
        setState(() {
          _currentArc = finalResp['arc'] ?? '1.0';
          _authStep = 3;
          _statusMessage = '✓ Trazo enviado exitosamente (ARC ${finalResp['arc']})';
        });

        _showMessage('¡Trazo enviado correctamente!');
      } else {
        final error = jsonDecode(response.body);
        setState(() {
          _statusMessage = 'Error en step-up: ${error['error'] ?? 'Error del servidor'}';
        });
        _showMessage('Error enviando el trazo. Intenta de nuevo.');
      }
    } catch (e) {
      setState(() {
        _statusMessage = 'Error: $e';
      });
      _showMessage('Error procesando trazo: $e');
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  /// Reinicia el flujo de autenticación
  void _resetAuth() {
    setState(() {
      _emailController.clear();
      _passwordController.clear();
      _strokePoints.clear();
      _tempToken = null;
      _loginId = null;
      _currentArc = '';
      _authStep = 1;
      _statusMessage = '';
      _strokeStartTime = null;
    });
  }

  /// Gestiona eventos del trazo biométrico
  /// Captura el inicio del trazo con presión real desde PointerEvent
  void _onPointerDown(PointerDownEvent event) {
    if (_tempToken == null) {
      _showMessage('Primero debes iniciar sesión');
      return;
    }

    setState(() {
      _isDrawing = true;
      _strokeStartTime = DateTime.now();
      _strokePoints.clear();

      final x = event.localPosition.dx;
      final y = event.localPosition.dy;
      // Presión real: rango 0.0 a 1.0+ dependiendo del dispositivo
      final pressure = event.pressure.clamp(0.0, 1.0);

      // Validar que el punto está dentro del área del canvas
      if (x >= 0 && y >= 0 && y <= 240) {
        _strokePoints.add(StrokePoint(
          x: x,
          y: y,
          t: 0,
          p: pressure,
        ));
      }
    });
  }

  /// Captura movimiento del trazo con presión real en cada punto
  void _onPointerMove(PointerMoveEvent event) {
    if (!_isDrawing || _strokeStartTime == null) return;

    final timeDiff = DateTime.now().difference(_strokeStartTime!).inMilliseconds;
    final x = event.localPosition.dx;
    final y = event.localPosition.dy;
    // Presión real del stylus/touch: se mide en cada movimiento
    final pressure = event.pressure.clamp(0.0, 1.0);

    // Validar que el punto está dentro del área del canvas
    if (x >= 0 && y >= 0 && y <= 240) {
      setState(() {
        _strokePoints.add(StrokePoint(
          x: x,
          y: y,
          t: timeDiff,
          p: pressure,
        ));
      });
    }
  }

  /// Captura el final del trazo
  void _onPointerUp(PointerUpEvent event) {
    setState(() {
      _isDrawing = false;
    });
  }

  /// Maneja cancelación de trazo
  void _onPointerCancel(PointerCancelEvent event) {
    setState(() {
      _isDrawing = false;
    });
  }

  void _clearStroke() {
    setState(() {
      _strokePoints.clear();
    });
  }

  /// Muestra un mensaje al usuario
  void _showMessage(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.teal,
        duration: const Duration(seconds: 3),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Header
              Container(
                padding: const EdgeInsets.symmetric(vertical: 16.0),
                decoration: const BoxDecoration(
                  border: Border(
                    bottom: BorderSide(color: Color(0xFFE5E7EB), width: 1),
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'MFA - Autenticación',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF1F2937),
                      ),
                    ),
                    if (_currentArc.isNotEmpty)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: const Color(0xFF0D9488),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          'ARC ${_currentArc}',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                      ),
                  ],
                ),
              ),

              const SizedBox(height: 32),

              // PASO 1: Login con email/password
              if (_authStep == 1) ...[
                const Text(
                  'Iniciar Sesión',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: Colors.black,
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Ingresa tus credenciales para continuar',
                  style: TextStyle(
                    fontSize: 14,
                    color: Color(0xFF6B7280),
                  ),
                ),
                const SizedBox(height: 24),

                // Campo Email
                TextFormField(
                  controller: _emailController,
                  enabled: !_isLoading,
                  decoration: InputDecoration(
                    hintText: 'Email',
                    prefixIcon: const Icon(Icons.email, color: Color(0xFF9CA3AF)),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: const BorderSide(color: Color(0xFFD1D5DB)),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: const BorderSide(color: Color(0xFFD1D5DB)),
                    ),
                    contentPadding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                  ),
                ),
                const SizedBox(height: 16),

                // Campo Contraseña
                TextFormField(
                  controller: _passwordController,
                  enabled: !_isLoading,
                  obscureText: !_isPasswordVisible,
                  decoration: InputDecoration(
                    hintText: 'Contraseña',
                    prefixIcon: const Icon(Icons.lock, color: Color(0xFF9CA3AF)),
                    suffixIcon: IconButton(
                      icon: Icon(
                        _isPasswordVisible ? Icons.visibility : Icons.visibility_off,
                        color: const Color(0xFF9CA3AF),
                      ),
                      onPressed: () {
                        setState(() {
                          _isPasswordVisible = !_isPasswordVisible;
                        });
                      },
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: const BorderSide(color: Color(0xFFD1D5DB)),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: const BorderSide(color: Color(0xFFD1D5DB)),
                    ),
                    contentPadding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                  ),
                ),
                const SizedBox(height: 24),

                // Botón Login
                ElevatedButton(
                  onPressed: _isLoading ? null : _performLogin,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF0D9488),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  child: _isLoading
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                          ),
                        )
                      : const Text(
                          'Iniciar Sesión',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                ),
              ],

              // PASO 2: Captura de firma biométrica
              if (_authStep == 2) ...[
                const Text(
                  'Firma Biométrica',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: Colors.black,
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Dibuja tu firma para completar la autenticación\nEl sistema enviará los datos al servidor para validación',
                  style: TextStyle(
                    fontSize: 14,
                    color: Color(0xFF6B7280),
                  ),
                ),
                const SizedBox(height: 24),

                // Área de firma - Listener captura eventos de puntero con presión
                Listener(
                  onPointerDown: _onPointerDown,
                  onPointerMove: _onPointerMove,
                  onPointerUp: _onPointerUp,
                  onPointerCancel: _onPointerCancel,
                  child: MouseRegion(
                    child: Container(
                      height: 240,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: _strokePoints.isNotEmpty
                              ? const Color(0xFF0D9488)
                              : const Color(0xFFE5E7EB),
                          width: 2,
                        ),
                      ),
                      child: Stack(
                        children: [
                          // Canvas con CustomPaint
                          CustomPaint(
                            painter: StrokePainter(_strokePoints),
                            size: Size.infinite,
                          ),
                          // Placeholder cuando no hay trazo
                          if (_strokePoints.isEmpty)
                            const Center(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(
                                    Icons.edit,
                                    size: 48,
                                    color: Color(0xFFD1D5DB),
                                  ),
                                  SizedBox(height: 12),
                                  Text(
                                    'Dibuja aquí',
                                    style: TextStyle(
                                      color: Color(0xFF9CA3AF),
                                      fontSize: 16,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 20),

                // Botones
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _isLoading ? null : _clearStroke,
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(color: Color(0xFFD1D5DB)),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        child: const Text(
                          'Limpiar',
                          style: TextStyle(
                            color: Color(0xFF374151),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _isLoading ? null : _resetAuth,
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(color: Color(0xFFD1D5DB)),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        child: const Text(
                          'Volver',
                          style: TextStyle(
                            color: Color(0xFF374151),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 2,
                      child: ElevatedButton(
                        onPressed: _isLoading ? null : _performStepUp,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF0D9488),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        child: _isLoading
                            ? const SizedBox(
                                height: 20,
                                width: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                                ),
                              )
                            : const Text(
                                'Enviar Firma',
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                      ),
                    ),
                  ],
                ),
              ],

              // PASO 3: Autenticación completada
              if (_authStep == 3) ...[
                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF0FDF4),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFBBF7D0)),
                  ),
                  child: Column(
                    children: [
                      const Icon(
                        Icons.check_circle,
                        color: Color(0xFF16A34A),
                        size: 64,
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'Autenticación Exitosa',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF166534),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Token ARC: $_currentArc',
                        style: const TextStyle(
                          fontSize: 14,
                          color: Color(0xFF166534),
                        ),
                      ),
                      const SizedBox(height: 24),
                      ElevatedButton(
                        onPressed: _resetAuth,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF0D9488),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(
                            vertical: 12,
                            horizontal: 32,
                          ),
                        ),
                        child: const Text('Nueva Autenticación'),
                      ),
                    ],
                  ),
                ),
              ],

              // Mensaje de estado
              if (_statusMessage.isNotEmpty) ...[
                const SizedBox(height: 24),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: _statusMessage.contains('Error')
                        ? const Color(0xFFFEE2E2)
                        : const Color(0xFFF0FDF4),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: _statusMessage.contains('Error')
                          ? const Color(0xFFFECACA)
                          : const Color(0xFFBBF7D0),
                    ),
                  ),
                  child: Text(
                    _statusMessage,
                    style: TextStyle(
                      color: _statusMessage.contains('Error')
                          ? const Color(0xFF991B1B)
                          : const Color(0xFF166534),
                      fontSize: 14,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
