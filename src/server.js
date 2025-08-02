// File: backend/src/server.js - VERSIÓN ACTUALIZADA
const app = require('./app');
const { connectDB } = require('./config/database');
const { startNotificationScheduler } = require('./utils/notificationScheduler');

// Configuración del puerto
const PORT = process.env.PORT || 3000;

// Función para inicializar el servidor
const startServer = async () => {
  try {
    // Conectar a la base de datos
    await connectDB();
    console.log('✅ Conexión a la base de datos establecida exitosamente');

    // ✅ NUEVA FUNCIONALIDAD: Iniciar programador de notificaciones
    if (process.env.NODE_ENV !== 'test') {
      startNotificationScheduler();
    }

    // Iniciar el servidor
    const server = app.listen(PORT, () => {
      console.log(`🚀 Servidor ejecutándose en el puerto ${PORT}`);
      console.log(`📍 Entorno: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔔 Sistema de notificaciones: ${process.env.NODE_ENV !== 'test' ? 'ACTIVO' : 'DESACTIVADO (testing)'}`);
    });

    // Manejo de cierre graceful del servidor
    process.on('SIGTERM', () => {
      console.log('🔄 Cerrando servidor...');
      server.close(() => {
        console.log('✅ Servidor cerrado exitosamente');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('🔄 Cerrando servidor...');
      server.close(() => {
        console.log('✅ Servidor cerrado exitosamente');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('❌ Error al iniciar el servidor:', error);
    process.exit(1);
  }
};

// Iniciar el servidor
startServer();