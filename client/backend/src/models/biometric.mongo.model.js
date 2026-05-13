const mongoose = require('mongoose');

const BiometricSchema = new mongoose.Schema({
  // Relación con el ID del usuario en PostgreSQL
  userId: {
    type: Number, // Asumiendo que el ID en Postgres es numérico (SERIAL/INTEGER)
    required: true,
    unique: true,
    index: true
  },
  // El "Feature Maestro" encriptado con AES-256-GCM
  masterFeatureEncrypted: {
    type: String,
    required: true
  },
  // Vector de Inicialización (necesario para desencriptar)
  iv: {
    type: String,
    required: true
  },
  // Etiqueta de Autenticación de GCM (garantiza que no haya sido alterado en BD)
  authTag: {
    type: String,
    required: true
  },
  // Número de firmas utilizadas para generar este Master Feature
  samplesUsed: {
    type: Number,
    default: 5
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true // Crea createdAt y updatedAt
});

module.exports = mongoose.model('BiometricProfile', BiometricSchema);
