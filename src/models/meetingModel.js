// File: backend/src/models/meetingModel.js
const { executeQuery } = require('../config/database');

// ===== GESTIÓN DE TIPOS Y ESTADOS =====

/**
 * Obtiene todos los estados de reunión activos
 * @returns {Array} Lista de estados de reunión
 */
const getAllMeetingStates = async () => {
    const query = `
        SELECT id, nombre_estado, descripcion, color, activo
        FROM Estados_Reunion
        WHERE activo = TRUE
        ORDER BY id ASC
    `;
    return await executeQuery(query);
};

/**
 * Obtiene todos los tipos de reunión activos
 * @returns {Array} Lista de tipos de reunión
 */
const getAllMeetingTypes = async () => {
    const query = `
        SELECT id, nombre_tipo, descripcion, icono, requiere_enlace, activo
        FROM Tipos_Reunion
        WHERE activo = TRUE
        ORDER BY nombre_tipo ASC
    `;
    return await executeQuery(query);
};

// ===== CRUD DE REUNIONES =====

/**
 * Obtiene reuniones con paginación y filtros
 * @param {Object} filters - Filtros opcionales
 * @param {number} page - Página actual
 * @param {number} limit - Límite por página
 * @param {number} userId - ID del usuario para permisos
 * @param {string} userRole - Rol del usuario
 * @returns {Object} {meetings: Array, total: number}
 */
const getMeetingsWithPagination = async (filters = {}, page = 1, limit = 20, userId = null, userRole = null) => {
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    let params = [];

    // Filtrar por permisos de usuario
    if (userRole === 'Administrador') {
        // Los administradores solo ven reuniones que crearon o donde participan
        whereClause += ` AND (r.id_creador = ? OR EXISTS (
            SELECT 1 FROM Reunion_Participantes rp 
            WHERE rp.id_reunion = r.id AND rp.id_usuario = ?
        ))`;
        params.push(userId, userId);
    } else if (userRole === 'Colaborador' || userRole === 'Cliente') {
        // Colaboradores y clientes solo ven reuniones donde participan
        whereClause += ` AND EXISTS (
            SELECT 1 FROM Reunion_Participantes rp 
            WHERE rp.id_reunion = r.id AND rp.id_usuario = ?
        )`;
        params.push(userId);
    }
    // Superadministradores ven todas las reuniones (no agregar filtro adicional)

    // Aplicar filtros opcionales
    if (filters.proyecto_id) {
        whereClause += ' AND r.id_proyecto = ?';
        params.push(filters.proyecto_id);
    }

    if (filters.estado_id) {
        whereClause += ' AND r.id_estado = ?';
        params.push(filters.estado_id);
    }

    if (filters.tipo_id) {
        whereClause += ' AND r.id_tipo_reunion = ?';
        params.push(filters.tipo_id);
    }

    if (filters.fecha_desde) {
        whereClause += ' AND DATE(r.fecha_hora_inicio) >= ?';
        params.push(filters.fecha_desde);
    }

    if (filters.fecha_hasta) {
        whereClause += ' AND DATE(r.fecha_hora_inicio) <= ?';
        params.push(filters.fecha_hasta);
    }

    if (filters.search) {
        whereClause += ' AND (r.titulo LIKE ? OR r.descripcion LIKE ?)';
        const searchTerm = `%${filters.search}%`;
        params.push(searchTerm, searchTerm);
    }

    // Usar la vista completa para obtener información enriquecida
    const query = `
        SELECT 
            id, titulo, descripcion, fecha_hora_inicio, fecha_hora_fin,
            ubicacion, enlace_reunion, agenda, notas, duracion_estimada,
            nombre_estado, estado_color, tipo_reunion, tipo_icono, requiere_enlace,
            proyecto_nombre, creador_nombre, creador_email,
            total_participantes, participantes_confirmados, participantes_asistieron
        FROM Vista_Reuniones_Completa r
        ${whereClause}
        ORDER BY r.fecha_hora_inicio DESC
        LIMIT ? OFFSET ?
    `;

    // Consulta para contar total
    const countQuery = `
        SELECT COUNT(*) as total
        FROM Reuniones r
        ${whereClause}
    `;

    const mainQueryParams = [...params, limit, offset];
    const countQueryParams = [...params];

    const [meetings, countResult] = await Promise.all([
        executeQuery(query, mainQueryParams),
        executeQuery(countQuery, countQueryParams)
    ]);

    return {
        meetings,
        total: countResult[0].total
    };
};

