// File: backend/src/services/notificationService.js
const {
    createNotification,
    getOverdueTasksForNotification,
    getTasksDueSoonForNotification
} = require('../models/notificationModel');

/**
 * Servicio para generar y enviar notificaciones automáticamente
 * Este servicio contiene toda la lógica de negocio para crear notificaciones
 * cuando ocurren eventos importantes en el sistema
 */

// ===== NOTIFICACIONES DE TAREAS =====

/**
 * Crea notificación cuando se asigna una tarea a un usuario
 * @param {Object} taskData - Datos de la tarea
 * @param {number} assignedUserId - ID del usuario asignado
 * @param {number} creatorUserId - ID del usuario que creó la tarea
 */
const notifyTaskAssigned = async (taskData, assignedUserId, creatorUserId) => {
    try {
        // No notificar si se asigna a sí mismo
        if (assignedUserId === creatorUserId) return;

        const mensaje = `Se te ha asignado la tarea "${taskData.nombre}" en el proyecto "${taskData.proyecto_nombre}"`;
        const enlaceAccion = `/projects/${taskData.id_proyecto}/tasks/${taskData.id}`;

        await createNotification({
            id_usuario: assignedUserId,
            tipo_codigo: 'TASK_ASSIGNED',
            mensaje,
            enlace_accion: enlaceAccion,
            id_proyecto: taskData.id_proyecto,
            id_tarea: taskData.id
        });

        console.log(`✅ Notificación de tarea asignada enviada al usuario ${assignedUserId}`);
    } catch (error) {
        console.error('❌ Error al crear notificación de tarea asignada:', error);
    }
};

/**
 * Crea notificación cuando una tarea cambia de estado
 * @param {Object} taskData - Datos de la tarea
 * @param {string} oldStatus - Estado anterior
 * @param {string} newStatus - Nuevo estado
 * @param {number} changedByUserId - ID del usuario que hizo el cambio
 */
const notifyTaskStatusChanged = async (taskData, oldStatus, newStatus, changedByUserId) => {
    try {
        // Determinar quién debe recibir la notificación
        const recipientIds = [];

        // Notificar al usuario asignado (si existe y no es quien hizo el cambio)
        if (taskData.id_usuario_asignado && taskData.id_usuario_asignado !== changedByUserId) {
            recipientIds.push(taskData.id_usuario_asignado);
        }

        // Notificar al creador de la tarea (si no es el mismo que el asignado o quien hizo el cambio)
        if (taskData.id_creador &&
            taskData.id_creador !== changedByUserId &&
            taskData.id_creador !== taskData.id_usuario_asignado) {
            recipientIds.push(taskData.id_creador);
        }

        const statusLabels = {
            'Pendiente': 'pendiente',
            'En Proceso': 'en proceso',
            'Completada': 'completada'
        };

        const mensaje = `La tarea "${taskData.nombre}" cambió de ${statusLabels[oldStatus]} a ${statusLabels[newStatus]}`;
        const enlaceAccion = `/projects/${taskData.id_proyecto}/tasks/${taskData.id}`;

        // Crear notificación para cada destinatario
        for (const userId of recipientIds) {
            await createNotification({
                id_usuario: userId,
                tipo_codigo: newStatus === 'Completada' ? 'TASK_COMPLETED' : 'TASK_STATUS_CHANGED',
                mensaje,
                enlace_accion: enlaceAccion,
                id_proyecto: taskData.id_proyecto,
                id_tarea: taskData.id
            });
        }

        console.log(`✅ Notificaciones de cambio de estado enviadas a ${recipientIds.length} usuarios`);
    } catch (error) {
        console.error('❌ Error al crear notificación de cambio de estado:', error);
    }
};

// ===== NOTIFICACIONES DE PROYECTOS =====

/**
 * Crea notificación cuando un usuario es asignado a un proyecto
 * @param {Object} projectData - Datos del proyecto
 * @param {number} assignedUserId - ID del usuario asignado
 * @param {number} assignedByUserId - ID del usuario que hizo la asignación
 */
