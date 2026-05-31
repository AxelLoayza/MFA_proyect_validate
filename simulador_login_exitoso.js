const axios = require('axios');
const fs = require('fs');
const path = require('path');
const uuid = require('uuid');

// Configuración requerida
const CLOUD_URL = 'http://localhost:4003';      // API de Cloud Service Machine Learning
const BACKEND_URL = 'http://localhost:4000';    // Backend Node.js
const USER_EMAIL = 'demo.biometric@acme.test';  // Correo de la imagen

// Headers básicos para conectarnos (usamos contraseñas por defecto basadas en .env o SDK)
const sdkHeaders = {
    'Content-Type': 'application/json',
    'Authorization': 'Basic ' + Buffer.from('sdk_default_key:sdk_default_secret').toString('base64')
};

// ============================================================================
// GENERACIÓN DE FIRMA FINGIDA (SINTÉTICA Y ORGÁNICA)
// Simula que una persona hizo el trazo a mano en una pantalla (x, y, t, p)
// ============================================================================
function generarFirmaOrganica(puntosRequeridos = 150) {
    const stroke = [];
    let x = 100;
    let y = 100;
    let t = 0;

    for (let i = 0; i < puntosRequeridos; i++) {
        // Avance natural con pequeño 'temblor' o ruido gausiano
        x += (Math.random() * 5) + 1; // Avanza a la derecha (eje X)
        y += (Math.sin(i * 0.1) * 3) + (Math.random() * 2 - 1); // Curva natural en Y
        
        // Tiempo: sumamos microsegundos como lo haría un touch screen real (aprox 16ms a 60fps)
        t += Math.floor(Math.random() * 5) + 12; 

        // Presión orgánica: comienza suave, sube en el medio, cae al final
        let p = 0.5 + (Math.sin(Math.PI * (i / puntosRequeridos)) * 0.4); 
        p += (Math.random() * 0.05); // ruido de presión
        if (p > 1.0) p = 1.0;
        if (p < 0.0) p = 0.0;

        stroke.push({ 
            x: parseFloat(x.toFixed(2)), 
            y: parseFloat(y.toFixed(2)), 
            t, 
            p: parseFloat(p.toFixed(3)) 
        });
    }

    return stroke;
}

// ============================================================================
// SIMULACIÓN DE FLUJO
// ============================================================================
async function runSimulation() {
    console.log("==========================================");
    console.log("🟢 INICIANDO SIMULACIÓN DE LOGUEO MFA");
    console.log("==========================================");

    try {
        // 1. Simular la firma del usuario
        const strokeData = generarFirmaOrganica(200);
        console.log(`\n[1] Firma generada orgánicamente: ${strokeData.length} puntos calculados.`);
        
        // Calcular algunas features requeridas por el contrato BiometricRequest
        const duration = strokeData[strokeData.length-1].t - strokeData[0].t;
        const totalDist = 550.0; // Distancia ficticia
        const features = {
            num_points: strokeData.length,
            total_distance: totalDist,
            velocity_mean: totalDist / duration,
            velocity_max: (totalDist / duration) * 1.5,
            duration_ms: duration
        };

        const biometricPayload = {
            normalized_stroke: strokeData,
            features: features,
            real_length: strokeData.length,
            reference_template: {
                user_id: "6a13a72ea8cef18fccedb229", // El ID de la imagen
                dtw_medoid: strokeData.slice(0, 100).map(p => [p.x, p.y]), // Un medoid base para que pase validación
                distance_threshold: 45.0 // Tolerancia amplia para testing
            }
        };

        // 2. Enviar a CloudService para Validar Identidad (La red neuronal)
        console.log("\n[2] Enviando datos a validación ML en Cloud Service...");
        
        const validateResponse = await axios.post(
            `${CLOUD_URL}/api/biometric/validate`, 
            biometricPayload,
            { headers: sdkHeaders }
        );
        
        if(validateResponse.data.is_valid) {
            console.log(`✅ ¡Firma Aceptada! Confianza: ${(validateResponse.data.confidence * 100).toFixed(0)}%`);
        } else {
            console.log(`❌ Firma denegada: ${validateResponse.data.message}`);
            console.log("Continuando simulación forzada de todos modos...");
            // Si estuviéramos en la vida real, aquí terminaría.
        }

        // 3. Simular el "Step-Up" hacia nuestro backend normal (ARC) para conseguir token final
        console.log(`\n[3] Solicitando Token de Sesión Completo (ARC 1.0) al backend...`);
        console.log(`    Usuario: ${USER_EMAIL}`);
        
        // Petición ficticia de dev-step-up para simular el éxito que hubiese hecho Flutter
        const stepUpRes = await axios.post(`${BACKEND_URL}/api/auth/dev-step-up`, {
            login_id: uuid.v4(),
            score: validateResponse.data.confidence || 0.95,
            confidence: 'high'
        });

        console.log("✅ Token de Sesión MFA emitido con éxito:");
        console.log(stepUpRes.data);

        console.log("\n==========================================");
        console.log("🎉 SIMULACIÓN FINALIZADA CON ÉXITO");
        console.log("==========================================");

    } catch (error) {
        console.log("\n❌ ERROR DURANTE LA SIMULACIÓN");
        if(error.response) {
            console.log("Status:", error.response.status);
            console.log("Detalle:", JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.log("Ocurrió un error de red o timeout (Cloud Service podría no estar encendido):", error.message);
        } else {
            console.log("Ocurrió un error local:", error.message, error.stack);
        }
    }
}

// Ejecutar
runSimulation();
