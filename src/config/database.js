// File: backend/src/config/database.js
const mysql = require('mysql2/promise');
require('dotenv').config();

// Configuración de la conexión a MySQL
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'diego1234',
  database: process.env.DB_NAME || 'sgp_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

// Crear el pool de conexiones
const pool = mysql.createPool(dbConfig);

// Función para conectar a la base de datos
const connectDB = async () => {
  try {
    // Probar la conexión
    const connection = await pool.getConnection();
    console.log('✅ Conexión a MySQL establecida exitosamente');
    
    // Verificar que la base de datos existe
    const [rows] = await connection.execute('SELECT DATABASE() as database_name');
    console.log(`📊 Base de datos activa: ${rows[0].database_name}`);
    
    // Liberar la conexión
    connection.release();
    
    return pool;
  } catch (error) {
    console.error('❌ Error al conectar con MySQL:', error.message);
    
    // Intentar conectar sin especificar la base de datos para crearla
    if (error.code === 'ER_BAD_DB_ERROR') {
      console.log('🔄 Intentando crear la base de datos...');
      await createDatabase();
    } else {
      throw error;
    }
  }
};

// Función para crear la base de datos si no existe
const createDatabase = async () => {
  try {
    const tempConfig = { ...dbConfig };
    delete tempConfig.database;
    
    const tempConnection = await mysql.createConnection(tempConfig);
    await tempConnection.execute(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME}`);
    await tempConnection.end();
    
    console.log(`✅ Base de datos '${process.env.DB_NAME}' creada exitosamente`);
    
    // Reconectar con la base de datos creada
    return await connectDB();
  } catch (error) {
    console.error('❌ Error al crear la base de datos:', error.message);
    throw error;
  }
};

// Función para ejecutar consultas
const executeQuery = async (query, params = []) => {
  try {
    const [results] = await pool.execute(query, params);
    return results;
  } catch (error) {
    console.error('❌ Error en la consulta:', error.message);
    throw error;
  }
};

// Función para ejecutar transacciones
const executeTransaction = async (queries) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const results = [];
    for (const { query, params } of queries) {
      const [result] = await connection.execute(query, params);
      results.push(result);
    }
    
    await connection.commit();
    return results;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// Función para cerrar la conexión
const closeConnection = async () => {
  try {
    await pool.end();
    console.log('✅ Conexión a MySQL cerrada exitosamente');
  } catch (error) {
    console.error('❌ Error al cerrar la conexión:', error.message);
  }
};

module.exports = {
  pool,
  connectDB,
  executeQuery,
  executeTransaction,
  closeConnection
};