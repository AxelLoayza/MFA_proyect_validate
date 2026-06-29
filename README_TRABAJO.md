# README de trabajo

## Estado actual

- Rama de trabajo: `pre_production`
- Base funcional a conservar: flujo propio de registro, invitaciones y login biometrico
- Rama de referencia para login: `feature/login_lstm_validation`
- Backend externo del puerto 4000: usa PostgreSQL, no MongoDB
- Fuente de verdad para login, sesion y tokens ARC: `cloud_service`
- Intermediario biometrico: `apiContainer`

## Contrato que vamos a respetar

### Registro

- El registro debe seguir el flujo funcional actual.
- No se deben copiar atajos de registro artificial de la otra rama.
- El contrato de registro debe priorizar el flujo ya implementado por este proyecto.

### Tokens

- ARC 0.5: token temporal de login.
- ARC 1.0: token final despues del paso biometrico.
- `cloud_service/public` emite y valida el login Google ARC 0.5.
- `client/backend` recibe ARC 0.5 y hace el step-up biometrico.
- `apiContainer` solo normaliza y reenvia datos.

### Base de datos

- `cloud_service/public` debe alinearse con la base Mongo remota:
  - `mongodb+srv://axelloayza:admin@cluster0.niw3emu.mongodb.net/`
- `client/backend` sigue con PostgreSQL y sus migraciones.
- No debe haber autoridad duplicada de identidad entre backend externo y cloud_service.

## Flujo objetivo

1. Flutter usa `signature_login_screen.dart` para el login biometrico.
2. El backend externo orquesta el flujo, pero no consume Mongo directamente.
3. `apiContainer` normaliza la firma y actua como puente.
4. `cloud_service` valida credenciales, invitaciones y sesion ARC.
5. El backend externo conserva su propio almacenamiento en Postgres solo para sesiones y trazabilidad.

## Decisiones ya tomadas

- Mantener el flujo funcional propio como base.
- Adoptar la base de datos y el esquema de tokens de la rama de login solo donde aporte coherencia.
- Migrar de forma incremental.
- Priorizar primero tokens y contrato de datos, luego frontend y por ultimo detalles de persistencia.

## Siguiente paso

- Revisar y ajustar el contrato exacto de tokens entre `apiContainer`, `cloud_service` y `client/backend`.
- Luego alinear registro e invitaciones con el esquema de `cloud_service` sin romper el flujo actual.
