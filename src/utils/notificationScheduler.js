// File: backend/src/utils/notificationScheduler.js
const cron = require('node-cron');
const { runScheduledNotifications } = require('../services/notificationService');

/**
 * Configurador de tareas programadas para notificaciones automáticas
 *
 * Este módulo configura trabajos cron que se ejecutan automáticamente
 * para enviar notificaciones de tareas vencidas y otros eventos programados
 */

/**
 * Inicia todos los trabajos programados de notificaciones
 */
const startNotificationScheduler = () => {
    console.log('🕒 Iniciando programador de notificaciones automáticas...');

    // ===== NOTIFICACIONES DIARIAS DE TAREAS VENCIDAS =====
    // Se ejecuta todos los días a las 9:00 AM
    cron.schedule('0 9 * * *', async () => {
        console.log('🔔 Ejecutando notificaciones programadas diarias - 9:00 AM');
        try {
            const results = await runScheduledNotifications();
            console.log('✅ Notificaciones programadas completadas:', results);
        } catch (error) {
            console.error('❌ Error en notificaciones programadas:', error);
        }
    }, {
        scheduled: true,
        timezone: "America/Mexico_City" // Ajustar según tu zona horaria
    });

    // ===== NOTIFICACIONES DE TAREAS QUE VENCEN HOY =====
    // Se ejecuta todos los días a las 8:00 AM
    cron.schedule('0 8 * * *', async () => {
        console.log('🔔 Ejecutando notificaciones de tareas que vencen hoy - 8:00 AM');
        try {
            const results = await runScheduledNotifications();
            console.log('✅ Notificaciones de vencimientos completadas:', results);
        } catch (error) {
            console.error('❌ Error en notificaciones de vencimientos:', error);
        }
    }, {
        scheduled: true,
        timezone: "America/Mexico_City"
    });

    // ===== LIMPIEZA SEMANAL DE NOTIFICACIONES ANTIGUAS =====
    // Se ejecuta todos los domingos a las 2:00 AM
    cron.schedule('0 2 * * 0', () => {
        console.log('🧹 Ejecutando limpieza semanal de notificaciones antiguas...');
        // Esta funcionalidad ya está implementada en el evento MySQL
        // pero podríamos agregar lógica adicional aquí si fuera necesario
        console.log('✅ Limpieza programada (manejada por eventos MySQL)');
    }, {
        scheduled: true,
        timezone: "America/Mexico_City"
    });

    // ===== REPORTE DE ESTADÍSTICAS SEMANALES (FUTURO) =====
    // Se ejecuta todos los lunes a las 10:00 AM
    cron.schedule('0 10 * * 1', () => {
        console.log('📊 Generando reporte semanal de notificaciones...');
        // Funcionalidad futura para estadísticas
        console.log('📈 Reporte semanal (funcionalidad futura)');
    }, {
        scheduled: true,
        timezone: "America/Mexico_City"
    });

    console.log('✅ Programador de notificaciones iniciado exitosamente');
    console.log('📅 Horarios configurados:');
    console.log('   - 8:00 AM: Notificaciones de tareas que vencen hoy');
    console.log('   - 9:00 AM: Notificaciones de tareas vencidas');
    console.log('   - 2:00 AM (Domingos): Limpieza de notificaciones antiguas');
    console.log('   - 10:00 AM (Lunes): Reporte semanal');
};

/**
 * Detiene todos los trabajos programados
 */
const stopNotificationScheduler = () => {
    cron.getTasks().forEach((task) => {
        task.stop();
    });
    console.log('🔴 Programador de notificaciones detenido');
};

/**
 * Función para testing: ejecuta las notificaciones inmediatamente
 */
const runNotificationsNow = async () => {
    console.log('🧪 Ejecutando notificaciones inmediatamente (modo testing)...');
    try {
        const results = await runScheduledNotifications();
        console.log('✅ Testing completado:', results);
        return results;
    } catch (error) {
        console.error('❌ Error en testing de notificaciones:', error);
        throw error;
    }
};

module.exports = {
    startNotificationScheduler,
    stopNotificationScheduler,
    runNotificationsNow
};

// ===== INSTRUCCIONES DE INSTALACIÓN =====
/*
Para usar este módulo necesitas instalar node-cron:

npm install node-cron

Luego, en tu server.js, agregar:

const { startNotificationScheduler } = require('./utils/notificationScheduler');

// Después de inicializar la base de datos
startNotificationScheduler();

FORMATOS DE CRON:
┌────────────── second (optional)
│ ┌──────────── minute
│ │ ┌────────── hour
│ │ │ ┌──────── day of month
│ │ │ │ ┌────── month
│ │ │ │ │ ┌──── day of week
│ │ │ │ │ │
│ │ │ │ │ │
* * * * * *

Ejemplos:
'0 9 * * *'     = Todos los días a las 9:00 AM
'0 8 * * 1-5'   = Lunes a viernes a las 8:00 AM
'0 2 * * 0'     = Domingos a las 2:00 AM
'*´/30 * * * *'  = Cada 30 minutos
'0 0 1 * *'     = El día 1 de cada mes a medianoche
*/