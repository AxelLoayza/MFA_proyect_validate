import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'app_network.dart';
import 'dashboard_screen.dart';
import 'enrollment_screen.dart';
import 'login_screen.dart';
import 'signature_login_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await dotenv.load(fileName: '.env');
  } catch (error) {
    debugPrint('No se pudo cargar .env: $error');
  }
  runApp(const BiometricAuthApp());
}

/// Aplicación principal para el sistema de autenticación biométrica
class BiometricAuthApp extends StatelessWidget {
  const BiometricAuthApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Auditoría Biométrica - Tesis',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0D9488)),
        useMaterial3: true,
        fontFamily: 'Roboto',
      ),
      home: const SessionBootstrap(),
      debugShowCheckedModeBanner: false,
    );
  }
}

class SessionBootstrap extends StatefulWidget {
  const SessionBootstrap({super.key});

  @override
  State<SessionBootstrap> createState() => _SessionBootstrapState();
}

class _SessionBootstrapState extends State<SessionBootstrap> {
  Future<Widget>? _startupFuture;

  @override
  void initState() {
    super.initState();
    _startupFuture = _resolveInitialScreen();
  }

  Future<Widget> _resolveInitialScreen() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('mfa_token');
    final publicBackendUrl = resolvePublicBackendUrl();

    if (token == null || token.isEmpty) {
      return const LoginScreen();
    }

    try {
      final response = await http.get(
        Uri.parse('$publicBackendUrl/auth/me'),
        headers: {'Authorization': 'Bearer $token'},
      );

      if (response.statusCode != 200) {
        await prefs.remove('mfa_token');
        return const LoginScreen();
      }

      final payload = jsonDecode(response.body) as Map<String, dynamic>;
      final user =
          (payload['user'] as Map?)?.cast<String, dynamic>() ?? const {};
      final arc = payload['arc']?.toString() ?? user['arc']?.toString();
      final hasBiometric = user['biometricEnrolled'] == true;

      if (arc == 'urn:arc:level:1.0' || arc == '1.0') {
        return DashboardScreen(
          sessionToken: token,
          companyName: 'ARC Secure Corp',
          displayName: user['name']?.toString() ?? 'Usuario',
          email: user['email']?.toString() ?? 'sin-correo@arc.local',
          arcLabel: 'ARC 1.0',
          biometricEnrolled: true,
        );
      }

      if (arc == 'urn:arc:level:0.5' || arc == '0.5') {
        if (hasBiometric) {
          return SignatureLoginScreen(jwtToken: token);
        }

        return EnrollmentScreen(jwtToken: token);
      }

      return const LoginScreen();
    } catch (_) {
      await prefs.remove('mfa_token');
      return const LoginScreen();
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Widget>(
      future: _startupFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        if (snapshot.hasError || snapshot.data == null) {
          return const LoginScreen();
        }

        return snapshot.data!;
      },
    );
  }
}
