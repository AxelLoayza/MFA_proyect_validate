const axios = require('axios');
const BiometricProfile = require('../models/biometric.mongo.model');
const { encryptBiometric } = require('../utils/crypto.util');

// URL del microservicio de Python (FastAPI) donde se procesa la biometría
// Mapea al puerto 8000 por defecto que hemos venido manejando
const PYTHON_SERVICE_URL = process.env.CLOUD_SERVICE_URL || 'http://localhost:8000';

/**
 * Función central del Orquestador.
 * Toma las 5 firmas crudas de un usuario, pide a Python que cree el Feature Maestro,
 * lo encripta y lo resguarda de manera segura en MongoDB.
 * 
 * @param {Number} userId - ID del usuario de la base de datos relacional (PostgreSQL)
 * @param {Array} signatures - Arreglo con las 5 firmas (puntos, duración, etc.)
 * @returns {Object} - Respuesta de éxito o error
 */
async function enrollUserBiometrics(userId, signatures, tenantContext = {}) {
    try {
        console.log(`[Orquestador] Iniciando enrolamiento biométrico para usuario ID: ${userId}`);
        console.log(`[Orquestador] Firmas recibidas: ${signatures.length}`);

        if (!signatures || signatures.length === 0) {
            throw new Error("No se proporcionaron firmas para el enrolamiento.");
        }

        const ML_USERNAME = process.env.ML_SERVICE_USERNAME || 'bmfa_user';
        const ML_PASSWORD = process.env.ML_SERVICE_PASSWORD || 'your_secure_password_here';
        const token = Buffer.from(`${ML_USERNAME}:${ML_PASSWORD}`, 'utf8').toString('base64');

        // 1. Enviar las firmas a FastAPI (Python) para generar el Feature Maestro
        // Nota: La estructura del payload debe coincidir con lo que espera EnrollmentCloudRequest en Python
        const response = await axios.post(`${PYTHON_SERVICE_URL}/api/biometric/enroll`, {
            signatures: signatures 
        }, {
            headers: {
                'Authorization': `Basic ${token}`,
                'Content-Type': 'application/json'
            }
        });

        // 2. Extraer el feature maestro generado por el motor matemático
        const masterFeature = response.data.master_feature;

        if (!masterFeature) {
            throw new Error("El servicio de Python no devolvió un master_feature válido.");
        }

        console.log(`[Orquestador] Feature maestro generado por Python exitosamente.`);

        // 3. Encriptar el Feature Maestro completo para guardarlo protegido
        const { encryptedData, iv, authTag } = encryptBiometric(masterFeature);

        // 4. Guardar (o actualizar) en MongoDB mediante el modelo de Mongoose
        // Usamos findOneAndUpdate con 'upsert: true' por si el usuario está rehaciendo sus firmas,
        // esto sobrescribirá el modelo viejo en lugar de duplicarlo.
        const tenantId = tenantContext.tenantId;
        const tenantKey = tenantContext.tenantKey;

        if (!tenantId && !tenantKey) {
            throw new Error("tenantId o tenantKey es requerido para guardar biometria multi-tenant.");
        }

        const profile = await BiometricProfile.findOneAndUpdate(
            { userId: String(userId), ...(tenantId ? { tenantId } : { tenantKey }) },
            {
                userId: String(userId),
                tenantId,
                tenantKey,
                masterFeatureEncrypted: encryptedData,
                iv: iv,
                authTag: authTag,
                samplesUsed: signatures.length,
                modelVersion: 'lstm_mini_v1',
                lastUpdated: new Date()
            },
            { upsert: true, new: true } // crea si no existe, actualiza si ya existía
        );

        console.log(`[Orquestador] ✅ Biometría encriptada y resguardada en Mongo para el usuario ID: ${userId}`);

        return {
            success: true,
            message: "Enrolamiento biométrico completado y asegurado exitosamente.",
            profileId: profile._id
        };

    } catch (error) {
        console.error("🚨 [Orquestador Error] Falla en el enrolamiento:", error.message);
        
        // Lanzamos el error para que el 'Node Cliente' se lo notifique a Flutter
        throw error;
    }
}

module.exports = {
    enrollUserBiometrics
};
