// File: backend/src/routes/meetingRoutes.js
const express = require('express');
const { body, param, query } = require('express-validator');
const {
    getMeetingStates,
    getMeetingTypes,
    getAllMeetings,
    getMeetingByIdController,
    createMeetingController,
    updateMeetingController,
    deleteMeetingController,
    updateMeetingStatusController,
    getMeetingParticipantsController,
    addParticipantController,
    removeParticipantController,
    confirmAttendanceController,
    checkInMeetingController,
    getTodayMeetingsController,
    getMeetingStatisticsController,
    sendRemindersController
} = require('../controllers/meetingController');
const { handleValidationErrors } = require('../middlewares/validationMiddleware');
const authMiddleware = require('../middlewares/authMiddleware');
const { checkRole } = require('../middlewares/roleMiddleware');

const router = express.Router();

// ===== MIDDLEWARE GLOBAL =====
// Todas las rutas de reuniones requieren autenticación
router.use(authMiddleware);

// ===== RUTAS INFORMATIVAS (Para todos los usuarios autenticados) =====

/**
 * GET /api/v1/meetings/states
 * Obtiene todos los estados de reunión disponibles
 *
 * Útil para:
 * - Dropdowns en formularios
 * - Filtros de estado
 * - Validación en frontend
 */
router.get('/states', getMeetingStates);

/**
 * GET /api/v1/meetings/types
 * Obtiene todos los tipos de reunión disponibles
 *
 * Útil para:
 * - Selección de tipo al crear reunión
 * - Filtros por tipo
 * - Configuración de formularios
 */
router.get('/types', getMeetingTypes);

/**
 * GET /api/v1/meetings/statistics
 * Obtiene estadísticas de reuniones del usuario
 *
 * Útil para:
 * - Dashboard personal
 * - Widgets de estadísticas
 * - Reportes básicos
 */
router.get('/statistics', getMeetingStatisticsController);

/**
 * GET /api/v1/meetings/today
 * Obtiene las reuniones del día actual del usuario
 *
 * Query params opcionales:
 * - fecha: YYYY-MM-DD para obtener reuniones de fecha específica
 *
 * Útil para:
 * - Agenda diaria
 * - Widgets "reuniones de hoy"
 * - Planificación personal
 */
router.get('/today',
    query('fecha').optional().isDate().withMessage('Fecha debe ser válida (YYYY-MM-DD)'),
    handleValidationErrors,
    getTodayMeetingsController
);

// ===== RUTAS ADMINISTRATIVAS (Colocar antes de las rutas con parámetros) =====

/**
 * POST /api/v1/meetings/send-reminders
 * Ejecuta manualmente el envío de recordatorios
 *
 * Útil para:
 * - Testing del sistema de recordatorios
 * - Envío manual fuera del horario programado
 * - Debugging de notificaciones
 */
router.post('/send-reminders',
    checkRole(['Superadministrador', 'Administrador']),
    sendRemindersController
);

// ===== CRUD DE REUNIONES =====

/**
 * GET /api/v1/meetings
 * Obtiene reuniones con paginación y filtros
 *
 * Query params opcionales:
 * - page: número de página (default: 1)
 * - limit: elementos por página (default: 20, max: 100)
 * - proyecto_id: filtrar por proyecto específico
 * - estado_id: filtrar por estado (1=Programada, 2=Confirmada, etc.)
 * - tipo_id: filtrar por tipo (1=Presencial, 2=Virtual, etc.)
 * - fecha_desde: fecha desde (YYYY-MM-DD)
 * - fecha_hasta: fecha hasta (YYYY-MM-DD)
 * - search: búsqueda en título y descripción
 */
