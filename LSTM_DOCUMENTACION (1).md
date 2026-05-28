# DOCUMENTACIÓN: LSTM STACKED - RECONOCIMIENTO DE FIRMAS DIGITALES

## 1. ¿QUÉ SE ENTRENA?

Se entrena una **red neuronal LSTM** para aprender a reconocer y verificar **firmas digitales**.

**Función principal:** Determinar si una firma es GENUINA (del usuario real) o FALSA (imitación de otro usuario).

---

## 2. ESTADÍSTICAS DEL DATASET

### Cantidad Total
- **1600 firmas digitales** en total
- **40 usuarios diferentes** siendo evaluados
- **40 firmas por usuario** (en promedio)

### Distribución por Persona
Cada uno de los 40 usuarios tiene:
- **~13 firmas genuinas** (del mismo usuario)
- **~27 firmas falsas** (imitaciones de otros usuarios)

**Total: 13 + 27 = 40 firmas por usuario**

### Desglose Completo
```
40 usuarios × 40 firmas = 1600 firmas totales

Usuario 1: 13 genuinas + 27 falsas = 40
Usuario 2: 13 genuinas + 27 falsas = 40
...
Usuario 40: 13 genuinas + 27 falsas = 40

Total genuinas: 40 × 13 = 520 firmas
Total falsas: 40 × 27 = 1080 firmas
```

---

## 3. ESTRUCTURA DE ARCHIVOS

### 3.1 Carpeta Task2_Preprocesado (DATOS)

```
Task2_Preprocesado/
├── X_features.npy          ← Características de firmas
├── Y_user.npy              ← Etiquetas de usuarios
└── M_mask.npy              ← Máscaras de padding
```

#### 3.1.1 X_features.npy
**Qué contiene:**
- Todos los datos de firmas procesados
- **Shape (forma):** (1600, 400, 4)
  - 1600 = número de firmas
  - 400 = timesteps (puntos en el tiempo de cada firma)
  - 4 = features (características por punto)

**Los 4 features son:**
1. X = coordenada horizontal en la pantalla
2. Y = coordenada vertical en la pantalla
3. T = tiempo (timestamp del punto capturado)
4. P = presión (presión del lápiz/dedo en la pantalla)

**Ejemplo visual:**
```
Firma del Usuario 5:
- Punto 1: X=120, Y=80, T=0.01, P=0.8
- Punto 2: X=125, Y=82, T=0.02, P=0.85
- ...
- Punto 400: X=450, Y=120, T=0.50, P=0.3

Esto se repite para las 1600 firmas
```

#### 3.1.2 Y_user.npy
**Qué contiene:**
- Etiqueta de usuario para cada firma
- **Shape:** (1600,) = lista de 1600 números

**Ejemplo:**
```
[0, 0, 0, ..., 0,    ← Firmas del usuario 0 (0 aparece ~40 veces)
 1, 1, 1, ..., 1,    ← Firmas del usuario 1 (1 aparece ~40 veces)
 ...
 39, 39, 39, ..., 39] ← Firmas del usuario 39 (39 aparece ~40 veces)
```

#### 3.1.3 M_mask.npy
**Qué contiene:**
- Máscaras de padding (relleno)
- **Shape:** (1600, 400)

---

## 4. ARCHIVOS DE ENTRENAMIENTO

### 4.1 train_proper.py
**¿Para qué sirve?**
- Script principal que ejecuta el **entrenamiento completo** del modelo
- Usa TODOS los datos (100% del dataset)
- Corre por 180 épocas (pasadas completas por el dataset)

### 4.2 signature_training.py
**¿Para qué sirve?**
- Módulo que contiene las **herramientas necesarias** para entrenar
- Define la arquitectura del modelo
- Define la función de pérdida (Triplet Loss)
- Define cómo generar datos de entrenamiento

## Dropout
"Usamos Dropout con probabilidad 0.3 (desactiva 30% de neuronas aleatorias) SOLO durante entrenamiento. Es una técnica de regularización estándar en deep learning que previene overfitting. Durante predicción, todas las neuronas están activas. Esto mejora la capacidad del modelo de generalizar a firmas nuevas que no vio durante el entrenamiento."

---

## 5. ESTRUCTURA DETALLADA DE LA RED NEURONAL

