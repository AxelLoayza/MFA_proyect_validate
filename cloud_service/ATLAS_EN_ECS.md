# MongoDB Atlas en ECS

Guia breve para conectar ECS con MongoDB Atlas manteniendo la simplicidad de `.env` como base de configuracion.

## Patrón recomendado

- Guarda `MONGO_URI` en tu `.env` local para desarrollo.
- En ECS, replica esa misma clave como variable de entorno o como secreto si mas adelante quieres endurecer la seguridad.
- Si solo `public/backend` necesita Atlas, inyectalo solo allí.

## Qué cambia respecto a `.env`

En local:

- lees `MONGO_URI` desde `.env`.

En ECS:

- ECS crea la variable al arrancar el contenedor.
- El código sigue leyendo `process.env.MONGO_URI` o `os.getenv("MONGO_URI")`.
- Si mañana cambias a Secrets Manager, el código no se toca.

## Pasos

1. Copia tu valor de `.env` a la definicion de tarea de ECS.
2. Da permisos al task role solo si usas secretos administrados.
3. Reinicia el servicio ECS.
4. Verifica que el contenedor vea `MONGO_URI`.

## Red y acceso

- Si `private` está en subred privada, necesita NAT o salida privada equivalente para llegar a Atlas.
- En Atlas, agrega allowlist para la IP pública del NAT Gateway.

## Buenas prácticas

- No expongas el URI en logs.
- No lo hardcodees en la imagen.
- No lo pongas en el repositorio.
- Usa un usuario Atlas con permisos mínimos.
