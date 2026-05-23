import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;

import 'enrollment_screen.dart';

class StrokePoint {
  final double x;
  final double y;
  final int t;
  final double p;

  StrokePoint({
    required this.x,
    required this.y,
    required this.t,
    required this.p,
  });

  Map<String, dynamic> toJson() {
    return {
      'x': x,
      'y': y,
      't': t,
      'p': p,
    };
  }
}

class StrokePainter extends CustomPainter {
  final List<StrokePoint> points;

  StrokePainter(this.points);

  @override
  void paint(Canvas canvas, Size size) {
    if (points.isEmpty) return;

    final paint = Paint()
      ..color = const Color(0xFF1F2937)
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..isAntiAlias = true;

    for (int i = 1; i < points.length; i++) {
      canvas.drawLine(
        Offset(points[i - 1].x, points[i - 1].y),
        Offset(points[i].x, points[i].y),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(StrokePainter oldDelegate) => true;
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final String _backendUrl = dotenv.env['BACKEND_URL'] ?? 'http://localhost:4000';
  final String _googleClientId =
      dotenv.env['GOOGLE_CLIENT_ID'] ?? '246681881290-tpsk8rdg9rlt9t69j7o6dnfjf6cq21uq.apps.googleusercontent.com';

  GoogleSignIn? _googleSignIn;
  String? _accessToken;
  String? _arc;
  String? _email;
  String? _name;
  bool _isLoading = false;
  String _statusMessage = 'Inicia sesión con Google para obtener ARC 0.5.';

  @override
  void dispose() {
    _googleSignIn?.disconnect();
    super.dispose();
  }

  GoogleSignIn _buildGoogleSignIn() {
    if (kIsWeb) {
      return GoogleSignIn(
        clientId: _googleClientId,
        scopes: const ['email', 'profile', 'openid'],
      );
    }

    return GoogleSignIn(
      scopes: const ['email', 'profile', 'openid'],
    );
  }

  Future<void> _signInWithGoogle() async {
    setState(() {
      _isLoading = true;
      _statusMessage = 'Iniciando sesión con Google (Code Flow)...';
    });

    try {
      _googleSignIn ??= _buildGoogleSignIn();
      
      // Iniciar sesión con Google
      final account = await _googleSignIn!.signIn();

      if (account == null) {
        setState(() {
          _statusMessage = 'Inicio de sesión cancelado';
          _isLoading = false;
        });
        return;
      }

      // Obtener información de autenticación
      final auth = await account.authentication;
      
      // Intentar obtener authorization_code (mobile) o idToken/accessToken (web/fallback)
      String? authCode = auth.serverAuthCode; // Mobile (authorization code)
      final idToken = auth.idToken; // id_token (may be null on web)
      final accessToken = auth.accessToken; // access_token returned by some web flows
      
      // En web, google_sign_in 6.2.1 no tiene serverAuthCode en authentication
      // Usamos idToken como fallback que funciona en todas las plataformas
      // Prefer serverAuthCode (mobile). Otherwise prefer id_token, otherwise use access_token as fallback.
      if (authCode == null || authCode.isEmpty) {
        if (idToken != null && idToken.isNotEmpty) {
          authCode = idToken; // send as id_token
        } else if (accessToken != null && accessToken.isNotEmpty) {
          authCode = accessToken; // send as access_token
        }
      }

      if (authCode == null || authCode.isEmpty) {
        throw Exception('No se obtuvo authorization_code, id_token ni access_token de Google. Asegúrate de incluir el scope "openid" y permitir el retorno de tokens.');
      }

      setState(() {
        _statusMessage = 'Intercambiando código con el servidor...';
      });

      // Determinar qué endpoint usar basado en si tenemos code o id_token
      // Determinar qué endpoint y payload usar
      String endpoint;
      Map<String, dynamic> requestBody;

      if (auth.serverAuthCode != null && auth.serverAuthCode!.isNotEmpty) {
        endpoint = '/api/auth/google_exchange';
        requestBody = {'code': authCode};
      } else {
        endpoint = '/api/auth/google/verify';
        // Si tenemos idToken lo mandamos como id_token, si no mandamos access_token
        if (idToken != null && idToken.isNotEmpty) {
          requestBody = {'id_token': authCode};
        } else {
          requestBody = {'access_token': authCode};
        }
      }

      final response = await http.post(
        Uri.parse('$_backendUrl$endpoint'),
        headers: const {'Content-Type': 'application/json'},
        body: jsonEncode(requestBody),
      );

      if (response.statusCode != 200) {
        Map<String, dynamic> errorBody = const {};
        try {
          errorBody = jsonDecode(response.body) as Map<String, dynamic>;
        } catch (_) {
          errorBody = {'error': 'http_${response.statusCode}', 'message': response.body};
        }

        final detail = (errorBody['details'] as Map?)?.cast<String, dynamic>() ??
            (errorBody['detail'] as Map?)?.cast<String, dynamic>() ??
            const <String, dynamic>{};

        final errorCode =
            errorBody['error']?.toString() ??
            detail['error']?.toString() ??
            'intercambio_fallido';
        final errorMessage =
            errorBody['message']?.toString() ??
            detail['message']?.toString() ??
            'Intercambio fallido';

        if (response.statusCode == 404 && errorCode == 'needs_registration') {
          setState(() {
            _statusMessage = 'Tu cuenta requiere registro inicial con codigo de invitacion.';
            _isLoading = false;
          });
          await _showRegistrationRequiredDialog(errorMessage);
          return;
        }

        throw Exception('$errorCode: $errorMessage');
      }

      final responseJson = jsonDecode(response.body) as Map<String, dynamic>;
      final user = (responseJson['user'] as Map?)?.cast<String, dynamic>() ?? const {};

      setState(() {
        _accessToken = responseJson['access_token']?.toString();
        _arc = responseJson['arc']?.toString();
        _email = user['email']?.toString() ?? account.email;
        _name = user['name']?.toString() ?? account.displayName;
        _statusMessage = 'Sesión iniciada correctamente con ARC ${_arc ?? '0.5'}.';
        _isLoading = false;
      });

      if (!mounted) return;
      _showMessage('✓ Google Sign-In correcto. ARC ${_arc ?? '0.5'} obtenido.');
    } catch (e) {
      setState(() {
        _statusMessage = 'Error: $e';
        _isLoading = false;
      });
      _showMessage('Error en inicio de sesión: ${e.toString()}');
      
      if (kDebugMode) {
        debugPrint('[LoginScreen] Error: $e');
      }
    }
  }

  Future<void> _continueToEnrollment() async {
    if (_accessToken == null) return;

    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => EnrollmentScreen(jwtToken: _accessToken!),
      ),
    );
  }

  Future<void> _resetSession() async {
    await _googleSignIn?.signOut();
    setState(() {
      _accessToken = null;
      _arc = null;
      _email = null;
      _name = null;
      _statusMessage = 'Inicia sesión con Google para obtener ARC 0.5.';
    });
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.teal,
        duration: const Duration(seconds: 3),
      ),
    );
  }

  Future<void> _showRegistrationRequiredDialog(String message) async {
    if (!mounted) return;

    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Registro requerido'),
        content: Text(
          '$message\n\nSolicita a tu administrador un codigo de invitacion activo para completar el registro inicial.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Entendido'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: Container(
                padding: const EdgeInsets.all(28),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(28),
                  border: Border.all(color: const Color(0xFFE5E7EB)),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x14000000),
                      blurRadius: 30,
                      offset: Offset(0, 18),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(18),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [Color(0xFF0F766E), Color(0xFF14B8A6)],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        borderRadius: BorderRadius.circular(22),
                      ),
                      child: const Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.verified_user_rounded, color: Colors.white, size: 40),
                          SizedBox(height: 16),
                          Text(
                            'ARC Secure Access',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 28,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          SizedBox(height: 8),
                          Text(
                            'Accede con Google y recibe tu token ARC 0.5 para continuar con el enrolamiento biométrico.',
                            style: TextStyle(
                              color: Colors.white70,
                              fontSize: 14,
                              height: 1.4,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),
                    Text(
                      _email == null ? 'Iniciar sesión' : 'Sesión activa',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF111827),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _email == null
                          ? 'Usa tu cuenta Google. El backend enviará el id_token al SDK y luego a Cloud Service.'
                          : '${_name ?? ''}${_email != null ? ' • $_email' : ''}',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 14,
                        color: Color(0xFF6B7280),
                        height: 1.5,
                      ),
                    ),
                    const SizedBox(height: 24),
                    ElevatedButton.icon(
                      onPressed: _isLoading ? null : _signInWithGoogle,
                      icon: _isLoading
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Icon(Icons.login_rounded),
                      label: Text(_email == null ? 'Iniciar con Google' : 'Reiniciar inicio de sesión'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF111827),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                    ),
                    if (_accessToken != null) ...[
                      const SizedBox(height: 12),
                      OutlinedButton(
                        onPressed: _continueToEnrollment,
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          side: const BorderSide(color: Color(0xFF0F766E)),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                        ),
                        child: const Text('Continuar al enrolamiento biométrico'),
                      ),
                      const SizedBox(height: 12),
                      TextButton(
                        onPressed: _resetSession,
                        child: const Text('Cerrar sesión y limpiar estado'),
                      ),
                    ],
                    const SizedBox(height: 20),
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: _statusMessage.toLowerCase().contains('error')
                            ? const Color(0xFFFEE2E2)
                            : const Color(0xFFF0FDF4),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: _statusMessage.toLowerCase().contains('error')
                              ? const Color(0xFFFCA5A5)
                              : const Color(0xFFBBF7D0),
                        ),
                      ),
                      child: Text(
                        _statusMessage,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: _statusMessage.toLowerCase().contains('error')
                              ? const Color(0xFFB91C1C)
                              : const Color(0xFF166534),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    if (_accessToken != null) ...[
                      const SizedBox(height: 16),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          _StatusChip(label: 'ARC ${_arc ?? '0.5'}'),
                          const SizedBox(width: 10),
                          _StatusChip(label: kIsWeb ? 'Web' : 'Mobile'),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String label;

  const _StatusChip({required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFFE0F2F1),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: Color(0xFF0F766E),
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}