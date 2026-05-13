const mongoose = require('mongoose');
const logger = require('./logger');

const connectMongo = async () => {
  try {
    // Definimos la URI por entorno; por defecto a mfa_biometric local
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/mfa_biometric';
    
    await mongoose.connect(mongoUri);
    logger.info('📦 Conexión a MongoDB (Biometría) establecida correctamente');
  } catch (error) {
    logger.error('🚨 Error conectando a MongoDB:', error.message);
    // No detenemos todo el proceso si Mongo falla porque Postgres podría seguir funcionando, 
    // pero idealmente deberíamos monitorear este error.
  }
};

module.exports = connectMongo;
