// File: backend/src/controllers/dashboardController.js
const {
    getGeneralSummary,
    getProjectStatusDistribution,
    getProjectRiskDistribution,
    getProjectTypeDistribution,
    getTaskStatusDistribution,
    getOverdueTasks,
    getRecentProjects,
    getPortfolioPerformance
} = require('../models/dashboardModel');
const { AppError } = require('../utils/errorHandler');

/**
 * Obtiene el dashboard completo con todas las métricas
 * Esta función combina todas las estadísticas en una sola respuesta
 */
const getDashboardData = async (req, res, next) => {
    try {
        const { id: userId, rol: userRole } = req.user;

        // Ejecutar todas las consultas en paralelo para mejor rendimiento
        const [
            generalSummary,
            projectStatusDistribution,
            projectRiskDistribution,
            projectTypeDistribution,
            taskStatusDistribution,
            overdueTasks,
            recentProjects,
            portfolioPerformance
        ] = await Promise.all([
            getGeneralSummary(userId, userRole),
            getProjectStatusDistribution(userId, userRole),
            getProjectRiskDistribution(userId, userRole),
            getProjectTypeDistribution(userId, userRole),
            getTaskStatusDistribution(userId, userRole),
            getOverdueTasks(userId, userRole),
            getRecentProjects(userId, userRole),
            getPortfolioPerformance(userId, userRole)
        ]);

        // Structurar la respuesta de manera organizada
        const dashboardData = {
            // Resumen general con números clave
            resumen: {
                ...generalSummary,
                // Calcular porcentajes adicionales
                porcentaje_proyectos_activos: generalSummary.total_proyectos > 0
                    ? Math.round((generalSummary.proyectos_activos / generalSummary.total_proyectos) * 100)
                    : 0,
                porcentaje_tareas_pendientes: generalSummary.total_tareas > 0
                    ? Math.round((generalSummary.tareas_pendientes / generalSummary.total_tareas) * 100)
                    : 0
            },

            // Distribuciones para gráficos
            distribuciones: {
                proyectos_por_estatus: projectStatusDistribution,
                proyectos_por_riesgo: projectRiskDistribution,
                proyectos_por_tipo: projectTypeDistribution,
                tareas_por_estatus: taskStatusDistribution
            },

            // Alertas y elementos que requieren atención
            alertas: {
                tareas_vencidas: overdueTasks,
                total_tareas_vencidas: overdueTasks.length
            },

            // Actividad reciente
            actividad_reciente: {
                proyectos_recientes: recentProjects,
                portafolios_destacados: portfolioPerformance
            },

            // Metadata útil para el frontend
            metadata: {
                fecha_actualizacion: new Date().toISOString(),
                usuario_rol: userRole,
                alcance: userRole === 'Administrador' ? 'personal' : 'global'
            }
        };

        res.status(200).json({
            success: true,
            message: 'Dashboard obtenido exitosamente',
            data: dashboardData
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Obtiene solo el resumen general (endpoint más liviano)
 * Útil para actualizaciones rápidas o widgets específicos
 */
const getGeneralSummaryController = async (req, res, next) => {
    try {
        const { id: userId, rol: userRole } = req.user;

        const summary = await getGeneralSummary(userId, userRole);

        res.status(200).json({
            success: true,
            message: 'Resumen general obtenido exitosamente',
            data: {
                ...summary,
                porcentaje_proyectos_activos: summary.total_proyectos > 0
                    ? Math.round((summary.proyectos_activos / summary.total_proyectos) * 100)
                    : 0,
                porcentaje_tareas_pendientes: summary.total_tareas > 0
                    ? Math.round((summary.tareas_pendientes / summary.total_tareas) * 100)
                    : 0,
                fecha_actualizacion: new Date().toISOString()
            }
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Obtiene solo las distribuciones para gráficos
 * Útil cuando el frontend solo necesita actualizar los gráficos
 */
const getDistributionsController = async (req, res, next) => {
    try {
        const { id: userId, rol: userRole } = req.user;
        const { tipo } = req.query; // 'proyectos' | 'tareas' | 'riesgo' | 'tipos'

        let data = {};

        // Permitir solicitar distribuciones específicas para optimizar rendimiento
        if (!tipo || tipo === 'proyectos') {
            data.proyectos_por_estatus = await getProjectStatusDistribution(userId, userRole);
        }

        if (!tipo || tipo === 'riesgo') {
            data.proyectos_por_riesgo = await getProjectRiskDistribution(userId, userRole);
        }

        if (!tipo || tipo === 'tipos') {
            data.proyectos_por_tipo = await getProjectTypeDistribution(userId, userRole);
        }

        if (!tipo || tipo === 'tareas') {
            data.tareas_por_estatus = await getTaskStatusDistribution(userId, userRole);
        }

        res.status(200).json({
            success: true,
            message: 'Distribuciones obtenidas exitosamente',
            data
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Obtiene solo las alertas críticas
 * Útil para notificaciones o widgets de alerta
 */
const getAlertsController = async (req, res, next) => {
    try {
        const { id: userId, rol: userRole } = req.user;

        const overdueTasks = await getOverdueTasks(userId, userRole);

        // Categorizar alertas por severidad
        const alerts = {
            criticas: overdueTasks.filter(task => task.dias_vencida > 7 || task.nivel_prioridad === 'Alta'),
            moderadas: overdueTasks.filter(task => task.dias_vencida <= 7 && task.dias_vencida > 3 && task.nivel_prioridad !== 'Alta'),
            leves: overdueTasks.filter(task => task.dias_vencida <= 3 && task.nivel_prioridad === 'Baja'),
            total: overdueTasks.length
        };

        res.status(200).json({
            success: true,
            message: 'Alertas obtenidas exitosamente',
            data: alerts
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Obtiene métricas de rendimiento por portafolio
 * Útil para comparar performance entre diferentes portafolios
 */
const getPerformanceController = async (req, res, next) => {
    try {
        const { id: userId, rol: userRole } = req.user;

        const performance = await getPortfolioPerformance(userId, userRole);

        res.status(200).json({
            success: true,
            message: 'Métricas de rendimiento obtenidas exitosamente',
            data: {
                portafolios: performance,
                mejores_3: performance.slice(0, 3),
                total_portafolios: performance.length
            }
        });

    } catch (error) {
        next(error);
    }
};

module.exports = {
    getDashboardData,
    getGeneralSummaryController,
    getDistributionsController,
    getAlertsController,
    getPerformanceController
};