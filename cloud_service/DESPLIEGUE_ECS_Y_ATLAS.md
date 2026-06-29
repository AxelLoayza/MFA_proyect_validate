# Guia de despliegue en ECS y MongoDB Atlas

Esta guia resume como subir `cloud_service/public/backend` y `cloud_service/private` a AWS ECS, como empaquetar el modelo privado y como mantener una configuracion simple basada en `.env`, tanto en local como en despliegue inicial.

## 1. Estructura que se despliega

- `cloud_service/public/backend`: imagen Node.js para el gateway público.
- `cloud_service/private`: imagen Python para inferencia biométrica.
- `client` y `apiContainer`: no forman parte de este stack.

## 2. Recomendacion de tamaño en ECS

Para no dejarlo demasiado reducido, usa como base:

- `public/backend`: `1024 CPU` y `2048 MB`.
- `private`: `2048 CPU` y `4096 MB`.

Si luego ves que baja el uso real, puedes bajar memoria, pero para servicios de ML suele convenir dejar margen.

## 3. Cómo subir el codigo a GitHub

1. Mantén el repositorio con `cloud_service/public/backend` y `cloud_service/private` dentro del mismo proyecto.
2. Sube solo código, Dockerfiles, templates y documentación.
3. No subas `.env`, llaves privadas, credenciales de Atlas ni secretos de Google.
4. Si necesitas ejemplos, usa `.env.example` o parámetros documentados.

## 4. Construcción de imágenes Docker

### Public backend

La imagen ya debe contener:

- `cloud_service/public/backend/src`
- `cloud_service/public/backend/package.json`
- `cloud_service/public/backend/keys` si vas a firmar/verificar JWT dentro del contenedor

Ejemplo de build local:

```bash
cd cloud_service/public/backend
docker build -t mfa-public-backend:latest .
```

### Private ML service

La imagen debe contener:

- `cloud_service/private/src`
- `cloud_service/private/src/app/Entrenamineto_LSTM/embedding_network_mini.tflite`
- Dependencias instaladas desde `src/requirements.txt`

Ejemplo de build local:

```bash
cd cloud_service/private
docker build -t mfa-private-ml:latest .
```

## 5. Cómo manejar el modelo en private

Tienes dos opciones:

### Opción A: Empaquetarlo dentro de la imagen

Es la más simple para empezar.

- Deja `embedding_network_mini.tflite` dentro de `cloud_service/private/src/app/Entrenamineto_LSTM/`.
- El `Dockerfile` copia `src/` completo, así que el modelo viaja con la imagen.
- Ventaja: despliegue sencillo.
- Desventaja: si el modelo cambia, hay que reconstruir la imagen.

### Opción B: Cargarlo desde S3 o EFS

Útil si el modelo cambiará seguido o si pesa bastante.

- Guardas el modelo en S3 o en un volumen EFS.
- ECS descarga o monta el archivo al arrancar.
- Ventaja: actualizas modelo sin reconstruir tanto.
- Desventaja: más piezas de infraestructura.

Para tu caso actual, la opción A es suficiente.

## 6. Flujo GitHub -> ECR -> ECS

1. Construye las dos imágenes localmente o en GitHub Actions.
2. Sube cada imagen a un repositorio ECR distinto.
3. Crea el stack CloudFormation con [cloud_service/AWS_ECS_PUBLIC_PRIVATE_TEMPLATE.yaml](cloud_service/AWS_ECS_PUBLIC_PRIVATE_TEMPLATE.yaml).
4. Pasa las URLs de imagen ECR como `PublicBackendImage` y `PrivateMlImage`.
5. ECS crea el cluster, subredes, ALB, tareas y servicios.

Ejemplo conceptual de etiquetas:

- `123456789012.dkr.ecr.us-east-1.amazonaws.com/mfa-public-backend:2026-06-25`
- `123456789012.dkr.ecr.us-east-1.amazonaws.com/mfa-private-ml:2026-06-25`

## 7. Variables y .env en ECS

Para simplificar, puedes seguir usando `.env` como fuente principal de configuracion, pero con esta regla:

### Local y desarrollo

