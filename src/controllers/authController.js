// File: backend/src/controllers/authController.js
const { findUserByEmail, updateLastLogin } = require('../models/userModel');
const { comparePassword } = require('../utils/passwordHash');
const { generateToken } = require('../utils/jwtUtils');
const {
    createUser,
    updateUserVerificationCode,
    updateUserStatus,
    findUserByVerificationCode,
    checkEmailExists,
    updateUserPassword,
    saveTemporaryVerificationCode,
    verifyTemporaryCode,
    clearTemporaryVerificationCode
} = require('../models/userModel');
const { hashPassword } = require('../utils/passwordHash');
const emailService = require('../services/emailService');
//Implementación de Notificaciones
const { notifyUserWelcome } = require('../services/notificationService');
const { AppError } = require('../utils/errorHandler');

const loginUser = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        // Buscar usuario por email
        const user = await findUserByEmail(email);
        if (!user) {
            return next(new AppError('Credenciales inválidas', 401));
        }

        // Verificar si el usuario está activo
        if (!user.activo) {
            return next(new AppError('Cuenta no verificada. Verifica tu email.', 401));
        }

        // Verificar password
        const isValidPassword = await comparePassword(password, user.password_hash);
        if (!isValidPassword) {
            return next(new AppError('Credenciales inválidas', 401));
        }

        // Actualizar última sesión
        await updateLastLogin(user.id);

        // Generar token JWT
        const token = generateToken({
            id: user.id,
            nombre: user.nombre,
            apellido: user.apellido,
            email: user.email,
            rol: user.nombre_rol
        });

        // Respuesta exitosa (sin enviar password_hash)
        const { password_hash, ...userWithoutPassword } = user;

        res.status(200).json({
            success: true,
            message: 'Inicio de sesión exitoso',
            data: {
                user: userWithoutPassword,
                token
            }
        });

    } catch (error) {
        next(error);
    }
};

// Funciones de registro y verificación de email

const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const registerUser = async (req, res, next) => {
    try {
        const { nombre, apellido, email, password, telefono, id_rol, codigo } = req.body;

        // Verificar código de verificación temporal
        const isValidCode = await verifyTemporaryCode(email, codigo);
        if (!isValidCode) {
            return next(new AppError('Código de verificación inválido o expirado', 400));
        }

        // Verificar si el email ya existe (por seguridad)
        const emailExists = await checkEmailExists(email);
        if (emailExists) {
            return next(new AppError('El email ya está registrado', 409));
        }

        // Hash de la contraseña
        const password_hash = await hashPassword(password);

        // Crear usuario ACTIVO (ya verificado)
        const result = await createUser({
            nombre,
            apellido,
            email,
            password_hash,
            telefono,
            id_rol: id_rol || 3
        });

        const userId = result.insertId;

        // Activar usuario inmediatamente
        await updateUserStatus(userId, true);

        // Limpiar código temporal
        await clearTemporaryVerificationCode(email);

        // ✅ NUEVA FUNCIONALIDAD: Enviar notificación de bienvenida
        try {
            await notifyUserWelcome({
                id: userId,
                nombre,
                apellido,
                email
            });
        } catch (notificationError) {
            console.error('Error al enviar notificación de bienvenida:', notificationError);
            // No fallar el registro por un error de notificación
        }

        res.status(201).json({
            success: true,
            message: 'Usuario registrado exitosamente',
            data: {
                userId,
                email,
                nombre
            }
        });

    } catch (error) {
        next(error);
    }
};

const verifyEmail = async (req, res, next) => {
    try {
        const { email, codigo } = req.body;

        // Buscar usuario por email y código
        const user = await findUserByVerificationCode(email, codigo);

        if (!user) {
            return next(new AppError('Código de verificación inválido o expirado', 400));
        }

        if (user.activo) {
            return next(new AppError('La cuenta ya está verificada', 400));
        }

        // Activar usuario
        await updateUserStatus(user.id, true);

        res.status(200).json({
            success: true,
            message: 'Cuenta verificada exitosamente. Ya puedes iniciar sesión.',
            data: {
                email: user.email,
                nombre: user.nombre
            }
        });

    } catch (error) {
        next(error);
    }
};