### 5.1 Visualización Completa de la Arquitectura

```
╔════════════════════════════════════════════════════════════════════════════╗
║                    RED NEURONAL LSTM PARA FIRMAS                           ║
╚════════════════════════════════════════════════════════════════════════════╝

┌─ ENTRADA ─────────────────────────────────────────────────────────────────┐
│                                                                             │
│  Firma digitalizada (400 timesteps × 4 features)                           │
│  Tamaño entrada: 400 × 4 = 1600 valores por firma                         │
│                                                                             │
│  Formato:                                                                  │
│  ┌────────────────────────────────────────────┐                           │
│  │ Timestamp 1: [X=120, Y=80, T=0.01, P=0.8] │ ← 4 números              │
│  │ Timestamp 2: [X=125, Y=82, T=0.02, P=0.85]│ ← 4 números              │
│  │ Timestamp 3: [X=130, Y=85, T=0.03, P=0.9] │ ← 4 números              │
│  │ ...                                         │                           │
│  │ Timestamp 400: [X=450, Y=120, T=0.50, P=0.3]│ ← 4 números            │
│  └────────────────────────────────────────────┘                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
                ┌───────────────────────────────────────┐
                │     CAPA 1: MASKING                   │
                │   (Ignora valores de relleno = 0)     │
                │   - Neuronas: sin contar              │
                │   - Función: Selecciona qué ignorar   │
                │   - Salida: Igual a entrada (400×4)   │
                └───────────────────────────────────────┘
                                    ↓
┌────────────────────────────────────────────────────────────────────────────┐
│ CAPA 2: LSTM #1 (Primera capa LSTM)                                        │
│                                                                             │
│ ¿Qué es LSTM?                                                              │
│ - Recurrent Neural Network especial para secuencias                         │
│ - Recuerda información de pasos anteriores                                  │
│ - Procesa datos: paso 1 → paso 2 → paso 3 → ... → paso 400                │
│                                                                             │
│ Configuración:                                                              │
│ - Unidades (neuronas): 64                                                   │
│ - Entrada por timestep: 4 (X, Y, T, P)                                    │
│ - Salida por timestep: 64 números (características aprendidas)              │
│ - return_sequences: True (mantiene salida para cada timestep)              │
│ - Dropout: 0.3 (desactiva 30% de neuronas aleatoriamente)                 │
│                                                                             │
│ ¿Cómo funciona?                                                             │
│                                                                             │
│  LSTM recibe timesteps secuencialmente:                                     │
│                                                                             │
│  Timestep 1:                                                               │
│  ┌─────────────────────────────────────────────────┐                       │
│  │ Entrada: [120, 80, 0.01, 0.8] (4 números)      │                       │
│  │    ↓                                             │                       │
│  │ LSTM procesa: "inicio del trazo"                 │                       │
│  │    ↓                                             │                       │
│  │ Salida: [0.2, -0.5, 0.8, ..., -0.1] (64 nums) │                       │
│  │ Memoria interna se actualiza                    │                       │
│  └─────────────────────────────────────────────────┘                       │
│                                                                             │
│  Timestep 2:                                                               │
│  ┌─────────────────────────────────────────────────────────┐               │
│  │ Entrada: [125, 82, 0.02, 0.85] (4 números)            │               │
│  │ MEMORIA DEL TIMESTEP 1: [0.2, -0.5, 0.8, ..., -0.1]  │               │
│  │    ↓                                                    │               │
│  │ LSTM procesa: "va hacia arriba, se acelera"             │               │
│  │ (RECUERDA lo que pasó en Timestep 1)                    │               │
│  │    ↓                                                    │               │
│  │ Salida: [0.15, -0.6, 0.9, ..., -0.05] (64 nums)       │               │
│  │ Memoria se actualiza con nueva información             │               │
│  └─────────────────────────────────────────────────────────┘               │
│                                                                             │
│  ... (se repite para 398 timesteps más) ...                                │
│                                                                             │
│  Timestep 400:                                                              │
│  ┌─────────────────────────────────────────────────────────┐               │
│  │ Entrada: [450, 120, 0.50, 0.3] (4 números)            │               │
│  │ MEMORIA ACUMULADA: [información de todos los pasos]    │               │
│  │    ↓                                                    │               │
│  │ LSTM procesa: "termina lentamente"                      │               │
│  │ (RECUERDA TODA la trayectoria de la firma)              │               │
│  │    ↓                                                    │               │
│  │ Salida: [0.1, -0.7, 0.85, ..., -0.2] (64 nums)        │               │
│  └─────────────────────────────────────────────────────────┘               │
│                                                                             │
│ Salida de LSTM #1:                                                          │
│ ┌───────────────────────────────────────────────────┐                      │
│ │ 400 timesteps × 64 características = (400, 64)    │                      │
│ │ (64 características para cada uno de 400 puntos)  │                      │
│ └───────────────────────────────────────────────────┘                      │
└────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌────────────────────────────────────────────────────────────────────────────┐
│ CAPA 3: DROPOUT (Regularización)                                           │
│                                                                             │
│ ¿Qué hace?                                                                  │
│ - Desactiva aleatoriamente el 30% de neuronas                               │
│ - Previene que el modelo "memorice" los datos de entrenamiento              │
│ - Mejora generalización a datos nuevos                                      │
│                                                                             │
│ ¿Cómo funciona?                                                             │
│ - Toma los 64 valores de cada timestep                                      │
│ - Aleatoriamente: 0.3 × 64 ≈ 19 neuronas se desactivan (ponen a 0)        │
│ - Las otras 45 neuronas se amplifican para compensar                        │
│                                                                             │
│ Entrada:  [0.2, -0.5, 0.8, 0.1, -0.3, ..., -0.1] (64 valores)             │
│ Salida:   [0.28, 0, 1.14, 0.14, 0, ..., 0] (30% son ceros aleatorios)    │
│                                                                             │
│ Salida de DROPOUT: (400, 64) - igual que LSTM#1                            │
└────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌────────────────────────────────────────────────────────────────────────────┐
│ CAPA 4: LSTM #2 (Segunda capa LSTM)                                        │
│                                                                             │
│ Similar a LSTM #1 pero con entrada diferentes:                             │
│ - Recibe: 64 características por timestep (NO 4)                           │
│ - Tiene: 64 neuronas                                                        │
│ - return_sequences: False (salida solo para ÚLTIMO timestep)                │
│ - Dropout: 0.3                                                              │
│                                                                             │
│ ¿Qué procesa?                                                               │
│ - Refina las 64 características extraídas por LSTM#1                        │
│ - Aprende patrones más complejos de combinaciones de características        │
│                                                                             │
│ ¿Por qué return_sequences=False?                                            │
│ - Solo necesitamos característica FINAL de la firma completa                │
│ - Descartar timesteps 1-399, mantener el resumen final                     │
│                                                                             │
│ Entrada:  400 timesteps × 64 características = (400, 64)                   │
│ Procesamiento interno:                                                      │
│   Timestep 1: procesa 64 valores                                            │
│   Timestep 2: procesa 64 valores + MEMORIA de paso 1                       │
│   ...                                                                       │
│   Timestep 400: procesa 64 valores + MEMORIA acumulada                     │
│                                                                             │
│ Salida de LSTM #2: Solo último timestep                                     │
│ ┌────────────────────────────────────────────────┐                         │
│ │ 64 valores (resumen de toda la firma)          │                         │
│ │ Ejemplo: [0.5, -0.2, 0.9, 0.1, ..., -0.3]    │                         │
│ └────────────────────────────────────────────────┘                         │
└────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌────────────────────────────────────────────────────────────────────────────┐
│ CAPA 5: DROPOUT (Regularización otra vez)                                  │
│                                                                             │
│ Desactiva 30% de las 64 neuronas                                           │
│ ~19 neuronas a cero                                                         │
│                                                                             │
│ Entrada:  [0.5, -0.2, 0.9, 0.1, ..., -0.3] (64 valores)                   │
│ Salida:   [0.71, 0, 1.28, 0.14, ..., 0] (algunos son 0 aleatorio)         │
│                                                                             │
│ Salida: 64 valores                                                          │
└────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌────────────────────────────────────────────────────────────────────────────┐
│ CAPA 6: DENSE (Red Completamente Conectada)                                │
│                                                                             │
│ Configuración:                                                              │
│ - Entrada: 64 neuronas                                                     │
│ - Salida: 256 neuronas (TODAS conectadas a TODAS)                         │
│ - Función activación: ReLU (Rectified Linear Unit)                         │
│ - Regularización L2: Penaliza pesos grandes                                │
│                                                                             │
│ ¿Cómo funciona?                                                             │
│                                                                             │
│ Entrada: [0.5, -0.2, 0.9, 0.1, ..., -0.3] (64 valores)                    │
│                                                                             │
│ Para cada neurona de salida i (i=1 a 256):                                │
│   output_i = ReLU(w_i1×input_1 + w_i2×input_2 + ... + w_i64×input_64 + b_i)
│                                                                             │
│ Donde:                                                                      │
│ - w_ij = 256 × 64 = 16,384 PESOS a entrenar                               │
│ - b_i = 256 BIAS a entrenar                                                │
│ - Total: 16,384 + 256 = 16,640 parámetros en esta capa                    │
│                                                                             │
│ ReLU función:                                                               │
│   Si x > 0: salida = x                                                      │
│   Si x ≤ 0: salida = 0                                                      │
│                                                                             │
│ Ejemplo cálculo para neurona 1:                                             │
│   suma = 0.3×0.5 + 0.1×(-0.2) + 0.5×0.9 + ... (64 multiplicaciones)      │
│   suma = 2.5                                                                │
│   output = ReLU(2.5) = 2.5 (porque 2.5 > 0)                               │
│                                                                             │
│ Ejemplo cálculo para neurona 200:                                           │
│   suma = 0.2×0.5 + 0.4×(-0.2) + (-0.1)×0.9 + ...                          │
│   suma = -0.3                                                               │
│   output = ReLU(-0.3) = 0 (porque -0.3 ≤ 0)                               │
│                                                                             │
│ Salida de DENSE:                                                            │
│ ┌──────────────────────────────────────────────────────────┐               │
│ │ 256 valores (características transformadas y amplificadas)│               │
│ │ Ejemplo: [2.5, 0, 1.8, 3.2, 0, ..., 0.7] (256 valores) │               │
│ └──────────────────────────────────────────────────────────┘               │
└────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌────────────────────────────────────────────────────────────────────────────┐
│ CAPA 7: DENSE (Embedding - Capa Final)                                     │
│                                                                             │
│ Configuración:                                                              │
│ - Entrada: 256 neuronas                                                    │
│ - Salida: 256 neuronas (IGUAL tamaño)                                      │
│ - Función activación: Lineal (sin activación)                              │
│ - Regularización L2: Penaliza pesos grandes                                │
│                                                                             │
│ Parámetros:                                                                 │
│ - Pesos: 256 × 256 = 65,536 PESOS                                         │
│ - Bias: 256                                                                 │
│ - Total: 65,536 + 256 = 65,792 parámetros                                 │
│                                                                             │
│ Entrada: [2.5, 0, 1.8, 3.2, 0, ..., 0.7] (256 valores)                   │
│                                                                             │
│ Transformación (similar a DENSE anterior):                                 │
│   output_i = w_i1×input_1 + w_i2×input_2 + ... + w_i256×input_256 + b_i  │
│                                                                             │
│ Salida: [1.2, -0.8, 0.5, ..., 2.1] (256 valores, sin ReLU)               │
│                                                                             │
│ IMPORTANTE: Salida NO normalizada aún                                       │
└────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌────────────────────────────────────────────────────────────────────────────┐
│ CAPA 8: L2 NORMALIZE (Normalización)                                       │
│                                                                             │
│ ¿Qué hace?                                                                  │
│ - Convierte vector a su forma unitaria (longitud = 1)                      │
│ - Mantiene dirección, pero normaliza magnitud                              │
│                                                                             │
│ Fórmula:                                                                    │
│   normalized = vector / ||vector||                                          │
│   donde ||vector|| = sqrt(v1² + v2² + ... + v256²)                        │
│                                                                             │
│ Ejemplo:                                                                    │
│   Entrada: [1.2, -0.8, 0.5, ..., 2.1]                                     │
│   Magnitud: sqrt(1.2² + (-0.8)² + 0.5² + ... + 2.1²) = 10.5               │
│   Salida: [1.2/10.5, -0.8/10.5, 0.5/10.5, ..., 2.1/10.5]                 │
│   Salida: [0.114, -0.076, 0.048, ..., 0.200]                              │
│                                                                             │
│ ¿Por qué?                                                                   │
│ - Todas las firmas quedan en escala comparable                              │
│ - Distancias entre embeddings son más significativas                        │
│ - Importante para Triplet Loss                                              │
│                                                                             │
│ SALIDA FINAL - EMBEDDING:                                                  │
│ ┌────────────────────────────────────────────────────────────┐             │
│ │ 256 valores NORMALIZADOS (vector en esfera unitaria)       │             │
│ │ Representa la "firma" en 256 dimensiones                   │             │
│ │ Este es el EMBEDDING que se usa para comparar             │             │
│ └────────────────────────────────────────────────────────────┘             │
└────────────────────────────────────────────────────────────────────────────┘

┌─ RESUMEN DE TRANSFORMACIONES ──────────────────────────────────────────────┐
│                                                                             │
│ Entrada:                                                                    │
│   (400 timesteps, 4 features) → [X,Y,T,P] × 400                           │
│                                  = 1600 números                            │
│                    ↓                                                        │
│ LSTM #1 (64 unidades):                                                     │
│   Extrae 64 características por timestep                                    │
│   (400, 64) → 25,600 números                                              │
│                    ↓                                                        │
│ LSTM #2 (64 unidades):                                                     │
│   Refina a 64 características FINALES                                       │
│   64 números                                                                │
│                    ↓                                                        │
│ DENSE #1 (256 neuronas):                                                   │
│   Expande a 256 características                                             │
│   256 números                                                               │
│                    ↓                                                        │
│ DENSE #2 (256 neuronas, sin activación):                                   │
│   Se mantiene en 256 pero transformado                                      │
│   256 números                                                               │
│                    ↓                                                        │
│ L2 NORMALIZE:                                                               │
│   Normaliza el vector                                                       │
│   256 números con ||vector|| = 1                                           │
│                    ↓                                                        │
│ SALIDA: EMBEDDING (256-dimensional)                                        │
│   Representa la firma de forma comprimida                                   │
│   En un espacio donde firmas similares están cercanas                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Resumen de Capas y Parámetros

```
┌──────┬────────────────────┬─────────┬──────────────┬────────────────┐
│ Capa │ Tipo               │ Entrada │ Salida       │ Parámetros     │
├──────┼────────────────────┼─────────┼──────────────┼────────────────┤
│ 1    │ Masking            │ (400,4) │ (400,4)      │ 0              │
│ 2    │ LSTM(64)           │ (400,4) │ (400,64)     │ 17,664         │
│ 3    │ Dropout(0.3)       │ (400,64)│ (400,64)     │ 0              │
│ 4    │ LSTM(64)           │ (400,64)│ 64           │ 33,024         │
│ 5    │ Dropout(0.3)       │ 64      │ 64           │ 0              │
│ 6    │ Dense(256, ReLU)   │ 64      │ 256          │ 16,640         │
│ 7    │ Dense(256, linear) │ 256     │ 256          │ 65,792         │
│ 8    │ L2Normalize        │ 256     │ 256          │ 0              │
├──────┼────────────────────┼─────────┼──────────────┼────────────────┤
│      │                    │         │ TOTAL        │ 133,120        │
└──────┴────────────────────┴─────────┴──────────────┴────────────────┘
```

---

## 6. ¿CÓMO SE ENTRENA? (EXPLICACIÓN DETALLADA)

### 6.1 El Concepto de Entrenamiento

**Una red neuronal aprende ajustando números internos (PESOS)**

```
Analogía: Aprender a jugar fútbol

