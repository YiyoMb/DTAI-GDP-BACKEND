// File: backend/src/controllers/meetingController.js
const {
    getAllMeetingStates,
    getAllMeetingTypes,
    getMeetingsWithPagination,
    getMeetingById,
    createMeeting,
    updateMeeting,
    deleteMeeting,
    updateMeetingStatus,
    getMeetingParticipants,
    addMeetingParticipant,
    removeMeetingParticipant,
    confirmMeetingAttendance,
    registerRealAttendance,
    isUserInvitedToMeeting,
    getUserMeetingsForDay,
    getMeetingStatistics
} = require('../models/meetingModel');

const {
    inviteUsersToMeeting,
    updateMeetingParticipants,
    sendMeetingReminders,
    cancelMeeting,
    startMeeting,
    endMeeting,
    validateMeetingData,
    checkTimeConflicts,
    generateMeetingLink,
    calculateDuration
} = require('../services/meetingService');

const { AppError } = require('../utils/errorHandler');

// ===== ENDPOINTS INFORMATIVOS =====

/**
 * Obtiene todos los estados de reunión disponibles
 * GET /api/v1/meetings/states
 */
const getMeetingStates = async (req, res, next) => {
    try {
        const states = await getAllMeetingStates();

        res.status(200).json({
            success: true,
            message: 'Estados de reunión obtenidos exitosamente',
            data: {
                states,
                total: states.length
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Obtiene todos los tipos de reunión disponibles
 * GET /api/v1/meetings/types
 */
const getMeetingTypes = async (req, res, next) => {
    try {
        const types = await getAllMeetingTypes();

        res.status(200).json({
            success: true,
            message: 'Tipos de reunión obtenidos exitosamente',
            data: {
                types,
                total: types.length
            }
        });
    } catch (error) {
        next(error);
    }
};

// ===== CRUD DE REUNIONES =====

/**
 * Obtiene reuniones con paginación y filtros
 * GET /api/v1/meetings
 */
const getAllMeetings = async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 20,
            proyecto_id = null,
            estado_id = null,
            tipo_id = null,
            fecha_desde = null,
            fecha_hasta = null,
            search = ''
        } = req.query;

        const filters = {
            proyecto_id: proyecto_id ? parseInt(proyecto_id) : null,
            estado_id: estado_id ? parseInt(estado_id) : null,
            tipo_id: tipo_id ? parseInt(tipo_id) : null,
            fecha_desde,
            fecha_hasta,
            search: search.trim()
        };

        const result = await getMeetingsWithPagination(
            filters,
            parseInt(page),
            parseInt(limit),
            req.user.id,
            req.user.rol
        );

        res.status(200).json({
            success: true,
            message: 'Reuniones obtenidas exitosamente',
            data: result.meetings,
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
 * Obtiene una reunión específica por ID
 * GET /api/v1/meetings/:id
 */
const getMeetingByIdController = async (req, res, next) => {
    try {
        const { id } = req.params;

        const meeting = await getMeetingById(id, req.user.id, req.user.rol);
        if (!meeting) {
            return next(new AppError('Reunión no encontrada o sin permisos para verla', 404));
        }

        // Obtener participantes
        const participants = await getMeetingParticipants(id);

        const meetingWithParticipants = {
            ...meeting,
            participantes: participants
        };

        res.status(200).json({
            success: true,
            message: 'Reunión obtenida exitosamente',
            data: meetingWithParticipants
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Crea una nueva reunión
 * POST /api/v1/meetings
 */
const createMeetingController = async (req, res, next) => {
    try {
        const {
            titulo,
            descripcion,
            fecha_hora_inicio,
            fecha_hora_fin,
            ubicacion,
            enlace_reunion,
            agenda,
            duracion_estimada,
            recordatorio_minutos = 30,
            es_recurrente = false,
            frecuencia_recurrencia,
            fecha_limite_recurrencia,
            id_proyecto,
            id_tipo_reunion = 1,
            participantes = [] // Array de IDs de usuarios
        } = req.body;

        // Calcular duración si no se proporciona
        const calculatedDuration = duracion_estimada || calculateDuration(fecha_hora_inicio, fecha_hora_fin);

        const meetingData = {
            titulo,
            descripcion,
            fecha_hora_inicio,
            fecha_hora_fin,
            ubicacion,
            enlace_reunion: enlace_reunion || (id_tipo_reunion === 2 ? await generateMeetingLink({ titulo }) : null),
            agenda,
            duracion_estimada: calculatedDuration,
            recordatorio_minutos,
            es_recurrente,
            frecuencia_recurrencia,
            fecha_limite_recurrencia,
            id_proyecto,
            id_tipo_reunion,
            id_creador: req.user.id
        };

        // Validar datos de la reunión
        const validation = await validateMeetingData(meetingData);
        if (!validation.valid) {
            return next(new AppError(validation.errors.join(', '), 400));
        }

        // Verificar conflictos de horario para el creador
        const conflicts = await checkTimeConflicts(req.user.id, fecha_hora_inicio, fecha_hora_fin);
        if (conflicts.length > 0) {
            console.log(`⚠️ Usuario ${req.user.id} tiene conflictos de horario`);
            // No bloqueamos la creación, solo advertimos
        }

        // Crear la reunión
        const result = await createMeeting(meetingData);
        const meetingId = result.insertId;

        // Invitar participantes si se proporcionaron
        let invitationResult = { success: 0, errors: 0 };
        if (participantes.length > 0) {
            invitationResult = await inviteUsersToMeeting(
                meetingId,
                participantes,
                { ...meetingData, id: meetingId }
            );
        }

        // Obtener la reunión creada con todos los datos
        const newMeeting = await getMeetingById(meetingId, req.user.id, req.user.rol);

        res.status(201).json({
            success: true,
            message: 'Reunión creada exitosamente',
            data: {
                meeting: newMeeting,
                invitations: {
                    sent: invitationResult.success,
                    failed: invitationResult.errors
                }
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Actualiza una reunión existente
 * PUT /api/v1/meetings/:id
 */
const updateMeetingController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Verificar que la reunión existe y que el usuario tiene permisos
        const existingMeeting = await getMeetingById(id, req.user.id, req.user.rol);
        if (!existingMeeting) {
            return next(new AppError('Reunión no encontrada o sin permisos para editarla', 404));
        }

        // Solo el creador puede editar (excepto Superadministrador)
        if (req.user.rol !== 'Superadministrador' && existingMeeting.id_creador !== req.user.id) {
            return next(new AppError('Solo el creador de la reunión puede editarla', 403));
        }

        // Remover participantes del updateData para manejarlos por separado
        const { participantes, ...meetingUpdateData } = updateData;

        // Validar datos si se actualizan fechas
        if (meetingUpdateData.fecha_hora_inicio || meetingUpdateData.fecha_hora_fin) {
            const validation = await validateMeetingData({
                ...existingMeeting,
                ...meetingUpdateData
            });
            if (!validation.valid) {
                return next(new AppError(validation.errors.join(', '), 400));
            }
        }

        // Actualizar la reunión
        const result = await updateMeeting(id, meetingUpdateData, req.user.id, req.user.rol);

        if (result.affectedRows === 0) {
            return next(new AppError('No se pudo actualizar la reunión', 400));
        }

        // Actualizar participantes si se proporcionaron
        let participantResult = null;
        if (participantes) {
            const currentParticipants = await getMeetingParticipants(id);
            const currentIds = currentParticipants.map(p => p.id_usuario);

            participantResult = await updateMeetingParticipants(
                id,
                participantes,
                currentIds,
                { ...existingMeeting, ...meetingUpdateData, id }
            );
        }

        // Obtener la reunión actualizada
        const updatedMeeting = await getMeetingById(id, req.user.id, req.user.rol);

        res.status(200).json({
            success: true,
            message: 'Reunión actualizada exitosamente',
            data: {
                meeting: updatedMeeting,
                participants_updated: participantResult
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Elimina una reunión
 * DELETE /api/v1/meetings/:id
 */
const deleteMeetingController = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Verificar que la reunión existe
        const existingMeeting = await getMeetingById(id, req.user.id, req.user.rol);
        if (!existingMeeting) {
            return next(new AppError('Reunión no encontrada', 404));
        }

        // Solo el creador puede eliminar (excepto Superadministrador)
        if (req.user.rol !== 'Superadministrador' && existingMeeting.id_creador !== req.user.id) {
            return next(new AppError('Solo el creador de la reunión puede eliminarla', 403));
        }

        // Obtener participantes antes de eliminar para notificarles
        const participants = await getMeetingParticipants(id);
        const participantIds = participants.map(p => p.id_usuario);

        // Eliminar la reunión
        const result = await deleteMeeting(id, req.user.id, req.user.rol);

        if (result.affectedRows === 0) {
            return next(new AppError('No se pudo eliminar la reunión', 400));
        }

        // Notificar cancelación a participantes
        if (participantIds.length > 0) {
            await cancelMeeting(id, existingMeeting, participantIds, 'Reunión eliminada');
        }

        res.status(200).json({
            success: true,
            message: 'Reunión eliminada exitosamente',
            data: {
                meeting_id: id,
                participants_notified: participantIds.length
            }
        });
    } catch (error) {
        next(error);
    }
};

// ===== GESTIÓN DE ESTADO =====

/**
 * Actualiza el estado de una reunión
 * PUT /api/v1/meetings/:id/status
 */
const updateMeetingStatusController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { estado_id, notas } = req.body;

        // Verificar que la reunión existe
        const existingMeeting = await getMeetingById(id, req.user.id, req.user.rol);
        if (!existingMeeting) {
            return next(new AppError('Reunión no encontrada', 404));
        }

        // Solo el creador puede cambiar el estado (excepto Superadministrador)
        if (req.user.rol !== 'Superadministrador' && existingMeeting.id_creador !== req.user.id) {
            return next(new AppError('Solo el creador puede cambiar el estado de la reunión', 403));
        }

        // Actualizar estado
        const result = await updateMeetingStatus(id, estado_id, req.user.id, req.user.rol);

        if (result.affectedRows === 0) {
            return next(new AppError('No se pudo actualizar el estado de la reunión', 400));
        }

        // Agregar notas si se proporcionaron
        if (notas) {
            await updateMeeting(id, { notas }, req.user.id, req.user.rol);
        }

        // Ejecutar acciones según el nuevo estado
        const participants = await getMeetingParticipants(id);
        const participantIds = participants.map(p => p.id_usuario);

        switch (estado_id) {
            case 3: // En Curso
                await startMeeting(id, existingMeeting);
                break;
            case 4: // Finalizada
                await endMeeting(id, existingMeeting, notas);
                break;
            case 5: // Cancelada
                await cancelMeeting(id, existingMeeting, participantIds, 'Reunión cancelada');
                break;
        }

        const updatedMeeting = await getMeetingById(id, req.user.id, req.user.rol);

        res.status(200).json({
            success: true,
            message: 'Estado de reunión actualizado exitosamente',
            data: updatedMeeting
        });
    } catch (error) {
        next(error);
    }
};

// ===== GESTIÓN DE PARTICIPANTES =====

/**
 * Obtiene los participantes de una reunión
 * GET /api/v1/meetings/:id/participants
 */
const getMeetingParticipantsController = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Verificar acceso a la reunión
        const meeting = await getMeetingById(id, req.user.id, req.user.rol);
        if (!meeting) {
            return next(new AppError('Reunión no encontrada o sin permisos', 404));
        }

        const participants = await getMeetingParticipants(id);

        res.status(200).json({
            success: true,
            message: 'Participantes obtenidos exitosamente',
            data: {
                meeting_id: id,
                meeting_title: meeting.titulo,
                participants,
                total_participants: participants.length
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Agrega un participante a una reunión
 * POST /api/v1/meetings/:id/participants
 */
const addParticipantController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { user_id, rol_participante = 'Participante' } = req.body;

        // Verificar que la reunión existe y que el usuario tiene permisos
        const meeting = await getMeetingById(id, req.user.id, req.user.rol);
        if (!meeting) {
            return next(new AppError('Reunión no encontrada', 404));
        }

        // Solo el creador puede agregar participantes (excepto Superadministrador)
        if (req.user.rol !== 'Superadministrador' && meeting.id_creador !== req.user.id) {
            return next(new AppError('Solo el creador puede agregar participantes', 403));
        }

        // Verificar que el usuario no esté ya invitado
        const isAlreadyInvited = await isUserInvitedToMeeting(id, user_id);
        if (isAlreadyInvited) {
            return next(new AppError('El usuario ya está invitado a esta reunión', 400));
        }

        // Agregar participante
        await addMeetingParticipant(id, user_id, rol_participante);

        // Enviar invitación
        await inviteUsersToMeeting(id, [user_id], meeting);

        res.status(201).json({
            success: true,
            message: 'Participante agregado exitosamente',
            data: {
                meeting_id: id,
                user_id,
                rol_participante
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Remueve un participante de una reunión
 * DELETE /api/v1/meetings/:id/participants/:userId
 */
const removeParticipantController = async (req, res, next) => {
    try {
        const { id, userId } = req.params;

        // Verificar que la reunión existe
        const meeting = await getMeetingById(id, req.user.id, req.user.rol);
        if (!meeting) {
            return next(new AppError('Reunión no encontrada', 404));
        }

        // Solo el creador puede remover participantes (excepto Superadministrador)
        if (req.user.rol !== 'Superadministrador' && meeting.id_creador !== req.user.id) {
            return next(new AppError('Solo el creador puede remover participantes', 403));
        }

        // No permitir remover al creador
        if (parseInt(userId) === meeting.id_creador) {
            return next(new AppError('No se puede remover al creador de la reunión', 400));
        }

        const result = await removeMeetingParticipant(id, userId);

        if (result.affectedRows === 0) {
            return next(new AppError('Participante no encontrado en esta reunión', 404));
        }

        res.status(200).json({
            success: true,
            message: 'Participante removido exitosamente',
            data: {
                meeting_id: id,
                user_id: userId
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Confirma asistencia a una reunión
 * PUT /api/v1/meetings/:id/attendance
 */
const confirmAttendanceController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { confirmacion = true } = req.body;

        // Verificar que el usuario está invitado a la reunión
        const isInvited = await isUserInvitedToMeeting(id, req.user.id);
        if (!isInvited) {
            return next(new AppError('No estás invitado a esta reunión', 403));
        }

        const result = await confirmMeetingAttendance(id, req.user.id, confirmacion);

        if (result.affectedRows === 0) {
            return next(new AppError('No se pudo actualizar la confirmación de asistencia', 400));
        }

        res.status(200).json({
            success: true,
            message: confirmacion ? 'Asistencia confirmada' : 'Asistencia cancelada',
            data: {
                meeting_id: id,
                user_id: req.user.id,
                confirmed: confirmacion
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Registra asistencia real a una reunión
 * POST /api/v1/meetings/:id/check-in
 */
const checkInMeetingController = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Verificar que el usuario está invitado a la reunión
        const isInvited = await isUserInvitedToMeeting(id, req.user.id);
        if (!isInvited) {
            return next(new AppError('No estás invitado a esta reunión', 403));
        }

        const result = await registerRealAttendance(id, req.user.id);

        if (result.affectedRows === 0) {
            return next(new AppError('No se pudo registrar la asistencia', 400));
        }

        res.status(200).json({
            success: true,
            message: 'Asistencia registrada exitosamente',
            data: {
                meeting_id: id,
                user_id: req.user.id,
                check_in_time: new Date().toISOString()
            }
        });
    } catch (error) {
        next(error);
    }
};

// ===== CONSULTAS ESPECIALES =====

/**
 * Obtiene las reuniones del día para el usuario
 * GET /api/v1/meetings/today
 */
const getTodayMeetingsController = async (req, res, next) => {
    try {
        const { fecha } = req.query; // Opcional: fecha específica

        const meetings = await getUserMeetingsForDay(req.user.id, fecha);

        res.status(200).json({
            success: true,
            message: 'Reuniones del día obtenidas exitosamente',
            data: {
                fecha: fecha || new Date().toISOString().split('T')[0],
                meetings,
                total: meetings.length
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Obtiene estadísticas de reuniones
 * GET /api/v1/meetings/statistics
 */
const getMeetingStatisticsController = async (req, res, next) => {
    try {
        const statistics = await getMeetingStatistics(req.user.id, req.user.rol);

        res.status(200).json({
            success: true,
            message: 'Estadísticas de reuniones obtenidas exitosamente',
            data: statistics
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Ejecuta envío manual de recordatorios (solo administradores)
 * POST /api/v1/meetings/send-reminders
 */
const sendRemindersController = async (req, res, next) => {
    try {
        const result = await sendMeetingReminders();

        res.status(200).json({
            success: true,
            message: 'Recordatorios de reuniones enviados',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    // Información general
    getMeetingStates,
    getMeetingTypes,

    // CRUD de reuniones
    getAllMeetings,
    getMeetingByIdController,
    createMeetingController,
    updateMeetingController,
    deleteMeetingController,

    // Gestión de estado
    updateMeetingStatusController,

    // Gestión de participantes
    getMeetingParticipantsController,
    addParticipantController,
    removeParticipantController,
    confirmAttendanceController,
    checkInMeetingController,

    // Consultas especiales
    getTodayMeetingsController,
    getMeetingStatisticsController,
    sendRemindersController
};