import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import 'dashboard_screen.dart';

class SignatureLoginScreen extends StatefulWidget {
  final String jwtToken;

  const SignatureLoginScreen({
    super.key,
    required this.jwtToken,
  });

  @override
  State<SignatureLoginScreen> createState() => _SignatureLoginScreenState();
}

class _SignatureLoginScreenState extends State<SignatureLoginScreen> {
  final List<_StrokePoint> _points = [];
  DateTime? _strokeStartTime;
  bool _isLoading = false;
  static const String _sdkUrl = 'http://localhost:9001';

  void _clearCanvas() {
    setState(() {
      _points.clear();
      _strokeStartTime = null;
    });
  }

  Future<void> _submitSignatureLogin() async {
    setState(() {
      _isLoading = true;
    });

    try {
      if (_points.length < 100) {
        throw Exception('Dibuja una firma más completa antes de validar.');
      }

      final response = await http.post(
        Uri.parse('$_sdkUrl/api/auth/step-up'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${widget.jwtToken}',
        },
        body: jsonEncode({
          'timestamp': DateTime.now().toIso8601String(),
          'stroke_points': _points.map((point) => point.toJson()).toList(),
          'stroke_duration_ms': _strokeStartTime == null
              ? 0
              : DateTime.now().difference(_strokeStartTime!).inMilliseconds,
        }),
      );

      final responseJson = response.body.isNotEmpty ? jsonDecode(response.body) as Map<String, dynamic> : <String, dynamic>{};

      if (response.statusCode != 200) {
        throw Exception(responseJson['message']?.toString() ?? responseJson['error']?.toString() ?? 'Validación fallida');
      }

      final accessToken = responseJson['access_token']?.toString();
      if (accessToken == null || accessToken.isEmpty) {
        throw Exception('El backend no devolvió un token ARC 1 válido');
      }

      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(
          builder: (_) => DashboardScreen(
            sessionToken: accessToken,
            companyName: 'ARC Secure Corp',
            displayName: 'Usuario autenticado',
            email: 'session@arc.local',
            arcLabel: 'ARC 1.0',
            biometricEnrolled: true,
          ),
        ),
        (route) => false,
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Error de conexión: $e'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Login biométrico'),
        backgroundColor: const Color(0xFF1F2937),
        foregroundColor: Colors.white,
      ),
      body: _isLoading
          ? const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text('Validando firma y elevando ARC...'),
                ],
              ),
            )
          : Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Dibuja tu firma para completar el login',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF1F2937),
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Traza tu firma dentro del lienzo y usa la línea de referencia como guía.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.grey),
                  ),
                  const SizedBox(height: 24),
                  Expanded(
                    child: Container(
                      decoration: BoxDecoration(
                        color: Colors.white,
                        border: Border.all(color: Colors.grey.shade300, width: 2),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: GestureDetector(
                          onPanStart: (details) {
                            setState(() {
                              _strokeStartTime ??= DateTime.now();
                              final t = DateTime.now().difference(_strokeStartTime!).inMilliseconds;
                              _points.add(_StrokePoint(
                                x: details.localPosition.dx,
                                y: details.localPosition.dy,
                                t: t,
                                p: 0.5,
                              ));
                            });
                          },
                          onPanUpdate: (details) {
                            setState(() {
                              if (_strokeStartTime != null) {
                                final t = DateTime.now().difference(_strokeStartTime!).inMilliseconds;
                                _points.add(_StrokePoint(
                                  x: details.localPosition.dx,
                                  y: details.localPosition.dy,
                                  t: t,
                                  p: 0.5,
                                ));
                              }
                            });
                          },
                          child: CustomPaint(
                            painter: _StrokePainter(_points),
                            size: Size.infinite,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      OutlinedButton.icon(
                        onPressed: _clearCanvas,
                        icon: const Icon(Icons.clear),
                        label: const Text('Borrar'),
                      ),
                      ElevatedButton.icon(
                        onPressed: _submitSignatureLogin,
                        icon: const Icon(Icons.verified_user),
                        label: const Text('Validar firma'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF1F2937),
                          foregroundColor: Colors.white,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
    );
  }
}

class _StrokePoint {
  final double x;
  final double y;
  final int t;
  final double p;

  _StrokePoint({
    required this.x,
    required this.y,
    required this.t,
    required this.p,
  });

  Map<String, dynamic> toJson() => {
        'x': x,
        'y': y,
        't': t,
        'p': p,
      };
}

class _StrokePainter extends CustomPainter {
  final List<_StrokePoint> points;

  _StrokePainter(this.points);

  @override
  void paint(Canvas canvas, Size size) {
    final guidePaint = Paint()
      ..color = const Color(0xFF94A3B8)
      ..strokeWidth = 1.3
      ..strokeCap = StrokeCap.round
      ..isAntiAlias = true;

    final baselineY = size.height * 0.72;
    const dashWidth = 10.0;
    const dashGap = 8.0;
    for (double x = size.width * 0.08; x < size.width * 0.92; x += dashWidth + dashGap) {
      final endX = (x + dashWidth).clamp(size.width * 0.08, size.width * 0.92);
      canvas.drawLine(
        Offset(x, baselineY),
        Offset(endX, baselineY),
        guidePaint,
      );
    }

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
  bool shouldRepaint(covariant _StrokePainter oldDelegate) => true;
}