ANTES DE ENTRENAR:
- Portero no sabe dónde pararse
- No sabe predecir trayectoria del balón
- Pesos = 0 (sin estrategia)

DURANTE ENTRENAMIENTO:
- Ven muchos partidos
- Analizan dónde iban los balones
- Ajustan posición gradualmente
- Aprenden patrones

DESPUÉS DE ENTRENAR:
- Predicen dónde va el balón
- Se posicionan correctamente
- Pesos = optimizados (estrategia aprendida)
```

### 6.2 Triplet Loss (La Función de Aprendizaje)

**El modelo NO aprende a predecir números, sino a SEPARAR CLASES**

```
¿Qué es un TRIPLET?

Son 3 firmas simultáneamente:
1. ANCHOR: Firma de referencia (Usuario A)
2. POSITIVE: Otra firma de Usuario A
3. NEGATIVE: Firma de Usuario B

Objetivo:
  Distancia(ANCHOR, POSITIVE) < Distancia(ANCHOR, NEGATIVE)
  
  Es decir:
  - Firmas del MISMO usuario → cercanas en espacio 256D
  - Firmas de DIFERENTE usuario → lejanas en espacio 256D

Fórmula de Loss:
  Loss = max(d(anchor, positive) - d(anchor, negative) + margin, 0)
  
  Donde:
  - d() = distancia euclidiana
  - margin = 0.25 (espacio de seguridad)
  
  Interpretación:
  Loss = 0 cuando: d(pos) < d(neg) - 0.25
  Loss > 0 cuando: d(pos) ≥ d(neg) - 0.25
  
  El modelo MINIMIZE esta loss
