import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'dart:io';

/// Clase para representar un punto del trazo biométrico
/// Captura coordenadas x, y y tiempo relativo en milisegundos
class StrokePoint {
  final double x;
  final double y;
  final int t; // Tiempo relativo en milisegundos desde el inicio del trazo

  StrokePoint({
    required this.x,
    required this.y,
    required this.t,
  });

  /// Convierte el punto a JSON para envío al microservicio
  Map<String, dynamic> toJson() {
    return {
      'x': x,
      'y': y,
      't': t,
    };
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
      ..strokeWidth = 2.0
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final path = Path();
    path.moveTo(points.first.x, points.first.y);

    for (int i = 1; i < points.length; i++) {
      path.lineTo(points[i].x, points[i].y);
    }

    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(StrokePainter oldDelegate) {
    return oldDelegate.points != points;
  }
}

/// Pantalla principal de autenticación biométrica
/// Implementa OAuth2 con Google y captura de trazo dinámico
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  // Variables para autenticación OAuth2
  final GoogleSignIn _googleSignIn = GoogleSignIn();
  GoogleSignInAccount? _currentUser;
  String? _userId; // ID único del usuario obtenido de OAuth2

  // Variables para captura biométrica
  List<StrokePoint> _strokePoints = [];
  bool _isDrawing = false;
  DateTime? _strokeStartTime;

  // Variables de estado de la UI
  bool _isLoading = false;
  String _statusMessage = '';

  @override
  void initState() {
    super.initState();
    _initializeGoogleSignIn();
  }

  /// Inicializa Google Sign-In
  void _initializeGoogleSignIn() {
    _googleSignIn.onCurrentUserChanged.listen((GoogleSignInAccount? account) {
      setState(() {
        _currentUser = account;
        if (account != null) {
          // Obtener el user_id (identificador único del sujeto) de la respuesta del servicio OAuth2
          // Este ID será usado como el identificador biométrico para buscar el patrón almacenado
          _userId = account.id;
          _statusMessage = 'Autenticado como: ${account.displayName}';
        }
      });
    });
  }

