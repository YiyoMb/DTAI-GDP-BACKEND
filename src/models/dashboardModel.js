// File: backend/src/models/dashboardModel.js
const { executeQuery } = require('../config/database');

// ===== MÉTRICAS GENERALES =====

/**
 * Obtiene el resumen general del sistema
 * @param {number} userId - ID del usuario (para filtrar por administrador si es necesario)
 * @param {string} userRole - Rol del usuario (Superadministrador ve todo, Administrador solo lo suyo)
 * @returns {Object} Resumen con totales de portafolios, programas, proyectos, tareas y usuarios
 */
const getGeneralSummary = async (userId, userRole) => {
    // Construir WHERE clause según el rol
    let whereClause = '';
    let params = [];

    if (userRole === 'Administrador') {
        whereClause = 'WHERE port.id_administrador = ?';
        params.push(userId);
    }

    const query = `
        SELECT
            COUNT(DISTINCT port.id) as total_portafolios,
            COUNT(DISTINCT prog.id) as total_programas,
            COUNT(DISTINCT proy.id) as total_proyectos,
            COUNT(DISTINCT CASE WHEN proy.estatus = 'Activo' THEN proy.id END) as proyectos_activos,
            COUNT(DISTINCT t.id) as total_tareas,
            COUNT(DISTINCT CASE WHEN t.estatus = 'Pendiente' THEN t.id END) as tareas_pendientes,
            COUNT(DISTINCT u.id) as total_usuarios_colaborando
        FROM Portafolios port
                 LEFT JOIN Programas prog ON port.id = prog.id_portafolio
                 LEFT JOIN Proyectos proy ON prog.id = proy.id_programa
                 LEFT JOIN Tareas t ON proy.id = t.id_proyecto
                 LEFT JOIN Proyecto_Usuarios pu ON proy.id = pu.id_proyecto
                 LEFT JOIN Usuarios u ON pu.id_usuario = u.id
            ${whereClause}
    `;

    const result = await executeQuery(query, params);
    return result[0] || {
        total_portafolios: 0,
        total_programas: 0,
        total_proyectos: 0,
        proyectos_activos: 0,
        total_tareas: 0,
        tareas_pendientes: 0,
        total_usuarios_colaborando: 0
    };
};

// ===== DISTRIBUCIÓN DE PROYECTOS =====

/**
 * Obtiene la distribución de proyectos por estatus
 * @param {number} userId
 * @param {string} userRole
 * @returns {Array} Array con {estatus, cantidad, porcentaje}
 */
const getProjectStatusDistribution = async (userId, userRole) => {
    let whereClause = '';
    let params = [];

    if (userRole === 'Administrador') {
        whereClause = 'WHERE p.id_administrador = ?';
        params.push(userId);
    }

    // Primero obtenemos el total para calcular porcentajes
    const totalQuery = `
        SELECT COUNT(*) as total
        FROM Proyectos p
            ${whereClause}
    `;

    const totalResult = await executeQuery(totalQuery, params);
    const total = totalResult[0].total;

    if (total === 0) {
        return [];
    }

    // Luego obtenemos la distribución
    const query = `
        SELECT 
            p.estatus,
            COUNT(*) as cantidad,
            ROUND((COUNT(*) * 100.0 / ?), 1) as porcentaje
        FROM Proyectos p
        ${whereClause}
        GROUP BY p.estatus
        ORDER BY cantidad DESC
    `;

    const finalParams = [total, ...params];
    return await executeQuery(query, finalParams);
};

/**
 * Obtiene la distribución de proyectos por nivel de riesgo
 * @param {number} userId
 * @param {string} userRole
 * @returns {Array} Array con {nivel_riesgo, cantidad, porcentaje}
 */
const getProjectRiskDistribution = async (userId, userRole) => {
    let whereClause = '';
    let params = [];

    if (userRole === 'Administrador') {
        whereClause = 'WHERE p.id_administrador = ?';
        params.push(userId);
    }

    // Primero obtenemos el total
    const totalQuery = `
        SELECT COUNT(*) as total
        FROM Proyectos p
            ${whereClause}
    `;

    const totalResult = await executeQuery(totalQuery, params);
    const total = totalResult[0].total;

    if (total === 0) {
        return [];
    }

    // Luego obtenemos la distribución
    const query = `
        SELECT 
            p.nivel_riesgo,
            COUNT(*) as cantidad,
            ROUND((COUNT(*) * 100.0 / ?), 1) as porcentaje
        FROM Proyectos p
        ${whereClause}
        GROUP BY p.nivel_riesgo
        ORDER BY 
            CASE p.nivel_riesgo
                WHEN 'Alto' THEN 1
                WHEN 'Medio' THEN 2
                WHEN 'Bajo' THEN 3
                WHEN 'Nulo' THEN 4
            END
    `;

    const finalParams = [total, ...params];
    return await executeQuery(query, finalParams);
};

