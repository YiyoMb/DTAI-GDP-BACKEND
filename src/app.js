// File: backend/src/app.js
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const app = express();

// Importar configuraciones
const config = require('./config/config');
const { errorHandler } = require('./utils/errorHandler');

// Configuración de CORS
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true,
  optionsSuccessStatus: 200
};

// Middlewares globales
app.use(helmet()); // Seguridad
app.use(compression()); // Compresión
app.use(cors()); // CORS
app.use(morgan('combined')); // Logging
app.use(express.json({ limit: '10mb' })); // Parsing JSON
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Parsing URL-encoded

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({
    message: 'Backend API funcionando correctamente',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Ruta de health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Rutas de la API
const apiRoutes = express.Router();

// Aquí cargarás rutas cuando estén listas
apiRoutes.use('/auth', require('./routes/authRoutes'));
apiRoutes.use('/users', require('./routes/userRoutes'));
apiRoutes.use('/portfolios', require('./routes/portfolioRoutes'));
apiRoutes.use('/programs', require('./routes/programRoutes'));
apiRoutes.use('/projects', require('./routes/projectRoutes'));
apiRoutes.use('/tasks', require('./routes/taskRoutes'));
apiRoutes.use('/dashboard', require('./routes/dashboardRoutes'));
apiRoutes.use('/notifications', require('./routes/notificationRoutes'));
apiRoutes.use('/meetings', require('./routes/meetingRoutes'));
// apiRoutes.use('/documents', require('./routes/documentRoutes'));
// apiRoutes.use('/reports', require('./routes/reportRoutes'));
// apiRoutes.use('/notifications', require('./routes/notificationRoutes'));
// apiRoutes.use('/meetings', require('./routes/meetingRoutes'));

// Montar las rutas en /api/v1
app.use('/api/v1', apiRoutes);

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada',
    path: req.originalUrl
  });
});

// Middleware de manejo de errores (debe ir al final)
app.use(errorHandler);

module.exports = app;