  /// Maneja el inicio de sesión con Google OAuth2
  Future<void> _signInWithGoogle() async {
    try {
      setState(() {
        _isLoading = true;
        _statusMessage = 'Iniciando sesión con Google...';
      });

      final GoogleSignInAccount? account = await _googleSignIn.signIn();
      
      if (account != null) {
        setState(() {
          _statusMessage = 'Autenticación exitosa. Ahora dibuja tu gesto biométrico.';
        });
      } else {
        setState(() {
          _statusMessage = 'Autenticación cancelada.';
        });
      }
    } catch (error) {
      setState(() {
        _statusMessage = 'Error en autenticación: $error';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  /// Maneja el cierre de sesión
  Future<void> _signOut() async {
    await _googleSignIn.signOut();
    setState(() {
      _currentUser = null;
      _userId = null;
      _strokePoints.clear();
      _statusMessage = '';
    });
  }

  /// Inicia la captura del trazo biométrico
  void _onPanStart(DragStartDetails details) {
    if (_currentUser == null) {
      _showMessage('Primero debes autenticarte con Google');
      return;
    }

    setState(() {
      _isDrawing = true;
      _strokeStartTime = DateTime.now();
      _strokePoints.clear();
      
      final RenderBox renderBox = context.findRenderObject() as RenderBox;
      final localPosition = renderBox.globalToLocal(details.globalPosition);
      
      _strokePoints.add(StrokePoint(
        x: localPosition.dx,
        y: localPosition.dy,
        t: 0, // Tiempo inicial
      ));
    });
  }

  /// Actualiza el trazo durante el dibujo
  void _onPanUpdate(DragUpdateDetails details) {
    if (!_isDrawing || _strokeStartTime == null) return;

    final RenderBox renderBox = context.findRenderObject() as RenderBox;
    final localPosition = renderBox.globalToLocal(details.globalPosition);
    final currentTime = DateTime.now();
    final timeDiff = currentTime.difference(_strokeStartTime!).inMilliseconds;

    setState(() {
      _strokePoints.add(StrokePoint(
        x: localPosition.dx,
        y: localPosition.dy,
        t: timeDiff,
      ));
    });
  }

  /// Finaliza la captura del trazo
  void _onPanEnd(DragEndDetails details) {
    setState(() {
      _isDrawing = false;
    });
  }

  /// Limpia el trazo actual
  void _clearStroke() {
    setState(() {
      _strokePoints.clear();
      _isDrawing = false;
    });
  }

  /// Envía los datos biométricos al microservicio
  Future<void> _validateBiometry() async {
    if (_currentUser == null) {
      _showMessage('Primero debes autenticarte con Google');
      return;
    }

    if (_strokePoints.isEmpty) {
      _showMessage('Debes dibujar un gesto biométrico');
      return;
    }

    try {
      setState(() {
        _isLoading = true;
        _statusMessage = 'Validando biometría...';
      });

      // Construir el payload JSON final con el user_id y la stroke_data capturada
      final payload = {
        'user_id': _userId, // ID único obtenido de OAuth2
        'stroke_data': _strokePoints.map((point) => point.toJson()).toList(),
        'timestamp': DateTime.now().toIso8601String(),
      };

      // Realizar solicitud HTTP POST real al microservicio
      // NOTA: Esta es una URL simulada - reemplazar con la URL real del microservicio
      const String microserviceUrl = 'http://localhost:3000/api/auth/validate';
      
      final response = await http.post(
        Uri.parse(microserviceUrl),
        headers: {
          'Content-Type': 'application/json',
        },
        body: jsonEncode(payload),
      );

      if (response.statusCode == 200) {
        final responseData = jsonDecode(response.body);
        setState(() {
          _statusMessage = 'Validación exitosa: ${responseData['message'] ?? 'Acceso autorizado'}';
        });
        _showMessage('¡Autenticación biométrica exitosa!');
      } else {
        setState(() {
          _statusMessage = 'Error en validación: ${response.statusCode}';
        });
        _showMessage('Error en la validación biométrica');
      }
    } catch (e) {
      // Manejo de errores de conexión - simulación para desarrollo
      setState(() {
        _statusMessage = 'Error de conexión (simulado): $e';
      });
      _showMessage('Error de conexión con el microservicio (simulado)');
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  /// Muestra un mensaje al usuario
  void _showMessage(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.teal,
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
                child: const Text(
                  'Google',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w500,
                    color: Color(0xFF1F2937),
                  ),
                ),
              ),

              const SizedBox(height: 32),

              // Título principal
              const Text(
                'Iniciar sesión',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: Colors.black,
                ),
              ),

              const SizedBox(height: 16),

              // Texto de términos
              RichText(
                text: const TextSpan(
                  style: TextStyle(
                    fontSize: 14,
                    color: Color(0xFF374151),
                  ),
                  children: [
                    TextSpan(text: 'Al continuar, aceptas nuestros '),
                    TextSpan(
                      text: 'Acuerdos de Usuario',
                      style: TextStyle(color: Color(0xFF3B82F6)),
                    ),
                    TextSpan(text: ' y reconoces que comprendes la '),
                    TextSpan(
                      text: 'Política de privacidad',
                      style: TextStyle(color: Color(0xFF3B82F6)),
                    ),
                    TextSpan(text: '.'),
                  ],
                ),
              ),

              const SizedBox(height: 24),

              // Botón de Google Sign-In
              if (_currentUser == null)
                Container(
                  decoration: BoxDecoration(
                    border: Border.all(color: const Color(0xFFD1D5DB)),
                    borderRadius: BorderRadius.circular(25),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.05),
                        blurRadius: 4,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Material(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(25),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(25),
                      onTap: _isLoading ? null : _signInWithGoogle,
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            // Icono de Google
                            Container(
                              width: 18,
                              height: 18,
                              decoration: const BoxDecoration(
                                image: DecorationImage(
                                  image: NetworkImage(
                                    'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHZpZXdCb3g9IjAgMCAxOCAxOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTE3LjY0IDkuMjA0NWMwLS42MzgxLS4wNTczLTEuMjUxOC0uMTYzNi0xLjg0MDlIOXYzLjQ4MTRoNC44NDM2Yy0uMjA4NiAxLjEyNS0uODQyNyAyLjA3ODItMS43OTU5IDIuNzE2NHYyLjI1ODFoMi45MDg3YzEuNzAxOC0xLjU2NjggMi42ODM2LTMuODc0IDIuNjgzNi02LjYxNXoiIGZpbGw9IiM0Mjg1RjQiLz4KPHBhdGggZD0iTTkgMThjMi40MyAwIDQuNDY3My0uODA2IDUuOTU2NC0yLjE4MDRsLTIuOTA4Ny0yLjI1ODFjLS44MDU5LjU0LTEuODM2OC44NTktMy4wNDc3Ljg1OS0yLjM0NCAwLTQuMzI4Mi0xLjU4MzEtNS4wMzYtMy43MTA0SC45NTc0djIuMzMxOEMyLjQzODIgMTUuOTgzMiA1LjQ4MTggMTggOSAxOHoiIGZpbGw9IiMzNEE4NTMiLz4KPHBhdGggZD0iTTMuOTY0IDEwLjcxYy0uMTgtLjU0LS4yODIyLTEuMTE2OC0uMjgyMi0xLjcxcy4xMDIzLTEuMTcuMjgyMy0xLjcxVjQuOTU4MkguOTU3M0MuMzQ3NyA2LjE3MzIgMCA3LjU0NzcgMCA5cy4zNDc3IDIuODI2OC45NTczIDQuMDQxOEwzLjk2NCAxMC43MXoiIGZpbGw9IiNGQkJDMDUiLz4KPHBhdGggZD0iTTkgMy41Nzk1YzEuMzIxNCAwIDIuNTA3Ny40NTQxIDMuNDQwNSAxLjM0NmwyLjU4MTMtMi41ODE0QzEzLjQ2MzIuODkxOCAxMS40MjYgMCA5IDAgNS40ODE4IDAgMi40MzgyIDIuMDE2OC45NTc0IDQuOTU4MkwzLjk2NCA3LjI5QzQuNjcxOCA1LjE2MjcgNi42NTU5IDMuNTc5NSA5IDMuNTc5NXoiIGZpbGw9IiNFQTQzMzUiLz4KPC9zdmc+',
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Text(
                              _isLoading ? 'Iniciando sesión...' : 'Continuar con Google',
                              style: const TextStyle(
                                fontSize: 16,
                                color: Color(0xFF1F2937),
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),

              const SizedBox(height: 24),

              // Separador OR
              if (_currentUser == null) ...[
                Row(
                  children: [
                    const Expanded(child: Divider(color: Color(0xFFD1D5DB))),
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 16),
                      child: Text(
                        'O',
                        style: TextStyle(
                          fontSize: 14,
                          color: Color(0xFF6B7280),
                        ),
                      ),
                    ),
                    const Expanded(child: Divider(color: Color(0xFFD1D5DB))),
                  ],
                ),
                const SizedBox(height: 24),
              ],

              // Información del usuario autenticado
              if (_currentUser != null) ...[
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF3F4F6),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFE5E7EB)),
                  ),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          CircleAvatar(
                            radius: 20,
                            backgroundImage: _currentUser!.photoUrl != null
                                ? NetworkImage(_currentUser!.photoUrl!)
                                : null,
                            child: _currentUser!.photoUrl == null
                                ? const Icon(Icons.person, color: Colors.white)
                                : null,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  _currentUser!.displayName ?? 'Usuario',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w600,
                                    fontSize: 16,
                                  ),
                                ),
                                Text(
                                  _currentUser!.email,
                                  style: const TextStyle(
                                    color: Color(0xFF6B7280),
                                    fontSize: 14,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          IconButton(
                            onPressed: _signOut,
                            icon: const Icon(Icons.logout, color: Color(0xFF6B7280)),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
              ],

              // Área de captura biométrica
              if (_currentUser != null) ...[
                const Text(
                  'Gesto Biométrico / Firma de Validación',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF374151),
                  ),
                ),
                const SizedBox(height: 12),

                Container(
                  height: 200,
                  decoration: BoxDecoration(
                    color: const Color(0xFFF9FAFB),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFE5E7EB)),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: GestureDetector(
                      onPanStart: _onPanStart,
                      onPanUpdate: _onPanUpdate,
                      onPanEnd: _onPanEnd,
                      child: CustomPaint(
                        painter: StrokePainter(_strokePoints),
                        child: Container(
                          color: Colors.white,
                          child: _strokePoints.isEmpty
                              ? const Center(
                                  child: Text(
                                    'Dibuja tu gesto biométrico aquí',
                                    style: TextStyle(
                                      color: Color(0xFF9CA3AF),
                                      fontSize: 14,
                                    ),
                                  ),
                                )
                              : null,
                        ),
                      ),
                    ),
                  ),
                ),

                const SizedBox(height: 16),

                // Botones de control
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _clearStroke,
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(color: Color(0xFFD1D5DB)),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        child: const Text(
                          'Limpiar',
                          style: TextStyle(color: Color(0xFF374151)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 2,
                      child: ElevatedButton(
                        onPressed: _isLoading ? null : _validateBiometry,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF0D9488),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(25),
                          ),
                          padding: const EdgeInsets.symmetric(vertical: 12),
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
                                'Validar Biometría',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 24),
              ],

              // Mensaje de estado
              if (_statusMessage.isNotEmpty)
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF0FDF4),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFFBBF7D0)),
                  ),
                  child: Text(
                    _statusMessage,
                    style: const TextStyle(
                      color: Color(0xFF166534),
                      fontSize: 14,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),

              const SizedBox(height: 24),

              // Enlaces adicionales
              if (_currentUser == null) ...[
                const Text(
                  '¿Nuevo aquí? Regístrate',
                  style: TextStyle(
                    fontSize: 14,
                    color: Color(0xFF374151),
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                const Text(
                  '¿Olvidaste tu nombre de usuario o contraseña?',
                  style: TextStyle(
                    fontSize: 14,
                    color: Color(0xFF374151),
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
