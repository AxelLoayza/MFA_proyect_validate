import sys
import os

# Añadir src al path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

if __name__ == '__main__':
    import uvicorn
    from dotenv import load_dotenv
    
    load_dotenv()
    
    port = int(os.getenv('API_PORT', '8000'))
    tls_enabled = os.getenv('TLS_ENABLED', 'true').lower() == 'true'
    
    if tls_enabled:
        cert_file = os.getenv('TLS_CERT_FILE', './certs/server.crt')
        key_file = os.getenv('TLS_KEY_FILE', './certs/server.key')
        
        print(f' Starting HTTPS server on port {port}')
        print(f'   Certificate: {cert_file}')
        print(f'   Key: {key_file}')
        
        uvicorn.run(
            'app.main:app',
            host='0.0.0.0',
            port=port,
            ssl_certfile=cert_file,
            ssl_keyfile=key_file,
            log_level='info'
        )
    else:
        print(f'  Starting HTTP server on port {port} (dev only)')
        uvicorn.run(
            'app.main:app',
            host='0.0.0.0',
            port=port,
            log_level='info'
        )