/**
 * Obtiene la distribución de proyectos por tipo
 * @param {number} userId
 * @param {string} userRole
 * @returns {Array} Array con {nombre_tipo, cantidad, porcentaje}
 */
const getProjectTypeDistribution = async (userId, userRole) => {
    let whereClause = '';
    let joinCondition = '';
    let params = [];

    if (userRole === 'Administrador') {
        whereClause = 'WHERE p.id_administrador = ?';
        joinCondition = 'AND p.id_administrador = ?';
        params.push(userId);
    }

    // Primero obtenemos el total de proyectos
    const totalQuery = `
        SELECT COUNT(*) as total
        FROM Proyectos p
            ${whereClause}
    `;

    const totalResult = await executeQuery(totalQuery, params);
    const total = totalResult[0].total;

    if (total === 0) {
        return [];
    }

    // Luego obtenemos la distribución por tipo
    const query = `
        SELECT 
            tp.nombre_tipo,
            COUNT(p.id) as cantidad,
            ROUND((COUNT(p.id) * 100.0 / ?), 1) as porcentaje
        FROM Tipos_Proyecto tp
        LEFT JOIN Proyectos p ON tp.id = p.id_tipo_proyecto ${joinCondition}
        GROUP BY tp.id, tp.nombre_tipo
        HAVING cantidad > 0
        ORDER BY cantidad DESC
        LIMIT 10
    `;

    const finalParams = [total];
    if (userRole === 'Administrador') {
        finalParams.push(userId);
    }

    return await executeQuery(query, finalParams);
};

// ===== MÉTRICAS DE TAREAS =====

/**
 * Obtiene la distribución de tareas por estatus
 * @param {number} userId
 * @param {string} userRole
 * @returns {Array} Array con {estatus, cantidad, porcentaje}
 */
const getTaskStatusDistribution = async (userId, userRole) => {
    let joinClause = '';
    let whereClause = '';
    let params = [];

    if (userRole === 'Administrador') {
        joinClause = 'INNER JOIN Proyectos p ON t.id_proyecto = p.id';
        whereClause = 'WHERE p.id_administrador = ?';
        params.push(userId);
    }

    // Primero obtenemos el total de tareas
    const totalQuery = `
        SELECT COUNT(*) as total
        FROM Tareas t
            ${joinClause}
            ${whereClause}
    `;

    const totalResult = await executeQuery(totalQuery, params);
    const total = totalResult[0].total;

    if (total === 0) {
        return [];
    }

    // Luego obtenemos la distribución
    const query = `
        SELECT 
            t.estatus,
            COUNT(*) as cantidad,
            ROUND((COUNT(*) * 100.0 / ?), 1) as porcentaje
        FROM Tareas t
        ${joinClause}
        ${whereClause}
        GROUP BY t.estatus
        ORDER BY 
            CASE t.estatus
                WHEN 'Pendiente' THEN 1
                WHEN 'En Proceso' THEN 2
                WHEN 'Completada' THEN 3
            END
    `;

    const finalParams = [total, ...params];
    return await executeQuery(query, finalParams);
};

/**
 * Obtiene las tareas vencidas (fecha_vencimiento < hoy y estatus != 'Completada')
 * @param {number} userId
 * @param {string} userRole
 * @returns {Array} Array con tareas vencidas
 */