const notifyUserAssignedToProject = async (projectData, assignedUserId, assignedByUserId) => {
    try {
        const mensaje = `Has sido asignado al proyecto "${projectData.nombre}"`;
        const enlaceAccion = `/projects/${projectData.id}`;

        await createNotification({
            id_usuario: assignedUserId,
            tipo_codigo: 'PROJECT_ASSIGNED',
            mensaje,
            enlace_accion: enlaceAccion,
            id_proyecto: projectData.id
        });

        console.log(`✅ Notificación de asignación a proyecto enviada al usuario ${assignedUserId}`);
    } catch (error) {
        console.error('❌ Error al crear notificación de asignación a proyecto:', error);
    }
};

/**
 * Crea notificación cuando se crea un nuevo proyecto
 * @param {Object} projectData - Datos del proyecto
 * @param {Array} teamMemberIds - IDs de los miembros del equipo a notificar
 */
const notifyProjectCreated = async (projectData, teamMemberIds = []) => {
    try {
        const mensaje = `Se ha creado el nuevo proyecto "${projectData.nombre}"`;
        const enlaceAccion = `/projects/${projectData.id}`;

        // Notificar a todos los miembros del equipo
        for (const userId of teamMemberIds) {
            await createNotification({
                id_usuario: userId,
                tipo_codigo: 'PROJECT_CREATED',
                mensaje,
                enlace_accion: enlaceAccion,
                id_proyecto: projectData.id
            });
        }

        console.log(`✅ Notificaciones de proyecto creado enviadas a ${teamMemberIds.length} usuarios`);
    } catch (error) {
        console.error('❌ Error al crear notificaciones de proyecto creado:', error);
    }
};

// ===== NOTIFICACIONES DE DOCUMENTOS =====

/**
 * Crea notificación cuando un documento necesita aprobación
 * @param {Object} documentData - Datos del documento
 * @param {number} approverId - ID del usuario que debe aprobar
 */
const notifyDocumentPendingApproval = async (documentData, approverId) => {
    try {
        const mensaje = `El documento "${documentData.nombre_documento}" está pendiente de tu aprobación`;
        const enlaceAccion = `/projects/${documentData.id_proyecto}/documents/${documentData.id}`;

        await createNotification({
            id_usuario: approverId,
            tipo_codigo: 'DOCUMENT_PENDING_APPROVAL',
            mensaje,
            enlace_accion: enlaceAccion,
            id_proyecto: documentData.id_proyecto,
            id_documento: documentData.id
        });

        console.log(`✅ Notificación de documento pendiente enviada al usuario ${approverId}`);
    } catch (error) {
        console.error('❌ Error al crear notificación de documento pendiente:', error);
    }
};

/**
 * Crea notificación cuando un documento es aprobado o rechazado
 * @param {Object} documentData - Datos del documento
 * @param {string} action - 'approved' o 'rejected'
 * @param {number} uploaderUserId - ID del usuario que subió el documento
 */
const notifyDocumentStatusChanged = async (documentData, action, uploaderUserId) => {
    try {
        const isApproved = action === 'approved';
        const mensaje = isApproved
            ? `Tu documento "${documentData.nombre_documento}" ha sido aprobado`
            : `Tu documento "${documentData.nombre_documento}" ha sido rechazado`;

        const enlaceAccion = `/projects/${documentData.id_proyecto}/documents/${documentData.id}`;

        await createNotification({
            id_usuario: uploaderUserId,
            tipo_codigo: isApproved ? 'DOCUMENT_APPROVED' : 'DOCUMENT_REJECTED',
            mensaje,
            enlace_accion: enlaceAccion,
            id_proyecto: documentData.id_proyecto,
            id_documento: documentData.id
        });

        console.log(`✅ Notificación de documento ${action} enviada al usuario ${uploaderUserId}`);
    } catch (error) {
        console.error(`❌ Error al crear notificación de documento ${action}:`, error);
    }
};

// ===== NOTIFICACIONES DE REUNIONES =====

/**
 * Crea notificación cuando se programa una reunión
 * @param {Object} meetingData - Datos de la reunión
 * @param {Array} participantIds - IDs de los participantes
 */