/**
 * Obtiene una reunión por ID con validación de permisos
 * @param {number} meetingId - ID de la reunión
 * @param {number} userId - ID del usuario
 * @param {string} userRole - Rol del usuario
 * @returns {Object|null} Datos de la reunión o null si no tiene permisos
 */
const getMeetingById = async (meetingId, userId = null, userRole = null) => {
    let whereClause = 'WHERE r.id = ?';
    let params = [meetingId];

    // Aplicar filtros de permisos según el rol
    if (userRole === 'Administrador') {
        whereClause += ` AND (r.id_creador = ? OR EXISTS (
            SELECT 1 FROM Reunion_Participantes rp 
            WHERE rp.id_reunion = r.id AND rp.id_usuario = ?
        ))`;
        params.push(userId, userId);
    } else if (userRole === 'Colaborador' || userRole === 'Cliente') {
        whereClause += ` AND EXISTS (
            SELECT 1 FROM Reunion_Participantes rp 
            WHERE rp.id_reunion = r.id AND rp.id_usuario = ?
        )`;
        params.push(userId);
    }

    const query = `
        SELECT 
            r.id, r.titulo, r.descripcion, r.fecha_hora_inicio, r.fecha_hora_fin,
            r.ubicacion, r.enlace_reunion, r.agenda, r.notas, r.duracion_estimada,
            r.recordatorio_minutos, r.es_recurrente, r.frecuencia_recurrencia,
            r.fecha_limite_recurrencia, r.reunion_padre_id, r.id_creador,
            er.nombre_estado, er.color as estado_color,
            tr.nombre_tipo as tipo_reunion, tr.icono as tipo_icono, tr.requiere_enlace,
            p.nombre as proyecto_nombre,
            CONCAT(u.nombre, ' ', u.apellido) as creador_nombre,
            u.email as creador_email
        FROM Reuniones r
        LEFT JOIN Estados_Reunion er ON r.id_estado = er.id
        LEFT JOIN Tipos_Reunion tr ON r.id_tipo_reunion = tr.id
        LEFT JOIN Proyectos p ON r.id_proyecto = p.id
        LEFT JOIN Usuarios u ON r.id_creador = u.id
        ${whereClause}
    `;

    const result = await executeQuery(query, params);
    return result[0] || null;
};

/**
 * Crea una nueva reunión
 * @param {Object} meetingData - Datos de la reunión
 * @returns {Object} Resultado de la inserción
 */
const createMeeting = async (meetingData) => {
    const {
        titulo,
        descripcion = null,
        fecha_hora_inicio,
        fecha_hora_fin,
        ubicacion = null,
        enlace_reunion = null,
        agenda = null,
        duracion_estimada = 60,
        recordatorio_minutos = 30,
        es_recurrente = false,
        frecuencia_recurrencia = null,
        fecha_limite_recurrencia = null,
        id_proyecto = null,
        id_tipo_reunion = 1, // Por defecto: Presencial
        id_creador
    } = meetingData;

    const query = `
        INSERT INTO Reuniones (
            titulo, descripcion, fecha_hora_inicio, fecha_hora_fin,
            ubicacion, enlace_reunion, agenda, duracion_estimada,
            recordatorio_minutos, es_recurrente, frecuencia_recurrencia,
            fecha_limite_recurrencia, id_proyecto, id_tipo_reunion, id_creador,
            id_estado
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `;

    return await executeQuery(query, [
        titulo, descripcion, fecha_hora_inicio, fecha_hora_fin,
        ubicacion, enlace_reunion, agenda, duracion_estimada,
        recordatorio_minutos, es_recurrente, frecuencia_recurrencia,
        fecha_limite_recurrencia, id_proyecto, id_tipo_reunion, id_creador
    ]);
};

/**
 * Actualiza una reunión existente
 * @param {number} meetingId - ID de la reunión
 * @param {Object} updateData - Datos a actualizar
 * @param {number} userId - ID del usuario (para permisos)
 * @param {string} userRole - Rol del usuario
 * @returns {Object} Resultado de la actualización
 */
