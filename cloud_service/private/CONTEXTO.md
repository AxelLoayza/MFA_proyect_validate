# cloud_service - Contexto y Alcance

## Propósito
Servicio en la nube (AWS ECS/Lambda) que actúa como **motor de validación biométrica con modelo LSTM** y **autoridad de confianza incremental (ARC)**.
Es la frontera entre identidad federada y confianza contextual reforzada.

## Autoridad en Arquitectura
- **NO es autoridad de identidad** → Cognito es la autoridad primaria
- **SÍ es autoridad de validación biométrica** → Ejecuta modelo LSTM sobre features encriptados
- **SÍ propone nivel ARC** → Determina si es ARC 0.5 (solo contraseña) o ARC 1 (+ biometría)
- **Encargado de privacidad biométrica** → Maneja templates y features de manera segura

## Responsabilidades Core

### 1. Validación Biométrica LSTM
- ✅ Recibir features biométricos encriptados desde apiContainer
- ✅ Desencriptar usando claves seguras (AWS KMS)
- ✅ Ejecutar modelo LSTM v1 (embeddings, comparación)
- ✅ Retornar score de similitud (0-100)
- ✅ Determinar threshold: ≥95 = válido, <95 = rechazar

### 2. Gestión de Plantillas Biométricas
- ✅ Almacenar template de firma encriptado en MongoDB `biometricprofile`
- ✅ **CRÍTICO**: Nunca guardar firma raw, solo embedding irreversible
- ✅ Versionado de modelo: `version: "lstm_v1"` para auditoría de cambios
- ✅ Actualizar plantilla cada N sesiones exitosas (evolución del patrón)

### 3. Cálculo de Confianza Contextual
- ✅ Recibir contexto: IP, deviceId, ubicación, hora
- ✅ Calcular score de riesgo basado en:
  - Cambio de IP vs. histórico
  - Dispositivo conocido vs. nuevo
  - Hora de acceso vs. patrón
  - Frecuencia de fallos recientes
- ✅ **Si riesgo alto**: requerir re-autenticación incluso con biometría válida

### 4. Integración con AWS
- ✅ Usar AWS KMS para desencripción de features
- ✅ Usar AWS Secrets Manager para claves de API
- ✅ Logs en CloudWatch para auditoría
- ✅ Auto-scaling en ECS basado en carga

### 5. Retorno de Información ARC
- ✅ Enviar a apiContainer:
  - `valid: boolean` (biometría coincide)
  - `confidence: number` (0-100)
  - `acr_proposed: string` (urn:arc:level:0.5 | urn:arc:level:1)
  - `risk_score: number`
  - `amr: array` (métodos usados)

## Alcances (IN)

| Funcionalidad | Estado |
|---|---|
| Modelo LSTM deployment | ✅ Implementar |
| Desencriptación KMS | ✅ Implementar |
| Comparación features | ✅ Implementar |
| Gestión plantillas | ✅ Implementar |
| Cálculo riesgo contextual | ✅ Implementar |
| Versionado de modelo | ✅ Implementar |
| Retorno ARC decisión | ✅ Implementar |
| Logging auditoría | ✅ Implementar |
| Auto-scaling | ✅ Implementar |

## Alcances (OUT)

| Funcionalidad | Por qué |
|---|---|
| Capturar biometría | Cliente lo hace |
| Validar JWT | apiContainer lo hace |
| Gestionar sesiones | apiContainer lo hace |
| Emitir tokens JWT | apiContainer lo hace |
| Federar OAuth | Cognito lo hace |

## Stack Tecnológico
- **Lenguaje**: Python 3.11+
- **Framework**: FastAPI o Flask
- **ML**: TensorFlow/PyTorch (modelo LSTM pre-entrenado)
- **Infraestructura**: AWS ECS, API Gateway, KMS
- **Base de datos**: MongoDB (lectura/escritura de plantillas)
- **Observabilidad**: CloudWatch, X-Ray

## Variables de Entorno Críticas
```
AWS_REGION=us-east-1
KMS_KEY_ID=arn:aws:kms:us-east-1:xxx
MONGO_URI=mongodb+srv://cloud_service:pass@cluster.mongodb.net/db
LSTM_MODEL_PATH=s3://models-bucket/lstm_v1.h5
MODEL_VERSION=lstm_v1
CONFIDENCE_THRESHOLD=95
API_CONTAINER_URL=https://api-container.internal
```

## Contratos (API)

### Request: `/validate/biometric`
```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "tenant_id": "tenant_enterprise_01",
  "biometric_features_encrypted": "base64_encrypted_payload",
  "iv": "initialization_vector",
  "auth_tag": "authentication_tag",
  "context": {
    "ipAddress": "181.176.92.110",
    "deviceId": "dev_mac_9f823a",
    "timestamp": 1638360000
  }
}
```

### Response: Decisión ARC
```json
{
  "valid": true,
  "confidence": 98.5,
  "acr_proposed": "urn:arc:level:1",
  "amr": ["federated", "bio"],
  "risk_score": 12,
  "risk_factors": ["new_device"],
  "recommendation": "proceed"
}
```

## Seguridad Crítica

🔒 **Nunca:**
- ❌ Guardar features sin encriptación
- ❌ Retornar features en responses
- ❌ Procesar sin validar tenantId
- ❌ Usar claves hardcodeadas

🔐 **Siempre:**
- ✅ Usar AWS KMS para desencriptación
- ✅ Encriptación AES-256 en transit
- ✅ Validar firma del payload desde apiContainer
- ✅ Logs sin exponer datos sensibles

## Dependencias (Otros servicios)

```mermaid
graph LR
  A["apiContainer"] -->|features encriptados| B["cloud_service"]
  B -->|valida con KMS| C["AWS KMS"]
  B -->|ejecuta LSTM| D["modelo ML"]
  B -->|lee/escribe plantillas| E["MongoDB"]
  B -->|retorna decisión| A
```

## Métrica de Éxito

- ✅ Validación biométrica en < 1500ms (incluye desencriptación)
- ✅ Precisión LSTM ≥ 98% en datos de validación
- ✅ 0 falsos positivos en test de seguridad
- ✅ 100% de requests tienen tenantId validado
- ✅ CloudWatch logs auditable para compliance
- ✅ Auto-scaling responde en < 2min a picos

## Versionado de Modelo

Cuando actualices el modelo LSTM:

```json
{
  "version": "lstm_v2",
  "training_date": "2026-05-17",
  "accuracy": 0.987,
  "backward_compatible": false,
  "migration_plan": "forzar re-enrollment"
}
```

Cambios de versión requieren:
- ✅ Re-validación de usuarios existentes
- ✅ Notificación a SDK cliente
- ✅ Período de transición con ambas versiones
