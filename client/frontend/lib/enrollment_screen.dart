import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'login_screen.dart'; // Importamos StrokePoint y StrokePainter

class EnrollmentScreen extends StatefulWidget {
  final String jwtToken; // El token ARC 0.5 que pasaremos desde login_screen

  const EnrollmentScreen({super.key, required this.jwtToken});

  @override
  State<EnrollmentScreen> createState() => _EnrollmentScreenState();
}

class _EnrollmentScreenState extends State<EnrollmentScreen> {
  // Configuración del servidor
  static const String backendUrl = 'http://localhost:4000'; // Ajusta la IP si usas emulador/físico

  // Variables de estado
  int _currentStep = 1;
  final int _totalSteps = 5;
  List<List<StrokePoint>> _allSignatures = [];
  List<StrokePoint> _currentStrokePoints = [];
  DateTime? _strokeStartTime;
  
  bool _isLoading = false;

  /// Limpia el lienzo actual
  void _clearCanvas() {
    setState(() {
      _currentStrokePoints.clear();
      _strokeStartTime = null;
    });
  }

  /// Pasa a la siguiente firma o envía al servidor si ya son 5
  Future<void> _nextSignature() async {
    if (_currentStrokePoints.length < 50) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('La firma es muy corta. Dibuja una firma más completa.'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    // Guardar la firma actual en la lista maestra
    _allSignatures.add(List.from(_currentStrokePoints));

    if (_currentStep < _totalSteps) {
      // Pasar al siguiente paso
      setState(() {
        _currentStep++;
        _currentStrokePoints.clear();
        _strokeStartTime = null;
      });
    } else {
      // Llegamos a la 5ta firma, procedemos a enviar al servidor
      await _submitEnrollment();
    }
  }

  /// Construye el paquete JSON y lo envía al Node.js
  Future<void> _submitEnrollment() async {
    setState(() {
      _isLoading = true;
    });

    try {
      // Construir el array de 5 firmas exactamente como lo espera Python a través de Node.js
      List<Map<String, dynamic>> signaturesPayload = [];

      for (var strokeArray in _allSignatures) {
        if (strokeArray.isNotEmpty) {
          int durationMs = strokeArray.last.t - strokeArray.first.t;
          signaturesPayload.add({
            "timestamp": DateTime.now().toIso8601String(),
            "stroke_points": strokeArray.map((p) => p.toJson()).toList(),
            "stroke_duration_ms": durationMs > 0 ? durationMs : 1000,
          });
        }
      }

      final payload = {
        "signatures": signaturesPayload,
      };

      final response = await http.post(
        Uri.parse('$backendUrl/api/auth/enroll'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${widget.jwtToken}',
        },
        body: jsonEncode(payload),
      );

      if (response.statusCode == 201 || response.statusCode == 200) {
        final responseJson = jsonDecode(response.body) as Map<String, dynamic>;
        final accessToken = responseJson['access_token']?.toString();
        if (accessToken != null && accessToken.isNotEmpty) {
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString('mfa_token', accessToken);
        }
        if (!mounted) return;
        _showSuccessDialog(accessToken);
      } else {
        // ERROR DEL SERVIDOR
        final errorBody = jsonDecode(response.body);
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: ${errorBody['error'] ?? 'Hubo un problema enrolando la biometría'}'),
            backgroundColor: Colors.red,
          ),
        );
        // Si falla, podríamos reiniciar todo o dejar que intente de nuevo la última
        _allSignatures.removeLast(); 
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Error de conexión: $e'),
          backgroundColor: Colors.red,
        ),
      );
      _allSignatures.removeLast();
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  void _showSuccessDialog(String? accessToken) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Text('¡Enrolamiento Exitoso!'),
        content: const Text(
          'Tu biometría conductual ha sido generada, encriptada y guardada de manera segura. '
          'Ahora puedes iniciar sesión utilizando tu firma.',
        ),
        actions: [
          TextButton(
            onPressed: () {
              // Cerrar diálogo y regresar al Login
              Navigator.of(context).pop();
              Navigator.of(context).pop(accessToken); // Salir de EnrollmentScreen con ARC 1.0 si existe
            },
            child: const Text('Finalizar'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Registrar Firma'),
        backgroundColor: const Color(0xFF1F2937),
        foregroundColor: Colors.white,
      ),
      body: _isLoading
          ? const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 20),
                  Text('Procesando biometría y asegurando datos...', style: TextStyle(fontSize:16)),
                ],
              ),
            )
          : Padding(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Barra de progreso y Título
                  Text(
                    'Firma $_currentStep de $_totalSteps',
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF1F2937),
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 12),
                  LinearProgressIndicator(
                    value: _currentStep / _totalSteps,
                    backgroundColor: Colors.grey[300],
                    valueColor: AlwaysStoppedAnimation<Color>(Colors.green[700]!),
                    minHeight: 8,
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Dibuja tu firma lo más natural posible. '
                    'Necesitamos 5 muestras para calibrar tu modelo matemático único.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.grey),
                  ),
                  const SizedBox(height: 30),

                  // Lienzo de Dibujo (Canvas)
                  Expanded(
                    child: Container(
                      decoration: BoxDecoration(
                        color: Colors.white,
                        border: Border.all(color: Colors.grey[300]!, width: 2),
                        borderRadius: BorderRadius.circular(12),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.05),
                            blurRadius: 10,
                            offset: const Offset(0, 4),
                          )
                        ],
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: GestureDetector(
                          onPanStart: (details) {
                            setState(() {
                              _strokeStartTime ??= DateTime.now();
                              
                              int t = DateTime.now().difference(_strokeStartTime!).inMilliseconds;
                              
                              _currentStrokePoints.add(StrokePoint(
                                x: details.localPosition.dx,
                                y: details.localPosition.dy,
                                t: t,
                                p: 0.5, // Presión base por defecto si no hay soporte stylus
                              ));
                            });
                          },
                          onPanUpdate: (details) {
                            setState(() {
                              if (_strokeStartTime != null) {
                                int t = DateTime.now().difference(_strokeStartTime!).inMilliseconds;
                                // Tratar de capturar presión real si el dispositivo lo soporta
                                // En onPanUpdate, force suele venir si hay stylus/Apple Pencil
                                // Si no hay información (es 0.0), usamos un default o calculamos heurística
                                
                                _currentStrokePoints.add(StrokePoint(
                                  x: details.localPosition.dx,
                                  y: details.localPosition.dy,
                                  t: t,
                                  p: 0.5, 
                                ));
                              }
                            });
                          },
                          child: CustomPaint(
                            painter: StrokePainter(_currentStrokePoints),
                            size: Size.infinite,
                          ),
                        ),
                      ),
                    ),
                  ),

                  const SizedBox(height: 24),

                  // Botones de acción
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      OutlinedButton.icon(
                        onPressed: _clearCanvas,
                        icon: const Icon(Icons.clear),
                        label: const Text('Borrar'),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                          foregroundColor: Colors.red[700],
                          side: BorderSide(color: Colors.red[700]!),
                        ),
                      ),
                      ElevatedButton.icon(
                        onPressed: _nextSignature,
                        icon: Icon(_currentStep == _totalSteps ? Icons.check_circle : Icons.arrow_forward),
                        label: Text(_currentStep == _totalSteps ? 'Finalizar' : 'Siguiente'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF1F2937),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                ],
              ),
            ),
    );
  }
}