const updateMeeting = async (meetingId, updateData, userId = null, userRole = null) => {
    const fields = [];
    const values = [];

    // Construir dinámicamente la consulta UPDATE
    Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined && key !== 'id') {
            fields.push(`${key} = ?`);
            values.push(updateData[key]);
        }
    });

    if (fields.length === 0) {
        throw new Error('No hay campos para actualizar');
    }

    values.push(meetingId);

    let whereClause = 'WHERE id = ?';

    // Solo el creador puede editar la reunión (o Superadministrador)
    if (userRole !== 'Superadministrador') {
        whereClause += ' AND id_creador = ?';
        values.push(userId);
    }

    const query = `
        UPDATE Reuniones
        SET ${fields.join(', ')}
        ${whereClause}
    `;

    return await executeQuery(query, values);
};

/**
 * Elimina una reunión (solo creador o Superadministrador)
 * @param {number} meetingId - ID de la reunión
 * @param {number} userId - ID del usuario
 * @param {string} userRole - Rol del usuario
 * @returns {Object} Resultado de la eliminación
 */
const deleteMeeting = async (meetingId, userId = null, userRole = null) => {
    let whereClause = 'WHERE id = ?';
    let params = [meetingId];

    // Solo el creador puede eliminar la reunión (o Superadministrador)
    if (userRole !== 'Superadministrador') {
        whereClause += ' AND id_creador = ?';
        params.push(userId);
    }

    const query = `
        DELETE FROM Reuniones
        ${whereClause}
    `;

    return await executeQuery(query, params);
};

/**
 * Actualiza el estado de una reunión
 * @param {number} meetingId - ID de la reunión
 * @param {number} estadoId - ID del nuevo estado
 * @param {number} userId - ID del usuario
 * @param {string} userRole - Rol del usuario
 * @returns {Object} Resultado de la actualización
 */
const updateMeetingStatus = async (meetingId, estadoId, userId = null, userRole = null) => {
    let whereClause = 'WHERE id = ?';
    let params = [estadoId, meetingId];

    // Solo el creador puede cambiar el estado (o Superadministrador)
    if (userRole !== 'Superadministrador') {
        whereClause += ' AND id_creador = ?';
        params.push(userId);
    }

    const query = `
        UPDATE Reuniones
        SET id_estado = ?
        ${whereClause}
    `;

    return await executeQuery(query, params);
};

// ===== GESTIÓN DE PARTICIPANTES =====

/**
 * Obtiene los participantes de una reunión
 * @param {number} meetingId - ID de la reunión
 * @returns {Array} Lista de participantes con sus datos
 */
const getMeetingParticipants = async (meetingId) => {
    const query = `
        SELECT 
            rp.id_usuario,
            rp.asistencia_confirmada,
            rp.rol_participante,
            rp.fecha_invitacion,
            rp.fecha_confirmacion,
            rp.fecha_asistencia_real,
            rp.comentarios,
            u.nombre,
            u.apellido,
            u.email,
            r.nombre_rol
        FROM Reunion_Participantes rp
        INNER JOIN Usuarios u ON rp.id_usuario = u.id
        INNER JOIN Roles r ON u.id_rol = r.id
        WHERE rp.id_reunion = ?
        ORDER BY rp.rol_participante, u.apellido, u.nombre
    `;

    return await executeQuery(query, [meetingId]);
};

/**
 * Agrega un participante a una reunión
 * @param {number} meetingId - ID de la reunión
 * @param {number} userId - ID del usuario
 * @param {string} rolParticipante - Rol del participante
 * @returns {Object} Resultado de la inserción
 */
const addMeetingParticipant = async (meetingId, userId, rolParticipante = 'Participante') => {
    const query = `
        INSERT INTO Reunion_Participantes (id_reunion, id_usuario, rol_participante, fecha_invitacion)
        VALUES (?, ?, ?, NOW())
    `;

    return await executeQuery(query, [meetingId, userId, rolParticipante]);
};

/**
 * Remueve un participante de una reunión
 * @param {number} meetingId - ID de la reunión
 * @param {number} userId - ID del usuario
 * @returns {Object} Resultado de la eliminación
 */