const getOverdueTasks = async (userId, userRole) => {
    let joinClause = 'INNER JOIN Proyectos p ON t.id_proyecto = p.id';
    let whereClause = `WHERE t.fecha_vencimiento < CURDATE() 
                       AND t.estatus != 'Completada'`;
    let params = [];

    if (userRole === 'Administrador') {
        whereClause += ' AND p.id_administrador = ?';
        params.push(userId);
    }

    const query = `
        SELECT
            t.id,
            t.nombre,
            t.fecha_vencimiento,
            t.nivel_prioridad,
            t.estatus,
            p.nombre as proyecto_nombre,
            CONCAT(u.nombre, ' ', u.apellido) as usuario_asignado,
            DATEDIFF(CURDATE(), t.fecha_vencimiento) as dias_vencida
        FROM Tareas t
            ${joinClause}
        LEFT JOIN Usuarios u ON t.id_usuario_asignado = u.id
            ${whereClause}
        ORDER BY t.fecha_vencimiento ASC
            LIMIT 10
    `;

    return await executeQuery(query, params);
};

// ===== ACTIVIDAD RECIENTE =====

/**
 * Obtiene los proyectos creados recientemente (últimos 30 días)
 * @param {number} userId
 * @param {string} userRole
 * @returns {Array} Array con proyectos recientes
 */
const getRecentProjects = async (userId, userRole) => {
    let whereClause = 'WHERE p.fecha_creacion >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
    let params = [];

    if (userRole === 'Administrador') {
        whereClause += ' AND p.id_administrador = ?';
        params.push(userId);
    }

    const query = `
        SELECT
            p.id,
            p.nombre,
            p.estatus,
            p.nivel_riesgo,
            p.fecha_creacion,
            prog.nombre as programa_nombre,
            port.nombre as portafolio_nombre,
            tp.nombre_tipo as tipo_proyecto,
            COUNT(t.id) as total_tareas
        FROM Proyectos p
                 LEFT JOIN Programas prog ON p.id_programa = prog.id
                 LEFT JOIN Portafolios port ON prog.id_portafolio = port.id
                 LEFT JOIN Tipos_Proyecto tp ON p.id_tipo_proyecto = tp.id
                 LEFT JOIN Tareas t ON p.id = t.id_proyecto
            ${whereClause}
        GROUP BY p.id, p.nombre, p.estatus, p.nivel_riesgo, p.fecha_creacion,
            prog.nombre, port.nombre, tp.nombre_tipo
        ORDER BY p.fecha_creacion DESC
            LIMIT 5
    `;

    return await executeQuery(query, params);
};

/**
 * Obtiene los portafolios con mejor rendimiento (más proyectos activos)
 * @param {number} userId
 * @param {string} userRole
 * @returns {Array} Array con estadísticas por portafolio
 */
const getPortfolioPerformance = async (userId, userRole) => {
    let whereClause = '';
    let params = [];

    if (userRole === 'Administrador') {
        whereClause = 'WHERE port.id_administrador = ?';
        params.push(userId);
    }

    const query = `
        SELECT
            port.id,
            port.nombre as portafolio_nombre,
            COUNT(DISTINCT prog.id) as total_programas,
            COUNT(DISTINCT p.id) as total_proyectos,
            COUNT(DISTINCT CASE WHEN p.estatus = 'Activo' THEN p.id END) as proyectos_activos,
            COUNT(DISTINCT CASE WHEN p.estatus = 'Finalizado' THEN p.id END) as proyectos_finalizados,
            COUNT(DISTINCT t.id) as total_tareas,
            COUNT(DISTINCT CASE WHEN t.estatus = 'Completada' THEN t.id END) as tareas_completadas,
            ROUND(
                    CASE
                        WHEN COUNT(DISTINCT t.id) > 0
                            THEN (COUNT(DISTINCT CASE WHEN t.estatus = 'Completada' THEN t.id END) * 100.0 / COUNT(DISTINCT t.id))
                        ELSE 0
                        END, 1
            ) as porcentaje_tareas_completadas
        FROM Portafolios port
                 LEFT JOIN Programas prog ON port.id = prog.id_portafolio
                 LEFT JOIN Proyectos p ON prog.id = p.id_programa
                 LEFT JOIN Tareas t ON p.id = t.id_proyecto
            ${whereClause}
        GROUP BY port.id, port.nombre
        HAVING total_proyectos > 0
        ORDER BY proyectos_activos DESC, porcentaje_tareas_completadas DESC
            LIMIT 5
    `;

    return await executeQuery(query, params);
};

module.exports = {
    getGeneralSummary,
    getProjectStatusDistribution,
    getProjectRiskDistribution,
    getProjectTypeDistribution,
    getTaskStatusDistribution,
    getOverdueTasks,
    getRecentProjects,
    getPortfolioPerformance
};