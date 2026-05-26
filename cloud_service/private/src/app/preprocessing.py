"""
Advanced preprocessing pipeline for biometric signature data
Prepares data for LSTM model inference
"""
import numpy as np
from typing import List, Dict, Tuple
from scipy import signal
from scipy.interpolate import interp1d
import logging

logger = logging.getLogger(__name__)


def preprocess_signature(
    stroke_points: List,
    real_length: int,
    target_frequency: int = 100,
    target_length: int = 400
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Complete preprocessing pipeline for signature data (4 features configuration)
    
    Pipeline:
    1. Recuperar longitud real (deshacer padding)
    2. Resampling a 100 Hz
    3. Suavizado de coordenadas
    4. Calcular velocidad (diferencias centrales)
    5. Normalizar por feature
    6. Truncado inteligente (si > 400 puntos)
    7. Padding final con máscara (a 400 puntos)
    
    Args:
        stroke_points: Lista de puntos normalizados (puede incluir padding)
        real_length: Longitud real antes del padding aplicado en apiContainer
        target_frequency: Frecuencia objetivo en Hz (default 100)
        target_length: Longitud objetivo final (default 400)
        
    Returns:
        Tuple[np.ndarray, np.ndarray]: 
            - features array (target_length, 4): [x, y, vx, vy]
            - mask array (target_length,): 1 para puntos reales, 0 para padding
    """
    logger.info(f"Starting preprocessing: {len(stroke_points)} points, real_length={real_length}")
    
    # Step 1: Recuperar longitud real (eliminar padding de apiContainer)
    original_sequence = recover_original_sequence(stroke_points, real_length)
    logger.info(f"Step 1: Recovered original sequence: {len(original_sequence)} points")
    
    # Validar que tenemos suficientes puntos
    if len(original_sequence) < 100:
        raise ValueError(f"Signature too short after removing padding: {len(original_sequence)} < 100")
    
    # Step 2: Resampling a frecuencia objetivo (100 Hz)
    resampled = resample_to_frequency(original_sequence, target_frequency)
    logger.info(f"Step 2: Resampled to {target_frequency} Hz: {len(resampled)} points")
    
    # Step 3: Suavizado de coordenadas (Savitzky-Golay filter)
    smoothed = smooth_coordinates(resampled)
    logger.info(f"Step 3: Smoothed coordinates")
    
    # Step 4-6: Calcular features (velocidad, aceleración, ángulo, curvatura)
    features = extract_advanced_features(smoothed)
    logger.info(f"Step 4-6: Extracted features: shape={features.shape}")
    
    # Step 7: Normalización por feature
    features_normalized = normalize_features(features)
    logger.info(f"Step 7: Normalized features")
    
    # Validar normalización
    validate_normalization(features_normalized)
    
    # Step 8: Truncado inteligente si > target_length
    if len(features_normalized) > target_length:
        truncated, valid_indices = intelligent_truncate(features_normalized, target_length)
        logger.info(f"Step 8: Intelligent truncation: {len(features_normalized)} -> {len(truncated)}")
        features_normalized = truncated
    
    # Step 9: Padding final con máscara
    padded_features, mask = apply_padding_with_mask(features_normalized, target_length)
    logger.info(f"Step 9: Final padding: {len(features_normalized)} -> {padded_features.shape[0]} with mask")
    
    return padded_features, mask


def generate_master_feature(list_of_signatures: List[Tuple[np.ndarray, np.ndarray]]) -> Dict[str, list]:
    """
    Calcula el 'Feature Maestro' a partir de 5 firmas procesadas.
    
    Args:
        list_of_signatures: Lista de 5 tuplas. Cada tupla contiene:
            - features_array: np.ndarray (400, 4)
            - mask: np.ndarray (400,)
            Solo tomamos en cuenta los features.
            
    Returns:
        Dict con los tensores promedio (mean) y desviación estándar (std) 
        como listas para fácil serialización a JSON.
    """
    logger.info(f"Generando Feature Maestro a partir de {len(list_of_signatures)} firmas")
    
    # Extraer solo los tensores de características y validar forma
    features_only = []
    for f, m in list_of_signatures:
        if f.shape != (400, 4):
            raise ValueError(f"Dimensión incorrecta en Tensor. Esperado (400,4), recibido {f.shape}")
        features_only.append(f)
        
    # Apilamos en un nuevo eje: Resulta en tensor de shape (5, 400, 4)
    stacked = np.stack(features_only, axis=0)
    
    # Calculamos los promedios y tolerancias a lo largo del eje 0 (entre las 5 firmas)
    mean_tensor = np.nanmean(stacked, axis=0)
    std_tensor = np.nanstd(stacked, axis=0)
    
    return {
        "mean": mean_tensor.tolist(),
        "std": std_tensor.tolist()
    }


def recover_original_sequence(stroke_points: List, real_length: int) -> np.ndarray:
    """
    Recuperar secuencia original eliminando el padding aplicado en apiContainer
    
    Args:
        stroke_points: Puntos con posible padding
        real_length: Longitud real original
        
    Returns:
        np.ndarray: Secuencia original (real_length, 4) [x, y, t, p]
    """
    # Convertir a numpy array
    sequence = np.array([
        [p.x, p.y, p.t, p.p] for p in stroke_points
    ])
    
    # Si la longitud coincide con real_length, no hay padding
    if len(sequence) == real_length:
        return sequence
    
    # Si hay padding, tomar solo los primeros real_length puntos
    # Asumiendo que el padding se aplicó al final
    if len(sequence) > real_length:
        return sequence[:real_length]
    
    # Si real_length > len(sequence), algo está mal
    logger.warning(f"real_length ({real_length}) > actual length ({len(sequence)})")
    return sequence


def resample_to_frequency(sequence: np.ndarray, target_freq: int = 100) -> np.ndarray:
    """
    Resampling a frecuencia objetivo (100 Hz) con anti-aliasing
    
    Usa interpolación LINEAL (óptima para señales biométricas):
    - Movimiento humano es naturalmente suave (2-15 Hz)
    - Evita artefactos y overshoots de splines cúbicas
    - Más rápida y predecible para producción
    
    Aplica filtro anti-aliasing si frecuencia original < 50 Hz.
    
    Args:
        sequence: Array (n, 4) [x, y, t, p]
        target_freq: Frecuencia objetivo en Hz
        
    Returns:
        np.ndarray: Secuencia resampleada
    """
    n_points = len(sequence)
    
    if n_points < 2:
        return sequence
    
    # Timestamps originales (en milisegundos)
    t_original = sequence[:, 2]
    
    # Duración total en segundos
    duration_s = (t_original[-1] - t_original[0]) / 1000.0
    
    if duration_s <= 0:
        logger.warning("Duration is zero or negative, returning original sequence")
        return sequence
    
    # Calcular frecuencia original aproximada
    original_freq = (n_points - 1) / duration_s
    
    # Número de puntos objetivo según frecuencia
    n_target = int(duration_s * target_freq)
    
    # Evitar muy pocos o muchos puntos
    n_target = max(100, min(n_target, 2000))
    
    # Crear timestamps uniformes
    t_uniform = np.linspace(t_original[0], t_original[-1], n_target)
    
    # Interpolar cada feature
    resampled = np.zeros((n_target, 4))
    
    for i in range(4):  # x, y, t, p
        # 🔥 ANTI-ALIASING: Si frecuencia original < 50 Hz (Nyquist para 100 Hz)
        if original_freq < 50 and n_points > 10:
            try:
                # Aplicar filtro pasa-bajas antes de interpolar
                sos = signal.butter(4, 0.8, btype='low', output='sos')
                filtered_data = signal.sosfiltfilt(sos, sequence[:, i])
            except Exception as e:
                logger.warning(f"Anti-aliasing filter failed for feature {i}: {str(e)}")
                filtered_data = sequence[:, i]
        else:
            filtered_data = sequence[:, i]
        
        # Interpolación lineal (óptima para señales biométricas)
        resampled[:, i] = np.interp(t_uniform, t_original, filtered_data)
    
    logger.info(f"Resampled from {original_freq:.1f} Hz ({n_points} pts) to {target_freq} Hz ({n_target} pts)")
    
    return resampled


def smooth_coordinates(sequence: np.ndarray, window_length: int = 7, polyorder: int = 3) -> np.ndarray:
    """
    Suavizado de coordenadas usando filtro Savitzky-Golay
    
    Args:
        sequence: Array (n, 4) [x, y, t, p]
        window_length: Longitud de la ventana (debe ser impar)
        polyorder: Orden del polinomio
        
    Returns:
        np.ndarray: Secuencia suavizada
    """
    n = len(sequence)
    
    # Ajustar window_length si es necesario
    if window_length >= n:
        window_length = n if n % 2 == 1 else n - 1
    if window_length < polyorder + 2:
        window_length = polyorder + 2
    if window_length % 2 == 0:
        window_length += 1
    
    smoothed = sequence.copy()
    
    # Suavizar x e y (no t ni p para preservar timestamps y presión original)
    for i in [0, 1]:  # x, y
        smoothed[:, i] = signal.savgol_filter(sequence[:, i], window_length, polyorder)
    
    return smoothed


def extract_advanced_features(sequence: np.ndarray) -> np.ndarray:
    """
    Extraer features avanzadas: velocidad en los ejes
    
    Features finales (4):
    1. x (suavizado)
    2. y (suavizado)
    3. vx (velocidad en x)
    4. vy (velocidad en y)
    
    Args:
        sequence: Array (n, 4) [x, y, t, p]
        
    Returns:
        np.ndarray: Features (n, 4)
    """
    n = len(sequence)
    features = np.zeros((n, 4))
    
    x = sequence[:, 0]
    y = sequence[:, 1]
    t = sequence[:, 2]
    
    # Features 1-2: Coordenadas suavizadas
    features[:, 0] = x
    features[:, 1] = y
    
    # Calcular dt (en segundos)
    dt = np.diff(t) / 1000.0  # milisegundos a segundos
    dt[dt == 0] = 0.001  # Evitar división por cero
    
    # Features 3-4: Velocidad con diferencias centrales
    vx = np.zeros(n)
    vy = np.zeros(n)
    
    # Diferencias centrales (interior)
    for i in range(1, n - 1):
        dt_avg = (dt[i-1] + dt[i]) / 2.0
        vx[i] = (x[i+1] - x[i-1]) / (2 * dt_avg) if dt_avg > 0 else 0
        vy[i] = (y[i+1] - y[i-1]) / (2 * dt_avg) if dt_avg > 0 else 0
    
    # Bordes: diferencias hacia adelante/atrás
    if n > 1:
        vx[0] = (x[1] - x[0]) / dt[0] if dt[0] > 0 else 0
        vy[0] = (y[1] - y[0]) / dt[0] if dt[0] > 0 else 0
        vx[-1] = (x[-1] - x[-2]) / dt[-1] if dt[-1] > 0 else 0
        vy[-1] = (y[-1] - y[-2]) / dt[-1] if dt[-1] > 0 else 0
    
    features[:, 2] = vx
    features[:, 3] = vy
    
    return features


def normalize_features(features: np.ndarray) -> np.ndarray:
    """
    Normalización por feature según el tipo:
    - x, y: Min-Max a [0, 1]
    - vx, vy: Z-score
    
    Args:
        features: Array (n, 4) sin normalizar
        
    Returns:
        np.ndarray: Features normalizadas (n, 4)
    """
    normalized = features.copy()
    
    # Features 0-1: x, y - Min-Max a [0, 1]
    for i in [0, 1]:
        min_val = features[:, i].min()
        max_val = features[:, i].max()
        if max_val > min_val:
            normalized[:, i] = (features[:, i] - min_val) / (max_val - min_val)
    
    # Features 2-3: vx, vy - Z-score
    for i in [2, 3]:
        mean_val = features[:, i].mean()
        std_val = features[:, i].std()
        if std_val > 0:
            normalized[:, i] = (features[:, i] - mean_val) / std_val
    
    return normalized


def validate_normalization(features: np.ndarray):
    """
    Validar que la normalización se hizo correctamente
    Lanza excepción si hay problemas
    
    Args:
        features: Array (n, 4) normalizado
    """
    # Coordenadas en [0, 1] (con margen de tolerancia)
    assert features[:, :2].min() >= -0.01, f"x/y min too low: {features[:, :2].min()}"
    assert features[:, :2].max() <= 1.01, f"x/y max too high: {features[:, :2].max()}"
    
    # Z-score features (vx, vy): ~95% en [-3, 3]
    z_features = features[:, [2, 3]]
    z_mean = np.abs(z_features).mean()
    assert z_mean < 2.5, f"Z-score mean too high: {z_mean}"
    
    # Sin NaN/Inf
    assert not np.any(np.isnan(features)), "Features contain NaN"
    assert not np.any(np.isinf(features)), "Features contain Inf"
    
    logger.info("✓ Normalization validation passed")


def intelligent_truncate(sequence: np.ndarray, target: int = 400) -> Tuple[np.ndarray, List[int]]:
    """
    Truncado inteligente eliminando warm-up y lifting
    
    Args:
        sequence: Array (n, 4) con features
        target: Longitud objetivo (default 400)
        
    Returns:
        Tuple[np.ndarray, List[int]]: 
            - Secuencia truncada
            - Índices válidos
    """
    n = len(sequence)
    
    if n <= target:
        return sequence, list(range(n))
    
    # Detectar warm-up dinámicamente calculando magnitud de velocidad: sqrt(vx^2 + vy^2)
    velocities = np.sqrt(sequence[:, 2]**2 + sequence[:, 3]**2)
    
    # Warm-up: hasta que velocidad supera 20% del máximo
    max_velocity = velocities.max()
    if max_velocity > 0:
        warmup_threshold = 0.2 * max_velocity
        warmup_end = np.argmax(velocities > warmup_threshold)
    else:
        warmup_end = 0
    
    # Lifting: últimos 5%
    lifting_start = int(n * 0.95)
    
    # Región válida (excluir warm-up y lifting)
    valid = sequence[warmup_end:lifting_start]
    
    if len(valid) > target:
        # Tomar ventana central
        center = len(valid) // 2
        half = target // 2
        start_idx = max(0, center - half)
        end_idx = start_idx + target
        
        # Ajustar si nos pasamos del final
        if end_idx > len(valid):
            end_idx = len(valid)
            start_idx = end_idx - target
        
        truncated = valid[start_idx:end_idx]
        indices = list(range(warmup_end + start_idx, warmup_end + end_idx))
        
        logger.info(f"Truncated {n} -> {len(truncated)} (removed warm-up: {warmup_end}, lifting: {n-lifting_start})")
        return truncated, indices
    
    indices = list(range(warmup_end, lifting_start))
    return valid, indices


def apply_padding_with_mask(sequence: np.ndarray, target_length: int = 400) -> Tuple[np.ndarray, np.ndarray]:
    """
    Padding final con máscara
    
    Args:
        sequence: Array (n, 4) con features
        target_length: Longitud objetivo (default 400)
        
    Returns:
        Tuple[np.ndarray, np.ndarray]:
            - Secuencia con padding (target_length, 4)
            - Máscara (target_length,): 1 para reales, 0 para padding
    """
    n = len(sequence)
    
    if n >= target_length:
        return sequence[:target_length], np.ones(target_length)
    
    # Crear array con padding de zeros
    padded = np.zeros((target_length, sequence.shape[1]))
    padded[:n] = sequence
    
    # Crear máscara: 1 para puntos reales, 0 para padding
    mask = np.zeros(target_length)
    mask[:n] = 1
    
    logger.info(f"Applied padding: {n} -> {target_length} points")
    return padded, mask