```

### 6.3 Entrenamiento Paso a Paso (Epoch 1, Step 1)

```
ENTRADA: Batch de 64 Triplets
┌──────────────────────────────────────────────────────────┐
│ 64 ANCHORS (firmas)    │ 64 POSITIVES  │ 64 NEGATIVES   │
│ Usuario 5, Usuario 3   │ Usuario 5, 3  │ Usuario 7, 12  │
│ ... Usuario 40         │ ...           │ ... Usuario 2  │
└──────────────────────────────────────────────────────────┘
                    ↓
                    
PASO 1: FORWARD PASS (Propagación hacia adelante)

Para cada ANCHOR:
  Firma ANCHOR → [Masking] → [LSTM1] → [Dropout] → [LSTM2] → [Dropout] → [Dense1] → [Dense2] → [L2Norm]
  Salida: Embedding_A (256 números)

Para cada POSITIVE:
  Firma POSITIVE → [igual proceso] → Embedding_P (256 números)

Para cada NEGATIVE:
  Firma NEGATIVE → [igual proceso] → Embedding_N (256 números)

Resultado: 
  - 64 embeddings para ANCHORS
  - 64 embeddings para POSITIVES
  - 64 embeddings para NEGATIVES

Visualización:
Embedding_A = [0.1, -0.2, 0.5, 0.0, ..., 0.3]  (256D)
Embedding_P = [0.12, -0.18, 0.51, 0.02, ..., 0.28]  (256D)
Embedding_N = [0.8, 0.2, -0.1, 0.9, ..., -0.5]  (256D)
                    ↓
                    
