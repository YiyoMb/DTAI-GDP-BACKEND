// File: backend/src/controllers/notificationController.js
const {
    getAllNotificationTypes,
    getUserNotifications,
    getUnreadNotificationsCount,
    createNotification,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification,
    deleteReadNotifications
} = require('../models/notificationModel');

const {
    runScheduledNotifications
} = require('../services/notificationService');

const { AppError } = require('../utils/errorHandler');

// ===== OBTENER NOTIFICACIONES DEL USUARIO =====

/**
 * Obtiene las notificaciones del usuario autenticado con paginación y filtros
 * GET /api/v1/notifications
 */
const getMyNotifications = async (req, res, next) => {
    try {
        const { id: userId } = req.user;
        const {
            page = 1,
            limit = 20,
            leida = undefined, // undefined = todas, true = leídas, false = no leídas
            tipo_codigo = undefined,
            id_proyecto = undefined,
            fecha_desde = undefined,
            fecha_hasta = undefined
        } = req.query;

        // Validar y convertir parámetros
        const filters = {};
        if (leida !== undefined) filters.leida = leida === 'true';
        if (tipo_codigo) filters.tipo_codigo = tipo_codigo;
        if (id_proyecto) filters.id_proyecto = parseInt(id_proyecto);
        if (fecha_desde) filters.fecha_desde = fecha_desde;
        if (fecha_hasta) filters.fecha_hasta = fecha_hasta;

        const result = await getUserNotifications(
            userId,
            filters,
            parseInt(page),
            parseInt(limit)
        );

        res.status(200).json({
            success: true,
            message: 'Notificaciones obtenidas exitosamente',
            data: result.notifications,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(result.total / parseInt(limit)),
                totalItems: result.total,
                itemsPerPage: parseInt(limit),
                hasNextPage: parseInt(page) < Math.ceil(result.total / parseInt(limit)),
                hasPreviousPage: parseInt(page) > 1
            }
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Obtiene el conteo de notificaciones no leídas del usuario
 * GET /api/v1/notifications/unread-count
 */
const getUnreadCount = async (req, res, next) => {
    try {
        const { id: userId } = req.user;

        const count = await getUnreadNotificationsCount(userId);

        res.status(200).json({
            success: true,
            message: 'Conteo de notificaciones no leídas obtenido exitosamente',
            data: {
                unread_count: count,
                has_unread: count > 0
            }
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Obtiene solo las notificaciones no leídas (útil para widgets o badges)
 * GET /api/v1/notifications/unread
 */
const getUnreadNotifications = async (req, res, next) => {
    try {
        const { id: userId } = req.user;
        const { limit = 10 } = req.query;

        const result = await getUserNotifications(
            userId,
            { leida: false }, // Solo no leídas
            1, // Primera página
            parseInt(limit)
        );

        res.status(200).json({
            success: true,
            message: 'Notificaciones no leídas obtenidas exitosamente',
            data: {
                notifications: result.notifications,
                total_unread: result.total,
                showing: result.notifications.length
            }
        });

    } catch (error) {
        next(error);
    }
};

// ===== MARCAR COMO LEÍDAS =====

/**
 * Marca una notificación específica como leída
 * PUT /api/v1/notifications/:id/read
 */
const markAsRead = async (req, res, next) => {
    try {
        const { id: notificationId } = req.params;
        const { id: userId } = req.user;

        const result = await markNotificationAsRead(notificationId, userId);

        if (result.affectedRows === 0) {
            return next(new AppError('Notificación no encontrada o no tienes permisos para modificarla', 404));
        }

        res.status(200).json({
            success: true,
            message: 'Notificación marcada como leída',
            data: {
                notification_id: notificationId,
                marked_as_read: true
            }
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Marca todas las notificaciones del usuario como leídas
 * PUT /api/v1/notifications/mark-all-read
 */
const markAllAsRead = async (req, res, next) => {
    try {
        const { id: userId } = req.user;

        const result = await markAllNotificationsAsRead(userId);

        res.status(200).json({
            success: true,
            message: 'Todas las notificaciones marcadas como leídas',
            data: {
                notifications_updated: result.affectedRows,
                all_marked_as_read: true
            }
        });

    } catch (error) {
        next(error);
    }
};

// ===== ELIMINAR NOTIFICACIONES =====

/**
 * Elimina una notificación específica
 * DELETE /api/v1/notifications/:id
 */
const deleteNotificationController = async (req, res, next) => {
    try {
        const { id: notificationId } = req.params;
        const { id: userId } = req.user;

        const result = await deleteNotification(notificationId, userId);

        if (result.affectedRows === 0) {
            return next(new AppError('Notificación no encontrada o no tienes permisos para eliminarla', 404));
        }

        res.status(200).json({
            success: true,
            message: 'Notificación eliminada exitosamente',
            data: {
                notification_id: notificationId,
                deleted: true
            }
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Elimina todas las notificaciones leídas del usuario
 * DELETE /api/v1/notifications/read
 */
const deleteAllRead = async (req, res, next) => {
    try {
        const { id: userId } = req.user;

        const result = await deleteReadNotifications(userId);

        res.status(200).json({
            success: true,
            message: 'Notificaciones leídas eliminadas exitosamente',
            data: {
                notifications_deleted: result.affectedRows,
                cleanup_completed: true
            }
        });

    } catch (error) {
        next(error);
    }
};

// ===== ADMINISTRACIÓN (Solo para Superadmin/Admin) =====

/**
 * Obtiene todos los tipos de notificación disponibles
 * GET /api/v1/notifications/types
 */
const getNotificationTypes = async (req, res, next) => {
    try {
        const types = await getAllNotificationTypes();

        res.status(200).json({
            success: true,
            message: 'Tipos de notificación obtenidos exitosamente',
            data: {
                types,
                total: types.length
            }
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Crea una notificación manualmente (solo para administradores)
 * POST /api/v1/notifications
 */
const createManualNotification = async (req, res, next) => {
    try {
        const {
            id_usuario,
            tipo_codigo,
            mensaje,
            enlace_accion = null,
            id_proyecto = null,
            id_tarea = null,
            id_documento = null
        } = req.body;

        const result = await createNotification({
            id_usuario,
            tipo_codigo,
            mensaje,
            enlace_accion,
            id_proyecto,
            id_tarea,
            id_documento
        });

        res.status(201).json({
            success: true,
            message: 'Notificación creada exitosamente',
            data: {
                notification_id: result.insertId,
                recipient_user_id: id_usuario,
                tipo_codigo
            }
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Ejecuta manualmente las notificaciones programadas (solo para administradores)
 * POST /api/v1/notifications/run-scheduled
 */
const runScheduledNotificationsController = async (req, res, next) => {
    try {
        console.log(`🚀 Ejecutando notificaciones programadas manualmente por usuario ${req.user.id}`);

        const results = await runScheduledNotifications();

        res.status(200).json({
            success: true,
            message: 'Notificaciones programadas ejecutadas exitosamente',
            data: results
        });

    } catch (error) {
        next(error);
    }
};

// ===== ESTADÍSTICAS (Para dashboard de admin) =====

/**
 * Obtiene estadísticas de notificaciones del sistema
 * GET /api/v1/notifications/stats
 */
const getNotificationStats = async (req, res, next) => {
    try {
        // Esta funcionalidad se puede expandir en el futuro
        // Por ahora retornamos un placeholder
        res.status(200).json({
            success: true,
            message: 'Estadísticas de notificaciones (funcionalidad futura)',
            data: {
                feature: 'coming_soon',
                description: 'Las estadísticas detalladas estarán disponibles en una futura versión'
            }
        });

    } catch (error) {
        next(error);
    }
};

module.exports = {
    // Obtener notificaciones del usuario
    getMyNotifications,
    getUnreadCount,
    getUnreadNotifications,

    // Marcar como leídas
    markAsRead,
    markAllAsRead,

    // Eliminar notificaciones
    deleteNotificationController,
    deleteAllRead,

    // Administración
    getNotificationTypes,
    createManualNotification,
    runScheduledNotificationsController,

    // Estadísticas
    getNotificationStats
};