const notifyMeetingCreated = async (meetingData, participantIds = []) => {
    try {
        const fechaReunion = new Date(meetingData.fecha_hora_inicio).toLocaleDateString('es-MX');
        const horaReunion = new Date(meetingData.fecha_hora_inicio).toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit'
        });

        const mensaje = `Se ha programado la reunión "${meetingData.titulo}" para el ${fechaReunion} a las ${horaReunion}`;
        const enlaceAccion = `/meetings/${meetingData.id}`;

        // Notificar a todos los participantes excepto al creador
        for (const userId of participantIds) {
            if (userId !== meetingData.id_creador) {
                await createNotification({
                    id_usuario: userId,
                    tipo_codigo: 'MEETING_CREATED',
                    mensaje,
                    enlace_accion: enlaceAccion,
                    id_proyecto: meetingData.id_proyecto
                });
            }
        }

        console.log(`✅ Notificaciones de reunión creada enviadas a ${participantIds.length - 1} participantes`);
    } catch (error) {
        console.error('❌ Error al crear notificaciones de reunión:', error);
    }
};

/**
 * Crea notificación recordatorio de reunión
 * @param {Object} meetingData - Datos de la reunión
 * @param {Array} participantIds - IDs de los participantes
 */
const notifyMeetingReminder = async (meetingData, participantIds = []) => {
    try {
        const fechaReunion = new Date(meetingData.fecha_hora_inicio).toLocaleDateString('es-MX');
        const horaReunion = new Date(meetingData.fecha_hora_inicio).toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit'
        });

        const mensaje = `Recordatorio: Tienes la reunión "${meetingData.titulo}" hoy a las ${horaReunion}`;
        const enlaceAccion = `/meetings/${meetingData.id}`;

        // Notificar a todos los participantes
        for (const userId of participantIds) {
            await createNotification({
                id_usuario: userId,
                tipo_codigo: 'MEETING_REMINDER',
                mensaje,
                enlace_accion: enlaceAccion,
                id_proyecto: meetingData.id_proyecto
            });
        }

        console.log(`✅ Recordatorios de reunión enviados a ${participantIds.length} participantes`);
    } catch (error) {
        console.error('❌ Error al crear recordatorios de reunión:', error);
    }
};

/**
 * Crea notificación cuando se cancela una reunión
 * @param {Object} meetingData - Datos de la reunión
 * @param {Array} participantIds - IDs de los participantes
 */
const notifyMeetingCancelled = async (meetingData, participantIds = []) => {
    try {
        const mensaje = `La reunión "${meetingData.titulo}" ha sido cancelada`;
        const enlaceAccion = `/meetings`;

        // Notificar a todos los participantes excepto al que canceló
        for (const userId of participantIds) {
            await createNotification({
                id_usuario: userId,
                tipo_codigo: 'MEETING_CANCELLED',
                mensaje,
                enlace_accion: enlaceAccion,
                id_proyecto: meetingData.id_proyecto
            });
        }

        console.log(`✅ Notificaciones de reunión cancelada enviadas a ${participantIds.length} participantes`);
    } catch (error) {
        console.error('❌ Error al crear notificaciones de cancelación:', error);
    }
};

// ===== NOTIFICACIONES AUTOMÁTICAS Y PROGRAMADAS =====

/**
 * Envía notificaciones para tareas vencidas
 * Esta función debe ejecutarse diariamente (cron job o scheduled task)
 */