PASO 2: CALCULAR DISTANCIAS

Para cada uno de los 64 triplets:
  d_pos_i = euclidean(Embedding_A_i, Embedding_P_i)
  d_neg_i = euclidean(Embedding_A_i, Embedding_N_i)

Ejemplo triplet 1:
  d_pos_1 = sqrt((0.1-0.12)² + (-0.2-(-0.18))² + ... + (0.3-0.28)²)
  d_pos_1 = sqrt(0.0004 + 0.0004 + ... + 0.0004)
  d_pos_1 = 0.15 (distancia pequeña - BIEN)
  
  d_neg_1 = sqrt((0.1-0.8)² + (-0.2-0.2)² + ... + (0.3-(-0.5))²)
  d_neg_1 = sqrt(0.49 + 0.16 + ... + 0.64)
  d_neg_1 = 2.5 (distancia grande - BIEN)

                    ↓
                    
PASO 3: CALCULAR LOSS

Para cada triplet:
  loss_i = max(d_pos_i - d_neg_i + 0.25, 0)

Ejemplo triplet 1:
  loss_1 = max(0.15 - 2.5 + 0.25, 0)
  loss_1 = max(-2.1, 0)
  loss_1 = 0 (¡Excelente separación!)

Ejemplo triplet 2 (peor):
  d_pos_2 = 1.5
  d_neg_2 = 1.8
  loss_2 = max(1.5 - 1.8 + 0.25, 0)
  loss_2 = max(-0.05, 0)
  loss_2 = 0 (apenas)

