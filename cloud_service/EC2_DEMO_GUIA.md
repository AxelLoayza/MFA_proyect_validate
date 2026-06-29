# Demo en EC2 con Docker + Nginx (cloud_service)

Guia para levantar la demo (public-backend + private-ml) en **una sola instancia
EC2** usando Docker Compose y Nginx como reverse proxy. Sin ECS y sin Route 53.
La EC2 trabaja solo con `cloud_service` para no traer el resto del repo.
Pensada para pocos usuarios (<= 3 concurrentes).

---

## 1. Arquitectura de la demo

```
Internet
   |
   v
DuckDNS (A record) -> Elastic IP (EC2)
   |
   v
EC2 (Amazon Linux 2023)
   |__ Docker Compose
        |__ nginx        :80   (publico, reverse proxy)
        |__ public-backend :4003 (interno) -> monta /auth /tenants /invites /health
        |__ private-ml     :9000 (interno) -> inferencia LSTM/TFLite
   |
   v
MongoDB Atlas (externo, MONGO_URI)
```

- El modelo `.tflite` **no se sube a AWS** como artefacto aparte: viaja dentro de
  la imagen del contenedor `private-ml` y se construye en la EC2 desde
  `cloud_service/private`.
- `private-ml` no se expone a Internet; solo `nginx` publica el puerto 80.

---

## 2. DuckDNS como dominio publico

Si: DuckDNS sirve para esta demo.

- DuckDNS te da un subdominio tipo `tuapp.duckdns.org` apuntando a una IP (registro **A**).
  Pon ahi la **Elastic IP** que entrega la plantilla (output `PublicIp`).
- Tambien puedes usar un **CNAME** desde tu propio dominio hacia `tuapp.duckdns.org`
  (un CNAME apunta nombre -> nombre, no a una IP; por eso el A record con la IP lo
  pones en DuckDNS y el CNAME en tu dominio propio si lo tienes).
- Para Google OAuth web necesitas **HTTPS**. Con DuckDNS + Let's Encrypt (certbot)
  obtienes el certificado para `tuapp.duckdns.org`. Google no acepta bien IP cruda
  por HTTP como redirect.

### Que host registrar en Google Cloud Console

El backend monta las rutas bajo `/auth` (ver `cloud_service/public/backend/src/index.js`)
y el intercambio OAuth usa `GOOGLE_REDIRECT_URI` (ver `cloud_service/public/backend/src/routes/auth.js`).
Entonces la **URL de redireccion autorizada** que registras en Google es el host
publico + la ruta de callback de tu flujo. Para esta demo:

```
https://tuapp.duckdns.org/auth/google/exchange
```

- En **local** seria el equivalente con `http://localhost:<puerto>/auth/...`.
- Para **Android** el client ID de Android NO se registra como redirect URI; en ese
  flujo se usa el **client ID web** como `serverClientId`. Mantén `GOOGLE_CLIENT_ID`
  con el client ID web que corresponde al flujo servidor.

---

## 3. Parametros de la plantilla EC2 (`ec2_demo_cloudformation.yaml`)

| Parametro | Requerido | Valor sugerido | Para que sirve |
|---|---|---|---|
| `KeyName` | Si | tu key pair EC2 | Acceso SSH a la instancia |
| `InstanceType` | No | `t3.large` (o `c5.xlarge` si quieres mas velocidad) | CPU/RAM para que la inferencia no sea lenta |
| `SSHLocation` | Recomendado | `TU_IP/32` | Restringe SSH a tu IP |
| `RepoUrl` | No | URL de tu repo git | Repo a clonar en la EC2 |
| `VpcCidr` | No | `10.50.0.0/16` | Rango de la VPC de demo |
| `PublicSubnetCidr` | No | `10.50.0.0/24` | Subred publica |
| `RootVolumeSizeGb` | No | `30` | Disco para imagenes + modelo |
| `LatestAmiId` | No | (auto) | AMI Amazon Linux 2023, no editar |

La plantilla crea: VPC + subred publica + IGW + ruta, Security Group (22/80/443),
rol con SSM, **Elastic IP** y la instancia EC2 con Docker/Compose/git instalados.
La UserData hace sparse checkout para bajar solo `cloud_service`.

> Nota: la app (puertos 4003/9000) NO se abre al exterior; solo 22, 80 y 443.

---

## 4. Variables de entorno (`.env`) que debes crear

La plantilla NO inyecta secretos: los pones tu en la EC2. Necesitas dos archivos.