const sendVerificationCode = async (req, res, next) => {
    try {
        const { email, nombre } = req.body;
        
        // Verificar si el email ya existe
        const emailExists = await checkEmailExists(email);
        if (emailExists) {
            return next(new AppError('El email ya está registrado', 409));
        }
        
        // Generar código de verificación
        const codigo = generateVerificationCode();
        const fechaExpiracion = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos
        
        // Guardar código temporalmente (necesitarás una tabla temporal o usar caché)
        // Por ahora, usaremos una tabla temporal o Redis
        await saveTemporaryVerificationCode(email, codigo, fechaExpiracion);
        
        // Enviar email de verificación
        await emailService.sendVerificationEmail(email, nombre, codigo);
        
        res.status(200).json({
            success: true,
            message: 'Código de verificación enviado exitosamente',
            data: { email }
        });
        
    } catch (error) {
        next(error);
    }
};

const resendVerificationCode = async (req, res, next) => {
    try {
        const { email } = req.body;

        // Buscar usuario por email
        const user = await findUserByEmail(email);
        if (!user) {
            return next(new AppError('Usuario no encontrado', 404));
        }

        if (user.activo) {
            return next(new AppError('La cuenta ya está verificada', 400));
        }

        // Generar nuevo código
        const codigo = generateVerificationCode();
        const fechaExpiracion = new Date(Date.now() + 15 * 60 * 1000);

        // Actualizar código en la base de datos
        await updateUserVerificationCode(user.id, codigo, fechaExpiracion);

        // Enviar email
        await emailService.sendVerificationEmail(email, user.nombre, codigo);

        res.status(200).json({
            success: true,
            message: 'Código de verificación reenviado exitosamente',
            data: {
                email
            }
        });

    } catch (error) {
        next(error);
    }
};

// Funciones de recuperación de contraseña

const forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;

        // Buscar usuario por email
        const user = await findUserByEmail(email);
        if (!user) {
            // Por seguridad, no revelar si el email existe
            return res.status(200).json({
                success: true,
                message: 'Si el email está registrado, recibirás un código de recuperación.',
                data: { email }
            });
        }

        if (!user.activo) {
            return next(new AppError('Cuenta no verificada. Verifica tu email primero.', 400));
        }

        // Generar código de recuperación
        const codigo = generateVerificationCode();
        const fechaExpiracion = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

        // Guardar código en la base de datos
        await updateUserVerificationCode(user.id, codigo, fechaExpiracion);

        // Enviar email de recuperación
        await emailService.sendPasswordResetEmail(email, user.nombre, codigo);

        res.status(200).json({
            success: true,
            message: 'Si el email está registrado, recibirás un código de recuperación.',
            data: { email }
        });

    } catch (error) {
        next(error);
    }
};

const verifyResetCode = async (req, res, next) => {
    try {
        const { email, codigo } = req.body;

        // Buscar usuario por email y código
        const user = await findUserByVerificationCode(email, codigo);

        if (!user) {
            return next(new AppError('Código de recuperación inválido o expirado', 400));
        }

        if (!user.activo) {
            return next(new AppError('Cuenta no verificada', 400));
        }

        res.status(200).json({
            success: true,
            message: 'Código verificado correctamente',
            data: {
                email: user.email,
                codigo_valido: true
            }
        });

    } catch (error) {
        next(error);
    }
};


const resetPassword = async (req, res, next) => {
    try {
        const { email, codigo, newPassword } = req.body;

        // Buscar usuario por email y código
        const user = await findUserByVerificationCode(email, codigo);

        if (!user) {
            return next(new AppError('Código de recuperación inválido o expirado', 400));
        }

        if (!user.activo) {
            return next(new AppError('Cuenta no verificada', 400));
        }

        // Hash de la nueva contraseña
        const password_hash = await hashPassword(newPassword);

        // Actualizar contraseña y limpiar código
        await updateUserPassword(user.id, password_hash);

        res.status(200).json({
            success: true,
            message: 'Contraseña actualizada exitosamente',
            data: {
                email: user.email,
                nombre: user.nombre
            }
        });

    } catch (error) {
        next(error);
    }
};


module.exports = {
    loginUser,
    registerUser,
    verifyEmail,
    sendVerificationCode,
    resendVerificationCode,
    forgotPassword,
    verifyResetCode,
    resetPassword,
};