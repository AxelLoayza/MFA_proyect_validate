import sys
import os

# Añadir src al path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

if __name__ == '__main__':
    import uvicorn
    from dotenv import load_dotenv
    
    load_dotenv()
    
    # --- Enforce environment-only configuration (no silent defaults) ---
    def require_env(name: str) -> str:
        val = os.getenv(name)
        if val is None or val == '':
            print(f"ERROR: required environment variable '{name}' is not set. Aborting.")
            sys.exit(2)
        return val

    # Required values (fail fast if missing)
    api_port = int(require_env('API_PORT'))
    tls_enabled_raw = require_env('TLS_ENABLED').lower()
    if tls_enabled_raw not in ('true', 'false'):
        print("ERROR: TLS_ENABLED must be 'true' or 'false'.")
        sys.exit(2)
    tls_enabled = tls_enabled_raw == 'true'

    api_bind_host = os.getenv('API_BIND_HOST')
    api_host_env = os.getenv('API_HOST')
    if not api_bind_host and not api_host_env:
        print("ERROR: either 'API_BIND_HOST' or 'API_HOST' must be set in the environment. Aborting.")
        sys.exit(2)

    def _derive_bind_host_from_api_host(host_env: str) -> str:
        # host_env may be a URL; strip scheme/path/port
        host = host_env
        if '://' in host:
            host = host.split('://', 1)[1]
        host = host.split('/', 1)[0]
        if ':' in host:
            host = host.split(':', 1)[0]
        return host

    if api_bind_host:
        bind_host = api_bind_host
    else:
        bind_host = _derive_bind_host_from_api_host(api_host_env)

    uvicorn_reload = os.getenv('UVICORN_RELOAD', 'false').lower() == 'true'

    # If TLS is requested, require cert/key to be provided
    if tls_enabled:
        cert_file = require_env('TLS_CERT_FILE')
        key_file = require_env('TLS_KEY_FILE')

        print(f"Starting HTTPS server on {bind_host}:{api_port}")
        print(f"  Certificate: {cert_file}")
        print(f"  Key: {key_file}")

        uvicorn.run(
            'app.main:app',
            host=bind_host,
            port=api_port,
            ssl_certfile=cert_file,
            ssl_keyfile=key_file,
            reload=uvicorn_reload,
            log_level='info'
        )
    else:
        print(f"Starting HTTP server on {bind_host}:{api_port} (dev only)")
        uvicorn.run(
            'app.main:app',
            host=bind_host,
            port=api_port,
            reload=uvicorn_reload,
            log_level='info'
        )