- Cada servicio puede tener su propio `.env`.
- No subas `.env` real al repositorio.
- Mantén `.env.example` como plantilla.

### En ECS

- El contenido de ese `.env` se replica como variables de entorno de la task definition.
- Si luego quieres endurecer seguridad, migras solo los valores sensibles a Secrets Manager.

### Qué debe ir como variable normal

- `API_PORT`
- `API_HOST`
- `PORT` o `LISTEN_URL`
- `MODEL_PATH`
- `ENVIRONMENT`
- `LOG_LEVEL`
- `TLS_ENABLED`
- `CORS_ORIGINS`
- `PUBLIC_GATEWAY_URL`
- `PRIVATE_LSTM_URL`

### Qué debe ir como secreto si más adelante lo separas

- `MONGO_URI`
- `GOOGLE_CLIENT_SECRET`
- `ML_SERVICE_PASSWORD`
- `MAIL_PASSWORD`
- `JWT_PRIVATE_KEY` si decides pasarla como valor secreto en vez de archivo
- `BiometricSecretKey`

## 8. MongoDB Atlas en nube

Ahora mismo lo tienes en `.env`, pero en ECS conviene pasar `MONGO_URI` por una de estas vías:

### Opción A: Secrets Manager

1. Guardas el URI completo en AWS Secrets Manager.
2. El task definition de ECS lo consume como secreto.
3. Tu contenedor lo recibe como `MONGO_URI` al arrancar.

Ventaja: no queda visible en el template ni en las variables planas.

### Opción B: Parameter Store SecureString

1. Guardas `MONGO_URI` como `SecureString`.
2. ECS lo inyecta como variable de entorno o secreto.

Ventaja: más simple que Secrets Manager para algunos casos.

### Recomendacion practica

- Usa Secrets Manager para `MONGO_URI` y credenciales sensibles.
- Usa variables normales para puertos y banderas como `DEBUG` o `TLS_ENABLED`.

## 9. Conexion a Atlas desde ECS

Para que ECS llegue a Atlas tienes dos pasos:

1. Autoriza la salida de red de tus tasks mediante NAT Gateway o rutas equivalentes.
2. En MongoDB Atlas, agrega a Network Access la IP pública del NAT Gateway o el rango permitido de salida.

Si tu servicio está en subred privada y no tienes NAT, no podrá llegar a Atlas salvo que uses otra conectividad privada.

### URI esperado

```text
mongodb+srv://<user>:<password>@<cluster>/<db>?retryWrites=true&w=majority&appName=<app>
```

### Recomendaciones

- Crea un usuario Atlas con privilegios mínimos sobre la base que uses.
- Mantén TLS habilitado en Atlas.
- Si cambias la contraseña, actualiza el secreto en AWS y fuerza redeploy.

## 10. Cómo pasar del `.env` local a ECS

1. Mantén `.env.example` solo como referencia de desarrollo.
2. Crea un `.env` por servicio cuando trabajes localmente.
3. En ECS, replica las mismas claves como variables de entorno del task definition.
4. Si quieres una primera versión simple, puedes inyectar todo como `Environment` y dejar los secretos para una segunda fase.
5. Cuando el proyecto crezca, mueve solo los secretos a Secrets Manager o Parameter Store.

## 11. Qué se debe construir antes de levantar ECS

- Imagen de `public/backend`.
- Imagen de `private`.
- Secretos en AWS.
- Reglas de seguridad y VPC.
- URI de MongoDB Atlas.
- Credenciales Google OAuth.

## 12. Orden de arranque recomendado

1. Crear VPC, subredes, ALB y grupos de seguridad.
2. Crear secretos y parámetros.
3. Subir imágenes a ECR.
4. Desplegar `private`.
5. Desplegar `public/backend`.
6. Verificar `/health` de ambos.
7. Conectar frontend o cliente al endpoint del API Gateway.

## 13. Nota sobre costos

Tu caso no es de tráfico alto, pero sí puede ser de CPU/memoria alta por inferencia. Por eso conviene:

- Mantener `desiredCount` bajo al inicio.
- Subir CPU de `private` antes que bajar demasiado la memoria.
- Revisar CloudWatch y ajustar después de medir uso real.