const removeMeetingParticipant = async (meetingId, userId) => {
    const query = `
        DELETE FROM Reunion_Participantes
        WHERE id_reunion = ? AND id_usuario = ?
    `;

    return await executeQuery(query, [meetingId, userId]);
};

/**
 * Confirma asistencia de un participante
 * @param {number} meetingId - ID de la reunión
 * @param {number} userId - ID del usuario
 * @param {boolean} confirmacion - true para confirmar, false para cancelar
 * @returns {Object} Resultado de la actualización
 */
const confirmMeetingAttendance = async (meetingId, userId, confirmacion = true) => {
    const query = `
        UPDATE Reunion_Participantes
        SET asistencia_confirmada = ?,
            fecha_confirmacion = NOW()
        WHERE id_reunion = ? AND id_usuario = ?
    `;

    return await executeQuery(query, [confirmacion, meetingId, userId]);
};

/**
 * Registra asistencia real de un participante
 * @param {number} meetingId - ID de la reunión
 * @param {number} userId - ID del usuario
 * @returns {Object} Resultado de la actualización
 */
const registerRealAttendance = async (meetingId, userId) => {
    const query = `
        UPDATE Reunion_Participantes
        SET fecha_asistencia_real = NOW(),
            asistencia_confirmada = TRUE
        WHERE id_reunion = ? AND id_usuario = ?
    `;

    return await executeQuery(query, [meetingId, userId]);
};

// ===== CONSULTAS PARA RECORDATORIOS Y NOTIFICACIONES =====

/**
 * Obtiene reuniones que necesitan recordatorio
 * @param {number} minutosAntes - Minutos antes de la reunión para enviar recordatorio
 * @returns {Array} Reuniones que necesitan recordatorio
 */
const getMeetingsNeedingReminder = async (minutosAntes = 30) => {
    const query = `
        SELECT 
            r.id,
            r.titulo,
            r.fecha_hora_inicio,
            r.recordatorio_minutos,
            r.id_creador,
            CONCAT(u.nombre, ' ', u.apellido) as creador_nombre
        FROM Reuniones r
        INNER JOIN Usuarios u ON r.id_creador = u.id
        WHERE r.id_estado = 1 -- Solo reuniones programadas
        AND r.fecha_hora_inicio > NOW()
        AND r.fecha_hora_inicio <= DATE_ADD(NOW(), INTERVAL r.recordatorio_minutos MINUTE)
        AND NOT EXISTS (
            SELECT 1 FROM Notificaciones n 
            WHERE n.tipo_notificacion = 'MEETING_REMINDER'
            AND DATE(n.fecha_creacion) = CURDATE()
            AND n.enlace_accion LIKE CONCAT('%meetings/', r.id, '%')
        )
    `;

    return await executeQuery(query, []);
};

/**
 * Obtiene participantes de una reunión específica para notificaciones
 * @param {number} meetingId - ID de la reunión
 * @returns {Array} Lista de participantes
 */
const getMeetingParticipantsForNotification = async (meetingId) => {
    const query = `
        SELECT 
            rp.id_usuario,
            u.nombre,
            u.apellido,
            u.email,
            rp.rol_participante
        FROM Reunion_Participantes rp
        INNER JOIN Usuarios u ON rp.id_usuario = u.id
        WHERE rp.id_reunion = ?
        AND u.activo = TRUE
    `;

    return await executeQuery(query, [meetingId]);
};

/**
 * Obtiene reuniones del día para un usuario específico
 * @param {number} userId - ID del usuario
 * @param {string} fecha - Fecha en formato YYYY-MM-DD (opcional, por defecto hoy)
 * @returns {Array} Reuniones del día
 */
const getUserMeetingsForDay = async (userId, fecha = null) => {
    const targetDate = fecha || new Date().toISOString().split('T')[0];

    const query = `
        SELECT 
            r.id,
            r.titulo,
            r.fecha_hora_inicio,
            r.fecha_hora_fin,
            r.ubicacion,
            r.enlace_reunion,
            er.nombre_estado,
            tr.nombre_tipo as tipo_reunion,
            p.nombre as proyecto_nombre,
            rp.rol_participante,
            rp.asistencia_confirmada
        FROM Reuniones r
        INNER JOIN Reunion_Participantes rp ON r.id = rp.id_reunion
        LEFT JOIN Estados_Reunion er ON r.id_estado = er.id
        LEFT JOIN Tipos_Reunion tr ON r.id_tipo_reunion = tr.id
        LEFT JOIN Proyectos p ON r.id_proyecto = p.id
        WHERE rp.id_usuario = ?
        AND DATE(r.fecha_hora_inicio) = ?
        AND r.id_estado NOT IN (4, 5) -- Excluir finalizadas y canceladas
        ORDER BY r.fecha_hora_inicio ASC
    `;

    return await executeQuery(query, [userId, targetDate]);
};