router.get('/',
    query('page').optional().isInt({ min: 1 }).withMessage('Página debe ser un número mayor a 0'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Límite debe ser entre 1 y 100'),
    query('proyecto_id').optional().isInt({ min: 1 }).withMessage('ID de proyecto debe ser un número válido'),
    query('estado_id').optional().isInt({ min: 1 }).withMessage('ID de estado debe ser un número válido'),
    query('tipo_id').optional().isInt({ min: 1 }).withMessage('ID de tipo debe ser un número válido'),
    query('fecha_desde').optional().isDate().withMessage('Fecha desde debe ser válida (YYYY-MM-DD)'),
    query('fecha_hasta').optional().isDate().withMessage('Fecha hasta debe ser válida (YYYY-MM-DD)'),
    query('search').optional().isLength({ max: 255 }).withMessage('Búsqueda debe tener máximo 255 caracteres'),
    handleValidationErrors,
    getAllMeetings
);

/**
 * POST /api/v1/meetings
 * Crea una nueva reunión
 *
 * Solo usuarios con rol Administrador o superior pueden crear reuniones
 */
router.post('/',
    checkRole(['Superadministrador', 'Administrador']),
    body('titulo')
        .isLength({ min: 1, max: 255 })
        .withMessage('Título es requerido y debe tener máximo 255 caracteres'),
    body('descripcion')
        .optional()
        .isLength({ max: 1000 })
        .withMessage('Descripción debe tener máximo 1000 caracteres'),
    body('fecha_hora_inicio')
        .isISO8601()
        .toDate()
        .withMessage('Fecha de inicio debe ser válida'),
    body('fecha_hora_fin')
        .isISO8601()
        .toDate()
        .withMessage('Fecha de fin debe ser válida'),
    body('ubicacion')
        .optional()
        .isLength({ max: 255 })
        .withMessage('Ubicación debe tener máximo 255 caracteres'),
    body('enlace_reunion')
        .optional()
        .isURL()
        .withMessage('Enlace de reunión debe ser una URL válida'),
    body('agenda')
        .optional()
        .isLength({ max: 2000 })
        .withMessage('Agenda debe tener máximo 2000 caracteres'),
    body('duracion_estimada')
        .optional()
        .isInt({ min: 1, max: 480 })
        .withMessage('Duración debe ser entre 1 y 480 minutos (8 horas)'),
    body('recordatorio_minutos')
        .optional()
        .isInt({ min: 0, max: 1440 })
        .withMessage('Recordatorio debe ser entre 0 y 1440 minutos (24 horas)'),
    body('es_recurrente')
        .optional()
        .isBoolean()
        .withMessage('Es recurrente debe ser true o false'),
    body('frecuencia_recurrencia')
        .optional()
        .isIn(['Semanal', 'Quincenal', 'Mensual'])
        .withMessage('Frecuencia debe ser Semanal, Quincenal o Mensual'),
    body('fecha_limite_recurrencia')
        .optional()
        .isDate()
        .withMessage('Fecha límite debe ser válida'),
    body('id_proyecto')
        .optional()
        .isInt({ min: 1 })
        .withMessage('ID de proyecto debe ser un número válido'),
    body('id_tipo_reunion')
        .optional()
        .isInt({ min: 1, max: 4 })
        .withMessage('Tipo de reunión debe ser válido (1-4)'),
    body('participantes')
        .optional()
        .isArray()
        .withMessage('Participantes debe ser un array'),
    body('participantes.*')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Cada participante debe ser un ID de usuario válido'),
    handleValidationErrors,
    createMeetingController
);

/**
 * GET /api/v1/meetings/:id
 * Obtiene una reunión específica por ID
 *
 * Incluye:
 * - Datos completos de la reunión
 * - Lista de participantes
 * - Estado y tipo de reunión
 */
router.get('/:id',
    param('id').isInt({ min: 1 }).withMessage('ID de reunión debe ser un número válido'),
    handleValidationErrors,
    getMeetingByIdController
);

/**
 * PUT /api/v1/meetings/:id
 * Actualiza una reunión existente
 *
 * Solo el creador de la reunión (o Superadministrador) puede editarla
 */
router.put('/:id',
    param('id').isInt({ min: 1 }).withMessage('ID de reunión debe ser un número válido'),
    body('titulo')
        .optional()
        .isLength({ min: 1, max: 255 })
        .withMessage('Título debe tener entre 1 y 255 caracteres'),
    body('descripcion')
        .optional()
        .isLength({ max: 1000 })
        .withMessage('Descripción debe tener máximo 1000 caracteres'),
    body('fecha_hora_inicio')
        .optional()
        .isISO8601()
        .toDate()
        .withMessage('Fecha de inicio debe ser válida'),
    body('fecha_hora_fin')
        .optional()
        .isISO8601()
        .toDate()
        .withMessage('Fecha de fin debe ser válida'),
    body('ubicacion')
        .optional()
        .isLength({ max: 255 })
        .withMessage('Ubicación debe tener máximo 255 caracteres'),
    body('enlace_reunion')
        .optional()
        .isURL()
        .withMessage('Enlace de reunión debe ser una URL válida'),
    body('agenda')
        .optional()
        .isLength({ max: 2000 })
        .withMessage('Agenda debe tener máximo 2000 caracteres'),
    body('notas')
        .optional()
        .isLength({ max: 2000 })
        .withMessage('Notas deben tener máximo 2000 caracteres'),
    body('duracion_estimada')
        .optional()
        .isInt({ min: 1, max: 480 })
        .withMessage('Duración debe ser entre 1 y 480 minutos'),
    body('recordatorio_minutos')
        .optional()
        .isInt({ min: 0, max: 1440 })
        .withMessage('Recordatorio debe ser entre 0 y 1440 minutos'),
    body('es_recurrente')
        .optional()
        .isBoolean()
        .withMessage('Es recurrente debe ser true o false'),
    body('frecuencia_recurrencia')
        .optional()
        .isIn(['Semanal', 'Quincenal', 'Mensual'])
        .withMessage('Frecuencia debe ser Semanal, Quincenal o Mensual'),
    body('fecha_limite_recurrencia')
        .optional()
        .isDate()
        .withMessage('Fecha límite debe ser válida'),
    body('id_proyecto')
        .optional()
        .isInt({ min: 1 })
        .withMessage('ID de proyecto debe ser un número válido'),
    body('id_tipo_reunion')
        .optional()
        .isInt({ min: 1, max: 4 })
        .withMessage('Tipo de reunión debe ser válido (1-4)'),
    body('participantes')
        .optional()
        .isArray()
        .withMessage('Participantes debe ser un array'),
    body('participantes.*')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Cada participante debe ser un ID de usuario válido'),
    handleValidationErrors,
    updateMeetingController
);

/**
 * DELETE /api/v1/meetings/:id
 * Elimina una reunión
 *
 * Solo el creador (o Superadministrador) puede eliminar la reunión.
 * Se envían notificaciones de cancelación a todos los participantes.
 */
router.delete('/:id',
    param('id').isInt({ min: 1 }).withMessage('ID de reunión debe ser un número válido'),
    handleValidationErrors,
    deleteMeetingController
);

// ===== GESTIÓN DE ESTADO =====

/**
 * PUT /api/v1/meetings/:id/status
 * Actualiza el estado de una reunión
 *
 * Estados disponibles:
 * - 1: Programada
 * - 2: Confirmada
 * - 3: En Curso
 * - 4: Finalizada
 * - 5: Cancelada
 * - 6: Pospuesta
 */
router.put('/:id/status',
    param('id').isInt({ min: 1 }).withMessage('ID de reunión debe ser un número válido'),
    body('estado_id')
        .isInt({ min: 1, max: 6 })
        .withMessage('Estado debe ser un número válido (1-6)'),
    body('notas')
        .optional()
        .isLength({ max: 2000 })
        .withMessage('Notas deben tener máximo 2000 caracteres'),
    handleValidationErrors,
    updateMeetingStatusController
);

// ===== GESTIÓN DE PARTICIPANTES =====

/**
 * GET /api/v1/meetings/:id/participants
 * Obtiene los participantes de una reunión
 *
 * Incluye información completa de cada participante:
 * - Datos del usuario
 * - Rol en la reunión
 * - Estado de confirmación
 * - Asistencia real
 */
router.get('/:id/participants',
    param('id').isInt({ min: 1 }).withMessage('ID de reunión debe ser un número válido'),
    handleValidationErrors,
    getMeetingParticipantsController
);

/**
 * POST /api/v1/meetings/:id/participants
 * Agrega un participante a una reunión
 *
 * Solo el creador de la reunión puede agregar participantes.
 * Se envía invitación automática al nuevo participante.
 */
router.post('/:id/participants',
    param('id').isInt({ min: 1 }).withMessage('ID de reunión debe ser un número válido'),
    body('user_id')
        .isInt({ min: 1 })
        .withMessage('ID de usuario debe ser un número válido'),
    body('rol_participante')
        .optional()
        .isIn(['Organizador', 'Presentador', 'Participante', 'Observador'])
        .withMessage('Rol debe ser válido (Organizador, Presentador, Participante, Observador)'),
    handleValidationErrors,
    addParticipantController
);

/**
 * DELETE /api/v1/meetings/:id/participants/:userId
 * Remueve un participante de una reunión
 *
 * Solo el creador puede remover participantes.
 * No se puede remover al creador de la reunión.
 */
router.delete('/:id/participants/:userId',
    param('id').isInt({ min: 1 }).withMessage('ID de reunión debe ser un número válido'),
    param('userId').isInt({ min: 1 }).withMessage('ID de usuario debe ser un número válido'),
    handleValidationErrors,
    removeParticipantController
);

/**
 * PUT /api/v1/meetings/:id/attendance
 * Confirma o cancela asistencia a una reunión
 *
 * Solo participantes invitados pueden usar este endpoint.
 * Permite confirmar (true) o cancelar (false) asistencia.
 */
router.put('/:id/attendance',
    param('id').isInt({ min: 1 }).withMessage('ID de reunión debe ser un número válido'),
    body('confirmacion')
        .optional()
        .isBoolean()
        .withMessage('Confirmación debe ser true o false'),
    handleValidationErrors,
    confirmAttendanceController
);

/**
 * POST /api/v1/meetings/:id/check-in
 * Registra asistencia real a una reunión
 *
 * Usado cuando el participante realmente asiste a la reunión.
 * Registra fecha y hora de asistencia real.
 */
router.post('/:id/check-in',
    param('id').isInt({ min: 1 }).withMessage('ID de reunión debe ser un número válido'),
    handleValidationErrors,
    checkInMeetingController
);

module.exports = router;