Ejemplo triplet 3 (malo):
  d_pos_3 = 2.0 (firmas parecidas están lejos)
  d_neg_3 = 1.5 (firmas diferentes están cerca)
  loss_3 = max(2.0 - 1.5 + 0.25, 0)
  loss_3 = max(0.75, 0)
  loss_3 = 0.75 (¡PÉRDIDA ALTA - Hay que entrenar!)

Loss total del batch = (loss_1 + loss_2 + loss_3 + ... + loss_64) / 64
Loss total del batch = 0.05 (ejemplo)

                    ↓
                    
PASO 4: BACKWARD PASS (Retropropagación)

El modelo calcula:
"¿Cuánto cambio cada PESO para reducir la Loss?"

Para cada uno de los 133,120 pesos:
  ∂Loss/∂Peso = cómo afecta este peso a la Loss

Ejemplo (Peso en Dense layer 1):
  Peso actual: w = 0.3
  ∂Loss/∂w = 0.002 (significa que si aumentamos este peso, Loss aumenta)
  
Ejemplo (Peso en LSTM):
  Peso actual: w = -0.1
  ∂Loss/∂w = -0.001 (significa que si aumentamos este peso, Loss disminuye)

                    ↓
                    
PASO 5: ACTUALIZAR PESOS (Gradient Descent)

