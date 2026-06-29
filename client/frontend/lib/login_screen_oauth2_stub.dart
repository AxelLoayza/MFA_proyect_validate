class _Oauth2Stub {
  const _Oauth2Stub();

  CodeClient initCodeClient(CodeClientConfig config) => CodeClient._(config);
}

const _Oauth2Stub oauth2 = _Oauth2Stub();

class CodeClient {
  CodeClient._(CodeClientConfig config) {
    assert(() {
      config;
      return true;
    }());
  }

  void requestCode() {
    throw UnsupportedError('Google OAuth2 web flow is only available on web.');
  }
}

class CodeClientConfig {
  CodeClientConfig({
    required this.client_id,
    required this.scope,
    this.callback,
    this.redirect_uri,
    this.auto_select,
    this.error_callback,
    this.state,
    this.enable_serial_consent,
    this.hint,
    this.hosted_domain,
    this.ux_mode,
    this.select_account,
  }) {
    assert(() {
      client_id;
      scope;
      callback;
      redirect_uri;
      auto_select;
      error_callback;
      state;
      enable_serial_consent;
      hint;
      hosted_domain;
      ux_mode;
      select_account;
      return true;
    }());
  }

  final String client_id;
  final String scope;
  final void Function(CodeResponse response)? callback;
  final String? redirect_uri;
  final bool? auto_select;
  final void Function(Object error)? error_callback;
  final String? state;
  final bool? enable_serial_consent;
  final String? hint;
  final String? hosted_domain;
  final Object? ux_mode;
  final bool? select_account;
}

class CodeResponse {
  const CodeResponse();

  String get code => '';
  String get scope => '';
  String get state => '';
  String? get error => null;
  String? get error_description => null;
  String? get error_uri => null;
}