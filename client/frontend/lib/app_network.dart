import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

String _platformPrefix() {
  if (kIsWeb) {
    return 'WEB';
  }

  if (defaultTargetPlatform == TargetPlatform.android) {
    return 'ANDROID';
  }

  return 'DESKTOP';
}

String? _firstNonEmpty(List<String?> values) {
  for (final value in values) {
    final trimmed = value?.trim();
    if (trimmed != null && trimmed.isNotEmpty) {
      return trimmed;
    }
  }

  return null;
}

String? _resolvePlatformUrl(String baseKey, {List<String> aliases = const []}) {
  final prefix = _platformPrefix();
  return _firstNonEmpty([
    dotenv.env['${prefix}_$baseKey'],
    dotenv.env[baseKey],
    for (final alias in aliases) dotenv.env[alias],
  ]);
}

String resolveAppUrl() {
  final explicitUrl = _resolvePlatformUrl('APP_URL');
  if (explicitUrl != null) {
    return explicitUrl.startsWith('http://') ||
            explicitUrl.startsWith('https://')
        ? explicitUrl
        : 'http://$explicitUrl';
  }

  return switch (_platformPrefix()) {
    'WEB' => 'http://localhost:8080',
    'ANDROID' => 'http://10.0.2.2:8080',
    _ => 'http://localhost:8080',
  };
}

String resolveBackendUrl() {
  final explicitUrl = _firstNonEmpty([
    dotenv.env['BACKEND_URL'],
    dotenv.env['CLIENT_BACKEND_URL'],
  ]);
  if (explicitUrl != null && explicitUrl.isNotEmpty) {
    return explicitUrl;
  }

  return 'http://localhost:4000';
}

String resolvePublicBackendUrl() {
  final explicitUrl = _firstNonEmpty([
    dotenv.env['PUBLIC_BACKEND_URL'],
    dotenv.env['CLOUD_SERVICE_URL'],
  ]);
  if (explicitUrl != null && explicitUrl.isNotEmpty) {
    return explicitUrl;
  }

  return 'http://localhost:4003';
}

String describeApiError(
  Map<String, dynamic> responseJson, {
  int? statusCode,
  String fallbackMessage = 'Solicitud fallida',
}) {
  final errorCode = responseJson['error']?.toString();
  final message =
      responseJson['message']?.toString() ??
      responseJson['detail']?.toString() ??
      responseJson['error']?.toString();

  if (statusCode == 401 && errorCode == 'invalid_token') {
    return 'Token ARC 0.5 inválido o expirado. Inicia sesión otra vez.';
  }

  if (statusCode == 401 && errorCode == 'biometric_rejected') {
    return message ?? 'La firma biométrica no fue reconocida.';
  }

  if (statusCode == 403 && errorCode == 'insufficient_arc') {
    return message ?? 'No tienes permisos para completar esta operación.';
  }

  if (message == null || message.isEmpty) {
    return errorCode ?? fallbackMessage;
  }

  if (errorCode != null && errorCode.isNotEmpty && errorCode != message) {
    return '$errorCode: $message';
  }

  return message;
}