learning_rate = 0.01

Para cada peso:
  Nuevo_peso = Peso_anterior - learning_rate × (∂Loss/∂Peso)

Ejemplo 1:
  Peso_anterior = 0.3
  ∂Loss/∂Peso = 0.002
  Nuevo_peso = 0.3 - 0.01 × 0.002 = 0.29998 (muy pequeño cambio)

Ejemplo 2:
  Peso_anterior = -0.1
  ∂Loss/∂Peso = -0.001
  Nuevo_peso = -0.1 - 0.01 × (-0.001) = -0.1 + 0.00001 = -0.09999

Este PEQUEÑO ajuste en cada uno de los 133,120 pesos hace que
el modelo aprenda gradualmente.

                    ↓
                    
FIN DE STEP 1

Loss después: 0.048 (disminuyó un poco de 0.05)
Pesos: 133,120 valores actualizados

```

### 6.4 Entrenamiento Completo de una Época

```
ÉPOCA 1 (1 pasada completa por todos los datos):

Step 1: 64 triplets
  Loss: 0.065 → Pesos actualizados

Step 2: 64 triplets DIFERENTES (seleccionados aleatoriamente)
  Loss: 0.062 → Pesos actualizados

Step 3: 64 triplets DIFERENTES
  Loss: 0.058 → Pesos actualizados

...

Step 240: 64 triplets DIFERENTES
  Loss: 0.048 → Pesos actualizados

TOTAL DATOS PROCESADOS EN ÉPOCA 1:
240 steps × 64 triplets = 15,360 pares/triplets procesados
Recuerda que hay 1120 firmas en training:
15,360 / 1120 = 13.7 repeticiones del dataset (está bien, genera variabilidad)

VALIDACIÓN (al final de época 1):
Procesa 60 steps de validación
Calcula Loss en datos que el modelo NO vio durante training
Val_Loss: 0.041 (¡mejor que train loss!)

FIN ÉPOCA 1:
- Todos los pesos ajustados
- Training Loss: 0.048 (promedio de 240 steps)
- Validation Loss: 0.041
- El modelo ahora sabe un poco más

ÉPOCA 2 (inicio):
- Los datos se MEZCLAN aleatoriamente de nuevo
- Pesos comienzan con valores del final de Época 1
- Comienza el proceso otra vez
- Loss debería ser más bajo (modelo ya aprendió)

ÉPOCA 2 resultados típicos:
- Training Loss: 0.035 (más bajo que Época 1)
- Validation Loss: 0.028 (más bajo que Época 1)

...

ÉPOCA 180:
- Training Loss: 0.010 (mucho más bajo)
- Validation Loss: 0.009 (excelente)
- Modelo está bien entrenado

```

### 6.5 Visualización de Evolución del Aprendizaje

```
                                  ¿Cómo mejora el modelo?
                                  
LOSS vs ÉPOCA:

Loss
0.070 │  ●
      │   ●
0.060 │    ●
      │     ●●
