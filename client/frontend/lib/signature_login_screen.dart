import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class SignatureLoginScreen extends StatefulWidget {
  final String jwtToken;
  final String apiContainerUrl;
  final String? tenantKey;

  const SignatureLoginScreen({
    super.key,
    required this.jwtToken,
    required this.apiContainerUrl,
    this.tenantKey,
  });

  @override
  State<SignatureLoginScreen> createState() => _SignatureLoginScreenState();
}

class _SignatureLoginScreenState extends State<SignatureLoginScreen> {
  final List<_StrokePoint> _points = [];
  DateTime? _strokeStartTime;
  bool _isLoading = false;

  void _clearCanvas() {
    setState(() {
      _points.clear();
      _strokeStartTime = null;
    });
  }

  Future<void> _submitSignatureLogin() async {
    if (_points.length < 100) {
      _showError('La firma es muy corta. Dibuja al menos 100 puntos.');
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      final signaturePayload = {
        'timestamp': DateTime.now().toIso8601String(),
        'stroke_points': _points.map((p) => p.toJson()).toList(),
        'stroke_duration_ms': _points.isNotEmpty ? _points.last.t : 0,
      };

      final headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ${widget.jwtToken}',
        if (widget.tenantKey != null && widget.tenantKey!.isNotEmpty) 'X-Tenant-Key': widget.tenantKey!,
      };

      final response = await http.post(
        Uri.parse('${widget.apiContainerUrl}/auth/step-up'),
        headers: headers,
        body: jsonEncode(signaturePayload),
      );

      final responseJson = response.body.isNotEmpty
          ? jsonDecode(response.body) as Map<String, dynamic>
          : <String, dynamic>{};

      if (response.statusCode == 200) {
        final accessToken = responseJson['access_token']?.toString();
        if (accessToken != null && accessToken.isNotEmpty) {
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString('mfa_token', accessToken);
        }
        if (!mounted) return;
        Navigator.of(context).pop(accessToken);
        return;
      }

      _showError(
        responseJson['error']?.toString() ??
            responseJson['message']?.toString() ??
            responseJson['detail']?.toString() ??
            'No se pudo completar el login biometrico',
      );
    } catch (e) {
      _showError('Error de conexion: $e');
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.red),
    );
  }

  void _addPoint(Offset position) {
    setState(() {
      _strokeStartTime ??= DateTime.now();
      final t = DateTime.now().difference(_strokeStartTime!).inMilliseconds;
      _points.add(_StrokePoint(x: position.dx, y: position.dy, t: t, p: 0.5));
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Login biometrico'),
        backgroundColor: const Color(0xFF1F2937),
        foregroundColor: Colors.white,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Dibuja tu firma para completar el login',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 16),
                  Expanded(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: Colors.white,
                        border: Border.all(color: Colors.grey, width: 2),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: GestureDetector(
                          onPanStart: (details) => _addPoint(details.localPosition),
                          onPanUpdate: (details) => _addPoint(details.localPosition),
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

  _StrokePoint({required this.x, required this.y, required this.t, required this.p});

  Map<String, dynamic> toJson() => {'x': x, 'y': y, 't': t, 'p': p};
}

class _StrokePainter extends CustomPainter {
  final List<_StrokePoint> points;

  _StrokePainter(this.points);

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
  bool shouldRepaint(covariant _StrokePainter oldDelegate) => true;
}