const sendOverdueTaskNotifications = async () => {
    try {
        console.log('🔄 Iniciando envío de notificaciones de tareas vencidas...');

        const overdueTasks = await getOverdueTasksForNotification();

        if (overdueTasks.length === 0) {
            console.log('✅ No hay tareas vencidas para notificar');
            return { sent: 0, errors: 0 };
        }

        let sentCount = 0;
        let errorCount = 0;

        for (const task of overdueTasks) {
            try {
                const mensaje = `⚠️ Tu tarea "${task.tarea_nombre}" está vencida desde hace ${task.dias_vencida} día(s)`;
                const enlaceAccion = `/projects/${task.id_proyecto}/tasks/${task.tarea_id}`;

                await createNotification({
                    id_usuario: task.id_usuario_asignado,
                    tipo_codigo: 'TASK_OVERDUE',
                    mensaje,
                    enlace_accion: enlaceAccion,
                    id_proyecto: task.id_proyecto,
                    id_tarea: task.tarea_id
                });

                sentCount++;
            } catch (error) {
                console.error(`❌ Error al notificar tarea vencida ${task.tarea_id}:`, error);
                errorCount++;
            }
        }

        console.log(`✅ Notificaciones de tareas vencidas: ${sentCount} enviadas, ${errorCount} errores`);
        return { sent: sentCount, errors: errorCount };

    } catch (error) {
        console.error('❌ Error general en envío de notificaciones de tareas vencidas:', error);
        return { sent: 0, errors: 1 };
    }
};

/**
 * Envía notificaciones para tareas que vencen pronto
 * Esta función debe ejecutarse diariamente
 */
const sendTasksDueSoonNotifications = async () => {
    try {
        console.log('🔄 Iniciando envío de notificaciones de tareas por vencer...');

        const tasksDueSoon = await getTasksDueSoonForNotification();

        if (tasksDueSoon.length === 0) {
            console.log('✅ No hay tareas por vencer para notificar');
            return { sent: 0, errors: 0 };
        }

        let sentCount = 0;
        let errorCount = 0;

        for (const task of tasksDueSoon) {
            try {
                const mensaje = `⏰ Tu tarea "${task.tarea_nombre}" vence en ${task.dias_restantes} día(s)`;
                const enlaceAccion = `/projects/${task.id_proyecto}/tasks/${task.tarea_id}`;

                await createNotification({
                    id_usuario: task.id_usuario_asignado,
                    tipo_codigo: 'TASK_DUE_SOON',
                    mensaje,
                    enlace_accion: enlaceAccion,
                    id_proyecto: task.id_proyecto,
                    id_tarea: task.tarea_id
                });

                sentCount++;
            } catch (error) {
                console.error(`❌ Error al notificar tarea por vencer ${task.tarea_id}:`, error);
                errorCount++;
            }
        }

        console.log(`✅ Notificaciones de tareas por vencer: ${sentCount} enviadas, ${errorCount} errores`);
        return { sent: sentCount, errors: errorCount };

    } catch (error) {
        console.error('❌ Error general en envío de notificaciones de tareas por vencer:', error);
        return { sent: 0, errors: 1 };
    }
};

/**
 * Ejecuta todas las notificaciones automáticas programadas
 * Esta es la función principal que se debe llamar desde un cron job
 */
const runScheduledNotifications = async () => {
    console.log('🚀 Iniciando proceso de notificaciones automáticas programadas...');

    const results = {
        timestamp: new Date().toISOString(),
        overdue_tasks: { sent: 0, errors: 0 },
        due_soon_tasks: { sent: 0, errors: 0 },
        total_sent: 0,
        total_errors: 0
    };

    // Ejecutar notificaciones de tareas vencidas
    results.overdue_tasks = await sendOverdueTaskNotifications();

    // Ejecutar notificaciones de tareas por vencer
    results.due_soon_tasks = await sendTasksDueSoonNotifications();

    // Calcular totales
    results.total_sent = results.overdue_tasks.sent + results.due_soon_tasks.sent;
    results.total_errors = results.overdue_tasks.errors + results.due_soon_tasks.errors;

    console.log(`🎯 Proceso completado: ${results.total_sent} notificaciones enviadas, ${results.total_errors} errores`);

    return results;
};

// ===== NOTIFICACIONES DE BIENVENIDA =====

/**
 * Crea notificación de bienvenida para nuevos usuarios
 * @param {Object} userData - Datos del usuario
 */