### `cloud_service/public/backend/.env`
```dotenv
MONGO_URI=mongodb+srv://USER:PASS@cluster.xxxx.mongodb.net/mfa_biometric?retryWrites=true&w=majority
MONGO_DB_NAME=mfa_biometric

GOOGLE_CLIENT_ID=<tu_web_client_id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<tu_client_secret>
GOOGLE_REDIRECT_URI=https://tuapp.duckdns.org/auth/google/exchange

JWT_PUBLIC_KEY_PATH=./keys/jwt_public.pem
JWT_PRIVATE_KEY_PATH=./keys/jwt_private.pem
JWT_ALGO=RS256
JWT_EXPIRATION_SECONDS=3600

BIOMETRIC_SECRET_KEY=<64_caracteres_hex>   # clave real y estable (no relleno)

LISTEN_URL=http://0.0.0.0:4003

APP_NAME=ARC Secure Cloud
MAIL_HOST=smtp.gmail.com
MAIL_PORT=465
MAIL_ENCRYPTION=ssl
MAIL_USERNAME=<tu_correo>
MAIL_PASSWORD=<app_password>
MAIL_FROM_ADDRESS=<tu_correo>
INVITE_EXPIRATION_DAYS=1

ML_SERVICE_USERNAME=bmfa_user
ML_SERVICE_PASSWORD=<password_compartida_con_private-ml>
SERVICE_API_KEY=<opcional_clave_interna>
```

### `cloud_service/private/.env`
```dotenv
MONGO_URI=mongodb+srv://USER:PASS@cluster.xxxx.mongodb.net/mfa_biometric?retryWrites=true&w=majority
MONGO_DB_NAME=mfa_biometric

API_HOST=0.0.0.0
API_PORT=9000
TLS_ENABLED=false
MODEL_PATH=./app/Entrenamineto_LSTM/embedding_network_mini.tflite

ML_SERVICE_USERNAME=bmfa_user
ML_SERVICE_PASSWORD=<misma_password_que_el_backend>

ENVIRONMENT=production
DEBUG=false
LOG_LEVEL=INFO
CORS_ORIGINS=*
CORS_ALLOW_CREDENTIALS=true
VERIFY_CLIENT_CERTIFICATES=false
```

> `BIOMETRIC_SECRET_KEY`: genera 64 hex con
> `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
> Debe mantenerse igual entre despliegues o no podras descifrar biometria guardada.

---

## 5. Pasos: clonar, preparar y levantar

### 5.1 Crear la pila EC2
1. AWS Console -> CloudFormation -> Create stack -> With new resources.
2. Sube `cloud_service/ec2_demo_cloudformation.yaml`.
3. Completa `KeyName` y `SSHLocation` (idealmente `TU_IP/32`).
4. Crea la pila y copia el output `PublicIp` (Elastic IP).

### 5.2 Apuntar DuckDNS
1. En duckdns.org crea/edita `tuapp` y pon el A record = `PublicIp`.
2. (Para HTTPS) deja el dominio listo para certbot mas adelante.

### 5.3 Conectarte a la instancia
```bash
ssh -i TU_LLAVE.pem ec2-user@<PublicIp>
```
La UserData ya instalo Docker, el plugin compose y clono solo `cloud_service`
en `~/app`.
Si el sparse checkout no estuviera, clónalo manualmente:
```bash
cd ~
git clone --depth 1 --filter=blob:none --sparse https://github.com/AxelLoayza/MFA_proyect_validate.git app
cd app
git sparse-checkout set cloud_service
git checkout main
```

### 5.4 Verificar herramientas
```bash
docker --version
docker compose version
```

### 5.5 Crear los .env y las llaves JWT
```bash
cd ~/app/cloud_service

# Edita los dos .env descritos en la seccion 4
nano public/backend/.env
nano private/.env

# Si el repo no trae las llaves JWT, generalas:
mkdir -p public/backend/keys
openssl genrsa -out public/backend/keys/jwt_private.pem 2048
openssl rsa -in public/backend/keys/jwt_private.pem -pubout -out public/backend/keys/jwt_public.pem
```

### 5.6 Levantar los contenedores
```bash
cd ~/app/cloud_service
docker compose up -d --build
docker compose ps
docker compose logs -f --tail=50
```

### 5.7 Probar
```bash
curl http://localhost/health          # desde la EC2
# o desde tu navegador:
http://<PublicIp>/health
```

---

## 6. (Opcional) HTTPS con Let's Encrypt

Para que Google OAuth web funcione necesitas HTTPS en `tuapp.duckdns.org`.
La forma mas simple es agregar certbot/nginx con un companion, o emitir el cert con
certbot en modo standalone y montar los certificados en el contenedor nginx.
Para la demo basica puedes empezar en HTTP y activar HTTPS cuando registres el
redirect en Google.

---

## 7. Comandos utiles

```bash
docker compose restart              # reiniciar todo
docker compose down                 # detener y borrar contenedores
docker compose up -d --build        # reconstruir tras git pull
docker compose logs -f private-ml   # logs del servicio ML
git -C ~/app pull                   # traer cambios del repo
```
