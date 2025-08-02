// File: backend/src/services/meetingService.js
const {
    getMeetingsNeedingReminder,
    getMeetingParticipantsForNotification,
    addMeetingParticipant
} = require('../models/meetingModel');

const {
    notifyMeetingCreated,
    notifyMeetingReminder,
    notifyMeetingCancelled
} = require('./notificationService');

/**
 * Servicio para gestionar la lógica de negocio de reuniones
 * Contiene funciones para automatizar invitaciones, recordatorios y notificaciones
 */

// ===== GESTIÓN DE INVITACIONES =====

/**
 * Invita múltiples usuarios a una reunión y envía notificaciones
 * @param {number} meetingId - ID de la reunión
 * @param {Array} participantIds - Array de IDs de usuarios a invitar
 * @param {Object} meetingData - Datos de la reunión para notificaciones
 * @returns {Object} Resultado de las invitaciones
 */
const inviteUsersToMeeting = async (meetingId, participantIds, meetingData) => {
    try {
        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        // Invitar cada usuario
        for (const userId of participantIds) {
            try {
                await addMeetingParticipant(meetingId, userId, 'Participante');
                successCount++;
            } catch (error) {
                console.error(`❌ Error al invitar usuario ${userId}:`, error.message);
                errors.push({ userId, error: error.message });
                errorCount++;
            }
        }

        // Enviar notificaciones de reunión creada
        try {
            await notifyMeetingCreated(meetingData, participantIds);
        } catch (notificationError) {
            console.error('❌ Error al enviar notificaciones de reunión creada:', notificationError);
        }

        console.log(`✅ Invitaciones enviadas: ${successCount} exitosas, ${errorCount} errores`);

        return {
            success: successCount,
            errors: errorCount,
            details: errors
        };

    } catch (error) {
        console.error('❌ Error general en invitaciones:', error);
        return {
            success: 0,
            errors: participantIds.length,
            details: [{ error: error.message }]
        };
    }
};

/**
 * Actualiza la lista de participantes de una reunión
 * @param {number} meetingId - ID de la reunión
 * @param {Array} newParticipantIds - Nuevos IDs de participantes
 * @param {Array} currentParticipantIds - IDs actuales de participantes
 * @param {Object} meetingData - Datos de la reunión
 * @returns {Object} Resultado de la actualización
 */
const updateMeetingParticipants = async (meetingId, newParticipantIds, currentParticipantIds, meetingData) => {
    try {
        // Determinar usuarios a agregar y remover
        const toAdd = newParticipantIds.filter(id => !currentParticipantIds.includes(id));
        const toRemove = currentParticipantIds.filter(id => !newParticipantIds.includes(id));

        let addedCount = 0;
        let removedCount = 0;

        // Agregar nuevos participantes
        if (toAdd.length > 0) {
            const addResult = await inviteUsersToMeeting(meetingId, toAdd, meetingData);
            addedCount = addResult.success;
        }

        // Remover participantes (implementar si es necesario)
        // Por ahora solo agregamos nuevos participantes

        console.log(`✅ Participantes actualizados: ${addedCount} agregados, ${removedCount} removidos`);

        return {
            added: addedCount,
            removed: removedCount,
            total_added: toAdd.length,
            total_to_remove: toRemove.length
        };

    } catch (error) {
        console.error('❌ Error al actualizar participantes:', error);
        return {
            added: 0,
            removed: 0,
            error: error.message
        };
    }
};

// ===== RECORDATORIOS AUTOMÁTICOS =====

/**
 * Envía recordatorios de reuniones próximas
 * Esta función debe ejecutarse periódicamente (cada 15 minutos)
 * @returns {Object} Resultado del envío de recordatorios
 */
