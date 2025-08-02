// File: backend/src/routes/notificationRoutes.js
const express = require('express');
const { body, param, query } = require('express-validator');
const {
    getMyNotifications,
    getUnreadCount,
    getUnreadNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotificationController,
    deleteAllRead,
    getNotificationTypes,
    createManualNotification,
    runScheduledNotificationsController,
    getNotificationStats
} = require('../controllers/notificationController');
const { handleValidationErrors } = require('../middlewares/validationMiddleware');
const authMiddleware = require('../middlewares/authMiddleware');
const { checkRole } = require('../middlewares/roleMiddleware');

const router = express.Router();

// ===== MIDDLEWARE GLOBAL =====
// Todas las rutas de notificaciones requieren autenticación
router.use(authMiddleware);

// ===== RUTAS PARA TODOS LOS USUARIOS AUTENTICADOS =====

/**
 * GET /api/v1/notifications
 * Obtiene las notificaciones del usuario con paginación y filtros
 *
 * Query params opcionales:
 * - page: número de página (default: 1)
 * - limit: elementos por página (default: 20, max: 100)
 * - leida: true/false para filtrar por estado de lectura
 * - tipo_codigo: filtrar por tipo específico (ej: 'TASK_ASSIGNED')
 * - id_proyecto: filtrar por proyecto específico
 * - fecha_desde: fecha desde (YYYY-MM-DD)
 * - fecha_hasta: fecha hasta (YYYY-MM-DD)
 */
router.get('/',
    query('page').optional().isInt({ min: 1 }).withMessage('Página debe ser un número mayor a 0'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Límite debe ser entre 1 y 100'),
    query('leida').optional().isBoolean().withMessage('Leída debe ser true o false'),
    query('tipo_codigo').optional().isLength({ min: 1, max: 50 }).withMessage('Tipo código inválido'),
    query('id_proyecto').optional().isInt({ min: 1 }).withMessage('ID de proyecto debe ser un número válido'),
    query('fecha_desde').optional().isDate().withMessage('Fecha desde debe ser válida (YYYY-MM-DD)'),
    query('fecha_hasta').optional().isDate().withMessage('Fecha hasta debe ser válida (YYYY-MM-DD)'),
    handleValidationErrors,
    getMyNotifications
);

/**
 * GET /api/v1/notifications/unread-count
 * Obtiene el conteo de notificaciones no leídas
 *
 * Útil para:
 * - Badges de notificación
 * - Indicadores en el header
 * - Actualizaciones periódicas
 */
router.get('/unread-count', getUnreadCount);

/**
 * GET /api/v1/notifications/unread
 * Obtiene solo las notificaciones no leídas (limitadas)
 *
 * Query params opcionales:
 * - limit: cantidad máxima a retornar (default: 10, max: 50)
 *
 * Útil para:
 * - Dropdowns de notificaciones
 * - Previews rápidos
 * - Widgets de notificaciones
 */
router.get('/unread',
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Límite debe ser entre 1 y 50'),
    handleValidationErrors,
    getUnreadNotifications
);

/**
 * PUT /api/v1/notifications/:id/read
 * Marca una notificación específica como leída
 *
 * Útil cuando el usuario hace clic en una notificación específica
 */
router.put('/:id/read',
    param('id').isInt({ min: 1 }).withMessage('ID de notificación debe ser un número válido'),
    handleValidationErrors,
    markAsRead
);

/**
 * PUT /api/v1/notifications/mark-all-read
 * Marca todas las notificaciones del usuario como leídas
 *
 * Útil para el botón "Marcar todas como leídas"
 */
router.put('/mark-all-read', markAllAsRead);

/**
 * DELETE /api/v1/notifications/:id
 * Elimina una notificación específica
 */
router.delete('/:id',
    param('id').isInt({ min: 1 }).withMessage('ID de notificación debe ser un número válido'),
    handleValidationErrors,
    deleteNotificationController
);

/**
 * DELETE /api/v1/notifications/read
 * Elimina todas las notificaciones leídas del usuario
 *
 * Útil para "limpiar" notificaciones antiguas
 */
router.delete('/read', deleteAllRead);

// ===== RUTAS INFORMATIVAS (Para todos los usuarios) =====

/**
 * GET /api/v1/notifications/types
 * Obtiene todos los tipos de notificación disponibles
 *
 * Útil para:
 * - Filtros en el frontend
 * - Configuración de preferencias
 * - Documentación de la API
 */
router.get('/types', getNotificationTypes);

// ===== RUTAS ADMINISTRATIVAS =====
// Solo Superadministradores y Administradores

/**
 * POST /api/v1/notifications
 * Crea una notificación manual
 *
 * Solo para casos especiales donde se necesita crear una notificación
 * manualmente (ej: anuncios del sistema, mantenimiento, etc.)
 */
router.post('/',
    checkRole(['Superadministrador', 'Administrador']),
    body('id_usuario')
        .isInt({ min: 1 })
        .withMessage('ID de usuario debe ser un número válido'),
    body('tipo_codigo')
        .isLength({ min: 1, max: 50 })
        .withMessage('Tipo código es requerido y debe tener máximo 50 caracteres'),
    body('mensaje')
        .isLength({ min: 1, max: 1000 })
        .withMessage('Mensaje es requerido y debe tener máximo 1000 caracteres'),
    body('enlace_accion')
        .optional()
        .isLength({ max: 512 })
        .withMessage('Enlace de acción debe tener máximo 512 caracteres'),
    body('id_proyecto')
        .optional()
        .isInt({ min: 1 })
        .withMessage('ID de proyecto debe ser un número válido'),
    body('id_tarea')
        .optional()
        .isInt({ min: 1 })
        .withMessage('ID de tarea debe ser un número válido'),
    body('id_documento')
        .optional()
        .isInt({ min: 1 })
        .withMessage('ID de documento debe ser un número válido'),
    handleValidationErrors,
    createManualNotification
);

/**
 * POST /api/v1/notifications/run-scheduled
 * Ejecuta manualmente las notificaciones programadas
 *
 * Útil para:
 * - Debugging
 * - Ejecutar notificaciones fuera del horario programado
 * - Testing del sistema
 */
router.post('/run-scheduled',
    checkRole(['Superadministrador', 'Administrador']),
    runScheduledNotificationsController
);

/**
 * GET /api/v1/notifications/stats
 * Obtiene estadísticas del sistema de notificaciones
 *
 * Funcionalidad futura para dashboard administrativo
 */
router.get('/stats',
    checkRole(['Superadministrador', 'Administrador']),
    getNotificationStats
);

module.exports = router;