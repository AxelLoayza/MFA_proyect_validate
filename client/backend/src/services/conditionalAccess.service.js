// src/services/conditionalAccess.service.js
const policyModel = require('../models/policy.model');
const logger = require('../config/logger');

/**
 * getRequiredArcForResource:
 *  - resourceName: string (ej. 'sensitive_api' o policy name)
 *  - retorna multiplicador o valor 'arc' requerido (p.ej. '0.5' o '1.0')
 *
 * En esta emulación consultamos la tabla policies por name; si no existe devolvemos '0.5' por defecto.
 */
async function getRequiredArcForResource(resourceName) {
  try {
    const policy = await policyModel.getPolicyByName(resourceName);
    if (!policy) {
      logger.info(`No policy found for ${resourceName}, default arc 0.5`);
      return '0.5';
    }
    return String(policy.acr_required);
  } catch (err) {
    logger.error('conditionalAccess.getRequiredArcForResource error:', err.message);
    return '0.5';
  }
}

/**
 * evaluateAccess:
 *  - userArc: string/number (valor actual en token)
 *  - resourceName: string
 *  - retorna boolean (allowed) y reason
 */
async function evaluateAccess(userArc, resourceName) {
  const requiredArc = await getRequiredArcForResource(resourceName);
  const userArcNum = parseFloat(userArc || 0);
  const requiredArcNum = parseFloat(requiredArc || 0.5);

  const allowed = userArcNum >= requiredArcNum;
  const reason = allowed ? 'allowed' : `required_arc=${requiredArc}, user_arc=${userArc}`;
  logger.info(`conditionalAccess evaluate: resource=${resourceName} allowed=${allowed}`);
  return { allowed, requiredArc, reason };
}

module.exports = { getRequiredArcForResource, evaluateAccess };