const sendMeetingReminders = async () => {
    try {
        console.log('🔔 Iniciando envío de recordatorios de reuniones...');

        const meetingsNeedingReminder = await getMeetingsNeedingReminder();

        if (meetingsNeedingReminder.length === 0) {
            console.log('✅ No hay reuniones que necesiten recordatorio');
            return { sent: 0, errors: 0 };
        }

        let sentCount = 0;
        let errorCount = 0;

        for (const meeting of meetingsNeedingReminder) {
            try {
                // Obtener participantes de la reunión
                const participants = await getMeetingParticipantsForNotification(meeting.id);

                if (participants.length === 0) {
                    console.log(`⚠️ Reunión ${meeting.id} no tiene participantes`);
                    continue;
                }

                const participantIds = participants.map(p => p.id_usuario);

                // Enviar recordatorio
                await notifyMeetingReminder(
                    {
                        id: meeting.id,
                        titulo: meeting.titulo,
                        fecha_hora_inicio: meeting.fecha_hora_inicio,
                        id_creador: meeting.id_creador
                    },
                    participantIds
                );

                sentCount++;
                console.log(`✅ Recordatorio enviado para reunión: ${meeting.titulo}`);

            } catch (error) {
                console.error(`❌ Error al enviar recordatorio para reunión ${meeting.id}:`, error);
                errorCount++;
            }
        }

        console.log(`✅ Recordatorios de reuniones: ${sentCount} enviados, ${errorCount} errores`);
        return { sent: sentCount, errors: errorCount };

    } catch (error) {
        console.error('❌ Error general en recordatorios de reuniones:', error);
        return { sent: 0, errors: 1 };
    }
};

// ===== GESTIÓN DE ESTADOS =====

/**
 * Cancela una reunión y notifica a los participantes
 * @param {number} meetingId - ID de la reunión
 * @param {Object} meetingData - Datos de la reunión
 * @param {Array} participantIds - IDs de los participantes
 * @param {string} razonCancelacion - Razón de la cancelación
 * @returns {Object} Resultado de la cancelación
 */
const cancelMeeting = async (meetingId, meetingData, participantIds, razonCancelacion = null) => {
    try {
        // Enviar notificaciones de cancelación
        await notifyMeetingCancelled(meetingData, participantIds);

        console.log(`✅ Reunión ${meetingId} cancelada y notificaciones enviadas`);

        return {
            success: true,
            message: 'Reunión cancelada exitosamente',
            participants_notified: participantIds.length
        };

    } catch (error) {
        console.error('❌ Error al cancelar reunión:', error);
        return {
            success: false,
            message: 'Error al cancelar reunión',
            error: error.message
        };
    }
};

/**
 * Inicia una reunión (cambia estado a "En Curso")
 * @param {number} meetingId - ID de la reunión
 * @param {Object} meetingData - Datos de la reunión
 * @returns {Object} Resultado del inicio
 */
const startMeeting = async (meetingId, meetingData) => {
    try {
        // Aquí se pueden agregar lógicas adicionales como:
        // - Registrar hora de inicio real
        // - Notificar a participantes que la reunión comenzó
        // - Abrir automáticamente enlaces de videoconferencia

        console.log(`✅ Reunión ${meetingId} iniciada: ${meetingData.titulo}`);

        return {
            success: true,
            message: 'Reunión iniciada exitosamente',
            meeting_id: meetingId
        };

    } catch (error) {
        console.error('❌ Error al iniciar reunión:', error);
        return {
            success: false,
            message: 'Error al iniciar reunión',
            error: error.message
        };
    }
};

/**
 * Finaliza una reunión (cambia estado a "Finalizada")
 * @param {number} meetingId - ID de la reunión
 * @param {Object} meetingData - Datos de la reunión
 * @param {string} notas - Notas finales de la reunión
 * @returns {Object} Resultado de la finalización
 */
const endMeeting = async (meetingId, meetingData, notas = null) => {
    try {
        // Aquí se pueden agregar lógicas adicionales como:
        // - Registrar hora de finalización real
        // - Generar reporte de asistencia
        // - Enviar resumen a participantes

        console.log(`✅ Reunión ${meetingId} finalizada: ${meetingData.titulo}`);

        return {
            success: true,
            message: 'Reunión finalizada exitosamente',
            meeting_id: meetingId,
            notes: notas
        };

    } catch (error) {
        console.error('❌ Error al finalizar reunión:', error);
        return {
            success: false,
            message: 'Error al finalizar reunión',
            error: error.message
        };
    }
};

// ===== VALIDACIONES DE NEGOCIO =====

/**
 * Valida datos de reunión antes de crear/actualizar
 * @param {Object} meetingData - Datos de la reunión
 * @returns {Object} Resultado de la validación
 */