/**
 * Verifica si un usuario ya está invitado a una reunión
 * @param {number} meetingId - ID de la reunión
 * @param {number} userId - ID del usuario
 * @returns {boolean} true si ya está invitado
 */
const isUserInvitedToMeeting = async (meetingId, userId) => {
    const query = `
        SELECT COUNT(*) as count
        FROM Reunion_Participantes
        WHERE id_reunion = ? AND id_usuario = ?
    `;

    const result = await executeQuery(query, [meetingId, userId]);
    return result[0].count > 0;
};

/**
 * Obtiene estadísticas de reuniones para dashboard
 * @param {number} userId - ID del usuario
 * @param {string} userRole - Rol del usuario
 * @returns {Object} Estadísticas de reuniones
 */
const getMeetingStatistics = async (userId = null, userRole = null) => {
    let whereClause = '';
    let params = [];

    // Aplicar filtros de permisos
    if (userRole === 'Administrador') {
        whereClause = `WHERE (r.id_creador = ? OR EXISTS (
            SELECT 1 FROM Reunion_Participantes rp 
            WHERE rp.id_reunion = r.id AND rp.id_usuario = ?
        ))`;
        params.push(userId, userId);
    } else if (userRole === 'Colaborador' || userRole === 'Cliente') {
        whereClause = `WHERE EXISTS (
            SELECT 1 FROM Reunion_Participantes rp 
            WHERE rp.id_reunion = r.id AND rp.id_usuario = ?
        )`;
        params.push(userId);
    }

    const query = `
        SELECT 
            COUNT(*) as total_reuniones,
            COUNT(CASE WHEN r.id_estado = 1 THEN 1 END) as programadas,
            COUNT(CASE WHEN r.id_estado = 2 THEN 1 END) as confirmadas,
            COUNT(CASE WHEN r.id_estado = 3 THEN 1 END) as en_curso,
            COUNT(CASE WHEN r.id_estado = 4 THEN 1 END) as finalizadas,
            COUNT(CASE WHEN r.id_estado = 5 THEN 1 END) as canceladas,
            COUNT(CASE WHEN DATE(r.fecha_hora_inicio) = CURDATE() THEN 1 END) as hoy,
            COUNT(CASE WHEN DATE(r.fecha_hora_inicio) = DATE_ADD(CURDATE(), INTERVAL 1 DAY) THEN 1 END) as manana,
            COUNT(CASE WHEN r.fecha_hora_inicio > NOW() AND r.fecha_hora_inicio <= DATE_ADD(NOW(), INTERVAL 7 DAY) THEN 1 END) as proxima_semana
        FROM Reuniones r
        ${whereClause}
    `;

    const result = await executeQuery(query, params);
    return result[0] || {
        total_reuniones: 0,
        programadas: 0,
        confirmadas: 0,
        en_curso: 0,
        finalizadas: 0,
        canceladas: 0,
        hoy: 0,
        manana: 0,
        proxima_semana: 0
    };
};

module.exports = {
    // Tipos y estados
    getAllMeetingStates,
    getAllMeetingTypes,

    // CRUD de reuniones
    getMeetingsWithPagination,
    getMeetingById,
    createMeeting,
    updateMeeting,
    deleteMeeting,
    updateMeetingStatus,

    // Gestión de participantes
    getMeetingParticipants,
    addMeetingParticipant,
    removeMeetingParticipant,
    confirmMeetingAttendance,
    registerRealAttendance,
    isUserInvitedToMeeting,

    // Consultas para notificaciones y recordatorios
    getMeetingsNeedingReminder,
    getMeetingParticipantsForNotification,
    getUserMeetingsForDay,

    // Estadísticas
    getMeetingStatistics
};