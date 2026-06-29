function requireArc(level) {
  return (req, res, next) => {
    const userArc = parseFloat(req.user.arc || 0);
    if (userArc < parseFloat(level)) {
      return res.status(403).json({
        error: `Se requiere ARC ${level} para acceder a este recurso`,
      });
    }
    next();
  };
}

module.exports = { requireArc };