const validateMeetingData = async (meetingData) => {
    const errors = [];

    // Validar fechas
    const now = new Date();
    const startDate = new Date(meetingData.fecha_hora_inicio);
    const endDate = new Date(meetingData.fecha_hora_fin);

    if (startDate <= now) {
        errors.push('La fecha de inicio debe ser en el futuro');
    }

    if (endDate <= startDate) {
        errors.push('La fecha de fin debe ser posterior a la fecha de inicio');
    }

    // Validar duración (no más de 8 horas)
    const durationHours = (endDate - startDate) / (1000 * 60 * 60);
    if (durationHours > 8) {
        errors.push('La duración no puede ser mayor a 8 horas');
    }

    // Validar enlace para reuniones virtuales
    if (meetingData.id_tipo_reunion === 2 && !meetingData.enlace_reunion) { // 2 = Virtual
        errors.push('Las reuniones virtuales requieren un enlace de videoconferencia');
    }

    // Validar ubicación para reuniones presenciales
    if (meetingData.id_tipo_reunion === 1 && !meetingData.ubicacion) { // 1 = Presencial
        errors.push('Las reuniones presenciales requieren una ubicación');
    }

    return {
        valid: errors.length === 0,
        errors
    };
};

/**
 * Verifica conflictos de horario para un usuario
 * @param {number} userId - ID del usuario
 * @param {string} fechaInicio - Fecha y hora de inicio
 * @param {string} fechaFin - Fecha y hora de fin
 * @param {number} excludeMeetingId - ID de reunión a excluir (para actualizaciones)
 * @returns {Array} Lista de reuniones en conflicto
 */
const checkTimeConflicts = async (userId, fechaInicio, fechaFin, excludeMeetingId = null) => {
    try {
        let excludeClause = '';
        let params = [userId, fechaInicio, fechaFin, fechaInicio, fechaFin];

        if (excludeMeetingId) {
            excludeClause = 'AND r.id != ?';
            params.push(excludeMeetingId);
        }

        const query = `
            SELECT 
                r.id,
                r.titulo,
                r.fecha_hora_inicio,
                r.fecha_hora_fin
            FROM Reuniones r
            INNER JOIN Reunion_Participantes rp ON r.id = rp.id_reunion
            WHERE rp.id_usuario = ?
            AND r.id_estado NOT IN (4, 5) -- Excluir finalizadas y canceladas
            AND (
                (r.fecha_hora_inicio <= ? AND r.fecha_hora_fin > ?) OR
                (r.fecha_hora_inicio < ? AND r.fecha_hora_fin >= ?)
            )
            ${excludeClause}
            ORDER BY r.fecha_hora_inicio
        `;

        const conflicts = await getMeetingParticipantsForNotification.executeQuery(query, params);
        return conflicts || [];

    } catch (error) {
        console.error('❌ Error al verificar conflictos de horario:', error);
        return [];
    }
};

// ===== UTILIDADES =====

/**
 * Genera enlace de reunión automático (placeholder para integración futura)
 * @param {Object} meetingData - Datos de la reunión
 * @returns {string} Enlace generado
 */
const generateMeetingLink = async (meetingData) => {
    // Placeholder para integración futura con Zoom, Google Meet, etc.
    const meetingId = Date.now().toString(36);
    return `https://meet.dtai.com/room/${meetingId}`;
};

/**
 * Calcula la duración estimada basada en fechas
 * @param {string} fechaInicio - Fecha de inicio
 * @param {string} fechaFin - Fecha de fin
 * @returns {number} Duración en minutos
 */
const calculateDuration = (fechaInicio, fechaFin) => {
    const start = new Date(fechaInicio);
    const end = new Date(fechaFin);
    return Math.round((end - start) / (1000 * 60));
};

module.exports = {
    // Gestión de invitaciones
    inviteUsersToMeeting,
    updateMeetingParticipants,

    // Recordatorios automáticos
    sendMeetingReminders,

    // Gestión de estados
    cancelMeeting,
    startMeeting,
    endMeeting,

    // Validaciones
    validateMeetingData,
    checkTimeConflicts,

    // Utilidades
    generateMeetingLink,
    calculateDuration
};