0.050 │      ●●
      │       ●●●
0.040 │         ●●●
      │          ●●●●
0.030 │            ●●●●●
      │              ●●●●●●
0.020 │                ●●●●●●●
      │                 ●●●●●●●
0.010 │                  ●●●●●●●
      │                   ●●●●●
0.000 │                    ●●●●
      └─────────────────────────────→ ÉPOCA
        1   50   100   150   180

Explicación:
- Línea baja: Modelo mejora (Loss disminuye)
- Línea alta: Modelo empieza a aprender poco (satura)
- La curva describe un descenso típico

¿Qué pasa en el espacio de embeddings?

ANTES DE ENTRENAR (Random):
        Usuario 5
        ● ●●
          ● ●  ← Desordenado, solapado
        Usuario 7
        ●●●
          ●●
        Usuario 3
        ●●
    Firmas mezcladas sin separación

DURANTE ENTRENAMIENTO:
        Usuario 5
        ●●●    ← Agrupándose
        ●●
        
        (espacio vacío) ← El modelo crea separación
        
        Usuario 7
        ●●●    ← Agrupándose
        
        (espacio vacío)
        
        Usuario 3
        ●●●    ← Agrupándose

DESPUÉS DE ENTRENAR:
        Usuario 5  Usuario 7  Usuario 3
        ●●●        ●●●        ●●●
        ●●         ●●         ●●
        Separados  Separados  Separados
        en clusters distintos

```

---

## 7. ¿QUÉ HACE TRAIN_PROPER.PY EN DETALLE?

```python
# PASO 1: Importa módulos
from signature_training import TrainingConfig, train_signature_model

# PASO 2: Define configuración
config = TrainingConfig(
    epochs=180,              # Cuántas veces repite el dataset
    steps_per_epoch=240,     # Cuántos batches por época
    batch_size=64,           # 64 firmas por batch
    margin=0.25,             # Margen Triplet Loss
    embedding_dim=256,       # Dimensiones del embedding
    learning_rate=0.01,      # Velocidad de cambio
    # ... más parámetros
)

# PASO 3: Ejecuta todo
train_signature_model(config)

# FIN: Genera embedding_network_final.h5
```

---

## 8. ¿QUÉ HACE SIGNATURE_TRAINING.PY EN DETALLE?

### 8.1 TrainingConfig
Define parámetros del modelo

### 8.2 load_dataset()
Carga y divide datos

### 8.3 build_encoder()
Crea la arquitectura LSTM

### 8.4 SiameseModel
Implementa Triplet Loss

### 8.5 TripletDataGenerator
Genera datos de entrenamiento infinitos

### 8.6 train_signature_model()
Ejecuta el bucle de entrenamiento completo

---

## 9. ¿CÓMO EJECUTARLO?

### 9.1 Requisitos
```bash
pip install tensorflow numpy scipy scikit-learn
```

### 9.2 En el Servidor
```bash
python train_proper.py
```

O con persistencia:
```bash
nohup python train_proper.py > entrenamiento.log 2>&1 &
```

---

## 10. TIEMPO Y RECURSOS

| Métrica | Valor |
|---------|-------|
| **Tiempo por época** | 4-5 minutos |
| **Total (180 épocas)** | 10-15 horas |
| **Almacenamiento modelo** | ~3 MB |
| **Datos requeridos** | ~11 MB |
| **Total** | ~50 MB |

---

## 11. RESUMEN FINAL

**Arquitectura completa en números:**

```
Entrada: 1600 firmas × 400 timesteps × 4 features

Red Neuronal:
  LSTM(64) + LSTM(64) + Dense(256) + Dense(256) + L2Norm
  
Total parámetros: 133,120

Salida: 1600 embeddings de 256D
  (cada firma representada como vector de 256 números)

Entrenamiento:
  180 épocas × 240 steps × 64 firmas = 2,764,800 firmas procesadas
  (mucho más que 1600 original - hay repetición con variabilidad)

Función de aprendizaje:
  Triplet Loss (margen = 0.25)
  Objetivo: Separar firmas genuinas de falsas

Resultado:
  Modelo que reconoce firmas
  Reutilizable sin reentrenar
```

---

Última actualización: 27 de Mayo de 2026
