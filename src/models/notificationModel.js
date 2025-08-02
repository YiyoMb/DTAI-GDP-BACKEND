// File: backend/src/models/notificationModel.js
const { executeQuery } = require('../config/database');

// ===== GESTIÓN DE TIPOS DE NOTIFICACIÓN =====

/**
 * Obtiene todos los tipos de notificación activos
 * @returns {Array} Lista de tipos de notificación
 */
const getAllNotificationTypes = async () => {
    const query = `
        SELECT id, tipo_codigo, nombre_tipo, descripcion, icono, color, activo
        FROM Tipos_Notificacion
        WHERE activo = TRUE
        ORDER BY nombre_tipo ASC
    `;
    return await executeQuery(query);
};

/**
 * Obtiene un tipo de notificación por su código
 * @param {string} tipoCodigo - Código del tipo (ej: 'TASK_ASSIGNED')
 * @returns {Object|null} Tipo de notificación o null si no existe
 */
const getNotificationTypeByCode = async (tipoCodigo) => {
    const query = `
        SELECT id, tipo_codigo, nombre_tipo, descripcion, icono, color
        FROM Tipos_Notificacion
        WHERE tipo_codigo = ? AND activo = TRUE
    `;
    const result = await executeQuery(query, [tipoCodigo]);
    return result[0] || null;
};

// ===== CRUD DE NOTIFICACIONES =====

/**
 * Obtiene notificaciones de un usuario con paginación y filtros
 * @param {number} userId - ID del usuario
 * @param {Object} filters - Filtros opcionales
 * @param {number} page - Página actual
 * @param {number} limit - Límite por página
 * @returns {Object} {notifications: Array, total: number}
 */
const getUserNotifications = async (userId, filters = {}, page = 1, limit = 20) => {
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE n.id_usuario = ?';
    let params = [userId];

    // Aplicar filtros opcionales
    if (filters.leida !== undefined) {
        whereClause += ' AND n.leida = ?';
        params.push(filters.leida);
    }

    if (filters.tipo_codigo) {
        whereClause += ' AND tn.tipo_codigo = ?';
        params.push(filters.tipo_codigo);
    }

    if (filters.id_proyecto) {
        whereClause += ' AND n.id_proyecto = ?';
        params.push(filters.id_proyecto);
    }

    if (filters.fecha_desde) {
        whereClause += ' AND DATE(n.fecha_creacion) >= ?';
        params.push(filters.fecha_desde);
    }

    if (filters.fecha_hasta) {
        whereClause += ' AND DATE(n.fecha_creacion) <= ?';
        params.push(filters.fecha_hasta);
    }

    // Consulta principal con información completa
    const query = `
        SELECT 
            n.id,
            n.mensaje,
            n.fecha_creacion,
            n.leida,
            n.enlace_accion,
            n.id_proyecto,
            n.id_tarea,
            n.id_documento,
            tn.tipo_codigo,
            tn.nombre_tipo,
            tn.icono,
            tn.color,
            p.nombre as proyecto_nombre,
            t.nombre as tarea_nombre,
            d.nombre_documento
        FROM Notificaciones n
        LEFT JOIN Tipos_Notificacion tn ON n.id_tipo_notificacion = tn.id
        LEFT JOIN Proyectos p ON n.id_proyecto = p.id
        LEFT JOIN Tareas t ON n.id_tarea = t.id
        LEFT JOIN Documentos d ON n.id_documento = d.id
        ${whereClause}
        ORDER BY n.fecha_creacion DESC
        LIMIT ? OFFSET ?
    `;

    // Consulta para contar total
    const countQuery = `
        SELECT COUNT(*) as total
        FROM Notificaciones n
        LEFT JOIN Tipos_Notificacion tn ON n.id_tipo_notificacion = tn.id
        ${whereClause}
    `;

    const [notifications, countResult] = await Promise.all([
        executeQuery(query, [...params, limit, offset]),
        executeQuery(countQuery, params)
    ]);

    return {
        notifications,
        total: countResult[0].total
    };
};

/**
 * Obtiene el conteo de notificaciones no leídas de un usuario
 * @param {number} userId - ID del usuario
 * @returns {number} Cantidad de notificaciones no leídas
 */
const getUnreadNotificationsCount = async (userId) => {
    const query = `
        SELECT COUNT(*) as total
        FROM Notificaciones
        WHERE id_usuario = ? AND leida = FALSE
    `;
    const result = await executeQuery(query, [userId]);
    return result[0].total;
};

/**
 * Crea una nueva notificación
 * @param {Object} notificationData - Datos de la notificación
 * @returns {Object} Resultado de la inserción
 */