const notifyUserWelcome = async (userData) => {
    try {
        const mensaje = `¡Bienvenido ${userData.nombre} al Sistema de Gestión de Proyectos DTAI! Tu cuenta ha sido activada exitosamente.`;
        const enlaceAccion = '/dashboard';

        await createNotification({
            id_usuario: userData.id,
            tipo_codigo: 'USER_WELCOME',
            mensaje,
            enlace_accion: enlaceAccion
        });

        console.log(`✅ Notificación de bienvenida enviada al usuario ${userData.id}`);
    } catch (error) {
        console.error('❌ Error al crear notificación de bienvenida:', error);
    }
};

// ===== NOTIFICACIONES DEL SISTEMA =====

/**
 * Crea notificación de mantenimiento del sistema
 * @param {Array} userIds - IDs de usuarios a notificar
 * @param {Object} maintenanceInfo - Información del mantenimiento
 */
const notifySystemMaintenance = async (userIds, maintenanceInfo) => {
    try {
        const { fecha_inicio, fecha_fin, descripcion } = maintenanceInfo;
        const mensaje = `Mantenimiento programado: ${descripcion}. Desde ${fecha_inicio} hasta ${fecha_fin}`;
        const enlaceAccion = '/maintenance-info';

        for (const userId of userIds) {
            await createNotification({
                id_usuario: userId,
                tipo_codigo: 'SYSTEM_MAINTENANCE',
                mensaje,
                enlace_accion: enlaceAccion
            });
        }

        console.log(`✅ Notificaciones de mantenimiento enviadas a ${userIds.length} usuarios`);
    } catch (error) {
        console.error('❌ Error al crear notificaciones de mantenimiento:', error);
    }
};

/**
 * Crea notificación de actualización del sistema
 * @param {Array} userIds - IDs de usuarios a notificar
 * @param {string} versionInfo - Información de la nueva versión
 */
const notifySystemUpdate = async (userIds, versionInfo) => {
    try {
        const mensaje = `El sistema ha sido actualizado: ${versionInfo}`;
        const enlaceAccion = '/release-notes';

        for (const userId of userIds) {
            await createNotification({
                id_usuario: userId,
                tipo_codigo: 'SYSTEM_UPDATE',
                mensaje,
                enlace_accion: enlaceAccion
            });
        }

        console.log(`✅ Notificaciones de actualización enviadas a ${userIds.length} usuarios`);
    } catch (error) {
        console.error('❌ Error al crear notificaciones de actualización:', error);
    }
};

// ===== UTILIDADES DE BATCH =====

/**
 * Crea múltiples notificaciones de forma eficiente
 * @param {Array} notificationsData - Array de datos de notificaciones
 */
const createBulkNotifications = async (notificationsData) => {
    try {
        let successCount = 0;
        let errorCount = 0;

        // Procesar en lotes para evitar sobrecargar la BD
        const batchSize = 10;
        for (let i = 0; i < notificationsData.length; i += batchSize) {
            const batch = notificationsData.slice(i, i + batchSize);

            const promises = batch.map(async (notificationData) => {
                try {
                    await createNotification(notificationData);
                    successCount++;
                } catch (error) {
                    console.error('❌ Error en notificación batch:', error);
                    errorCount++;
                }
            });

            await Promise.all(promises);
        }

        console.log(`✅ Notificaciones en lote: ${successCount} enviadas, ${errorCount} errores`);
        return { success: successCount, errors: errorCount };

    } catch (error) {
        console.error('❌ Error general en notificaciones en lote:', error);
        return { success: 0, errors: notificationsData.length };
    }
};

module.exports = {
    // Notificaciones de tareas
    notifyTaskAssigned,
    notifyTaskStatusChanged,

    // Notificaciones de proyectos
    notifyUserAssignedToProject,
    notifyProjectCreated,

    // Notificaciones de documentos
    notifyDocumentPendingApproval,
    notifyDocumentStatusChanged,

    // Notificaciones de reuniones
    notifyMeetingCreated,
    notifyMeetingReminder,
    notifyMeetingCancelled,

    // Notificaciones automáticas/programadas
    sendOverdueTaskNotifications,
    sendTasksDueSoonNotifications,
    runScheduledNotifications,

    // Notificaciones de sistema
    notifyUserWelcome,
    notifySystemMaintenance,
    notifySystemUpdate,

    // Utilidades
    createBulkNotifications
};