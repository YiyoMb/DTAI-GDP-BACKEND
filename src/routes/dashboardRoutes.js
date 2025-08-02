// File: backend/src/routes/dashboardRoutes.js
const express = require('express');
const { query } = require('express-validator');
const {
    getDashboardData,
    getGeneralSummaryController,
    getDistributionsController,
    getAlertsController,
    getPerformanceController
} = require('../controllers/dashboardController');
const { handleValidationErrors } = require('../middlewares/validationMiddleware');
const authMiddleware = require('../middlewares/authMiddleware');
const { checkRole } = require('../middlewares/roleMiddleware');

const router = express.Router();

// Middleware para proteger todas las rutas del dashboard
// Solo usuarios autenticados pueden acceder
router.use(authMiddleware);

// Solo Superadministradores y Administradores pueden ver dashboards
router.use(checkRole(['Superadministrador', 'Administrador']));

/**
 * GET /api/v1/dashboard
 * Obtiene el dashboard completo con todas las métricas
 *
 * Respuesta incluye:
 * - Resumen general (totales y porcentajes)
 * - Distribuciones para gráficos
 * - Alertas (tareas vencidas)
 * - Actividad reciente
 * - Metadata del dashboard
 */
router.get('/', getDashboardData);

/**
 * GET /api/v1/dashboard/summary
 * Obtiene solo el resumen general del sistema
 *
 * Útil para:
 * - Widgets pequeños
 * - Actualizaciones rápidas
 * - Headers con estadísticas básicas
 */
router.get('/summary', getGeneralSummaryController);

/**
 * GET /api/v1/dashboard/distributions
 * Obtiene distribuciones para gráficos
 *
 * Query params opcionales:
 * - tipo: 'proyectos' | 'tareas' | 'riesgo' | 'tipos'
 *
 * Ejemplos:
 * - /dashboard/distributions (todos los gráficos)
 * - /dashboard/distributions?tipo=proyectos (solo distribución de proyectos)
 * - /dashboard/distributions?tipo=tareas (solo distribución de tareas)
 */
router.get('/distributions',
    query('tipo')
        .optional()
        .isIn(['proyectos', 'tareas', 'riesgo', 'tipos'])
        .withMessage('Tipo debe ser: proyectos, tareas, riesgo o tipos'),
    handleValidationErrors,
    getDistributionsController
);

/**
 * GET /api/v1/dashboard/alerts
 * Obtiene alertas críticas del sistema
 *
 * Incluye:
 * - Tareas vencidas categorizadas por severidad
 * - Conteos de alertas por tipo
 *
 * Útil para:
 * - Notificaciones push
 * - Badges de alerta
 * - Widgets de atención urgente
 */
router.get('/alerts', getAlertsController);

/**
 * GET /api/v1/dashboard/performance
 * Obtiene métricas de rendimiento por portafolio
 *
 * Incluye:
 * - Estadísticas por portafolio
 * - Top 3 portafolios con mejor rendimiento
 * - Porcentajes de completitud
 *
 * Útil para:
 * - Comparativas de rendimiento
 * - Reportes ejecutivos
 * - Análisis de productividad
 */
router.get('/performance', getPerformanceController);

module.exports = router;