const createNotification = async (notificationData) => {
    const {
        id_usuario,
        tipo_codigo,
        mensaje,
        enlace_accion = null,
        id_proyecto = null,
        id_tarea = null,
        id_documento = null
    } = notificationData;

    // Primero obtenemos el ID del tipo de notificación
    const tipoNotificacion = await getNotificationTypeByCode(tipo_codigo);
    if (!tipoNotificacion) {
        throw new Error(`Tipo de notificación '${tipo_codigo}' no encontrado`);
    }

    const query = `
        INSERT INTO Notificaciones (
            id_usuario, 
            tipo_notificacion, 
            id_tipo_notificacion,
            mensaje, 
            enlace_accion,
            id_proyecto,
            id_tarea,
            id_documento
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    return await executeQuery(query, [
        id_usuario,
        tipo_codigo, // Mantener compatibilidad con campo antiguo
        tipoNotificacion.id,
        mensaje,
        enlace_accion,
        id_proyecto,
        id_tarea,
        id_documento
    ]);
};

/**
 * Marca una notificación como leída
 * @param {number} notificationId - ID de la notificación
 * @param {number} userId - ID del usuario (para verificar que es suya)
 * @returns {Object} Resultado de la actualización
 */
const markNotificationAsRead = async (notificationId, userId) => {
    const query = `
        UPDATE Notificaciones 
        SET leida = TRUE 
        WHERE id = ? AND id_usuario = ?
    `;
    return await executeQuery(query, [notificationId, userId]);
};

/**
 * Marca todas las notificaciones de un usuario como leídas
 * @param {number} userId - ID del usuario
 * @returns {Object} Resultado de la actualización
 */
const markAllNotificationsAsRead = async (userId) => {
    const query = `
        UPDATE Notificaciones 
        SET leida = TRUE 
        WHERE id_usuario = ? AND leida = FALSE
    `;
    return await executeQuery(query, [userId]);
};

/**
 * Elimina una notificación (solo si es del usuario)
 * @param {number} notificationId - ID de la notificación
 * @param {number} userId - ID del usuario
 * @returns {Object} Resultado de la eliminación
 */
const deleteNotification = async (notificationId, userId) => {
    const query = `
        DELETE FROM Notificaciones 
        WHERE id = ? AND id_usuario = ?
    `;
    return await executeQuery(query, [notificationId, userId]);
};

/**
 * Elimina todas las notificaciones leídas de un usuario
 * @param {number} userId - ID del usuario
 * @returns {Object} Resultado de la eliminación
 */
const deleteReadNotifications = async (userId) => {
    const query = `
        DELETE FROM Notificaciones 
        WHERE id_usuario = ? AND leida = TRUE
    `;
    return await executeQuery(query, [userId]);
};

// ===== CONSULTAS PARA NOTIFICACIONES AUTOMÁTICAS =====

/**
 * Obtiene tareas vencidas que necesitan notificación
 * Solo obtiene tareas que no están completadas y vencieron hoy o antes
 * @returns {Array} Lista de tareas vencidas
 */
const getOverdueTasksForNotification = async () => {
    const query = `
        SELECT 
            t.id as tarea_id,
            t.nombre as tarea_nombre,
            t.fecha_vencimiento,
            t.id_usuario_asignado,
            t.id_proyecto,
            p.nombre as proyecto_nombre,
            DATEDIFF(CURDATE(), t.fecha_vencimiento) as dias_vencida
        FROM Tareas t
        INNER JOIN Proyectos p ON t.id_proyecto = p.id
        WHERE t.estatus != 'Completada'
        AND t.fecha_vencimiento < CURDATE()
        AND t.id_usuario_asignado IS NOT NULL
        -- Solo las que vencieron hoy (para evitar spam)
        AND t.fecha_vencimiento = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
    `;
    return await executeQuery(query);
};

/**
 * Obtiene tareas que vencen pronto (próximos 2 días) para notificación preventiva
 * @returns {Array} Lista de tareas que vencen pronto
 */
const getTasksDueSoonForNotification = async () => {
    const query = `
        SELECT 
            t.id as tarea_id,
            t.nombre as tarea_nombre,
            t.fecha_vencimiento,
            t.id_usuario_asignado,
            t.id_proyecto,
            p.nombre as proyecto_nombre,
            DATEDIFF(t.fecha_vencimiento, CURDATE()) as dias_restantes
        FROM Tareas t
        INNER JOIN Proyectos p ON t.id_proyecto = p.id
        WHERE t.estatus != 'Completada'
        AND t.fecha_vencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 2 DAY)
        AND t.id_usuario_asignado IS NOT NULL
    `;
    return await executeQuery(query);
};

module.exports = {
    // Tipos de notificación
    getAllNotificationTypes,
    getNotificationTypeByCode,

    // CRUD de notificaciones
    getUserNotifications,
    getUnreadNotificationsCount,
    createNotification,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification,
    deleteReadNotifications,

    // Para notificaciones automáticas
    getOverdueTasksForNotification,
    getTasksDueSoonForNotification
};