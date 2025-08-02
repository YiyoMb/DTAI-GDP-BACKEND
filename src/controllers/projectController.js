// File: backend/src/controllers/projectController.js
const {
    getAllProjectsWithPagination,
    getProjectById,
    createProject,
    updateProject,
    deleteProject,
    checkProgramOwnership
} = require('../models/projectModel');
const {
    assignUserToProject,
    removeUserFromProject,
    getProjectUsers,
    isUserAssignedToProject
} = require('../models/projectUserRoleModel');

//Implementación de Notificaciones
const { notifyUserAssignedToProject, notifyProjectCreated } = require('../services/notificationService');
const { AppError } = require('../utils/errorHandler');

const getAllProjects = async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            programa = null,
            administrador = null,
            estatus = null,
            nivel_riesgo = null,
            sortBy = 'fecha_creacion',
            sortOrder = 'DESC'
        } = req.query;

        const filters = {
            search: search.trim(),
            programa: programa ? parseInt(programa) : null,
            administrador: administrador ? parseInt(administrador) : null,
            estatus: estatus || null,
            nivel_riesgo: nivel_riesgo || null
        };

        const result = await getAllProjectsWithPagination(
            parseInt(page),
            parseInt(limit),
            filters,
            sortBy,
            sortOrder,
            req.user.id,
            req.user.rol
        );

        // Agrega los usuarios asignados a cada proyecto
        const projectsWithUsers = await Promise.all(
            result.projects.map(async (project) => {
                const usuarios = await getProjectUsers(project.id);
                return {
                    ...project,
                    usuarios
                };
            })
        );

        res.status(200).json({
            success: true,
            message: 'Proyectos obtenidos exitosamente',
            data: result.projects, // Ya incluye los miembros desde el modelo
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

const getProjectByIdController = async (req, res, next) => {
    try {
        const { id } = req.params;

        const project = await getProjectById(id, req.user.id, req.user.rol);
        if (!project) {
            return next(new AppError('Proyecto no encontrado', 404));
        }

        const miembros = await getProjectUsers(id);
        const projectWithMembers = {
            ...project,
            miembros
        };

        res.status(200).json({
            success: true,
            message: 'Proyecto obtenido exitosamente',
            data: projectWithMembers
        });



    } catch (error) {
        next(error);
    }
};

const createProjectController = async (req, res, next) => {
    try {
        const { nombre, descripcion, estatus, nivel_riesgo, id_programa } = req.body;

        // Verificar que el programa pertenece al usuario (si se especifica)
        if (id_programa) {
            const programExists = await checkProgramOwnership(id_programa, req.user.id, req.user.rol);
            if (!programExists) {
                return next(new AppError('Programa no encontrado o no tienes permisos para crear proyectos en él', 403));
            }
        }

        // Para Administradores, asignar su propio ID
        const id_administrador = req.user.rol === 'Administrador' ? req.user.id : req.body.id_administrador;

        const result = await createProject({
            nombre,
            descripcion,
            estatus,
            nivel_riesgo,
            id_programa,
            id_administrador
        });

        const newProject = await getProjectById(result.insertId, req.user.id, req.user.rol);

        // ✅ NUEVA FUNCIONALIDAD: Notificar proyecto creado
        try {
            // Si hay un programa asociado, notificar a usuarios que ya están en otros proyectos del programa
            if (id_programa) {
                // Esta lógica se puede expandir para obtener usuarios del programa
                console.log(`Proyecto ${newProject.nombre} creado en programa ${id_programa}`);
            }
        } catch (notificationError) {
            console.error('Error al enviar notificación de proyecto creado:', notificationError);
        }

        res.status(201).json({
            success: true,
            message: 'Proyecto creado exitosamente',
            data: newProject
        });
    } catch (error) {
        next(error);
    }
};

const updateProjectController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updateData = req.body;
        delete updateData.miembros;

        // Verificar si el proyecto existe
        const existingProject = await getProjectById(id, req.user.id, req.user.rol);
        if (!existingProject) {
            return next(new AppError('Proyecto no encontrado', 404));
        }

        // Los administradores no pueden cambiar el administrador del proyecto
        if (req.user.rol === 'Administrador') {
            delete updateData.id_administrador;
        }

        // Si se está cambiando el programa, verificar permisos
        if (updateData.id_programa) {
            const programExists = await checkProgramOwnership(updateData.id_programa, req.user.id, req.user.rol);
            if (!programExists) {
                return next(new AppError('Programa no encontrado o no tienes permisos para mover el proyecto a él', 403));
            }
        }

        const result = await updateProject(id, updateData, req.user.id, req.user.rol);

        if (result.affectedRows === 0) {
            return next(new AppError('No se pudo actualizar el proyecto', 400));
        }

        const updatedProject = await getProjectById(id, req.user.id, req.user.rol);

        res.status(200).json({
            success: true,
            message: 'Proyecto actualizado exitosamente',
            data: updatedProject
        });
    } catch (error) {
        next(error);
    }
};

const deleteProjectController = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Verificar si el proyecto existe
        const existingProject = await getProjectById(id, req.user.id, req.user.rol);
        if (!existingProject) {
            return next(new AppError('Proyecto no encontrado', 404));
        }

        const result = await deleteProject(id, req.user.id, req.user.rol);

        if (result.affectedRows === 0) {
            return next(new AppError('No se pudo eliminar el proyecto', 400));
        }

        res.status(200).json({
            success: true,
            message: 'Proyecto eliminado exitosamente'
        });
    } catch (error) {
        next(error);
    }
};


// Funciones para manejar asignación y remoción de usuarios en proyectos

// Asignar usuario a proyecto
const assignUserToProjectController = async (req, res, next) => {
    try {
        const { projectId } = req.params;
        const { userId, roleId } = req.body;

        // Verificar que el proyecto existe y pertenece al usuario
        const project = await getProjectById(projectId, req.user.id, req.user.rol);
        if (!project) {
            return next(new AppError('Proyecto no encontrado', 404));
        }

        // Verificar que el usuario no esté ya asignado
        const isAssigned = await isUserAssignedToProject(projectId, userId);
        if (isAssigned) {
            return next(new AppError('El usuario ya está asignado a este proyecto', 400));
        }

        await assignUserToProject(projectId, userId, roleId);

        // ✅ NUEVA FUNCIONALIDAD: Notificar asignación a proyecto
        try {
            await notifyUserAssignedToProject(
                {
                    id: project.id,
                    nombre: project.nombre
                },
                userId,
                req.user.id
            );
        } catch (notificationError) {
            console.error('Error al enviar notificación de asignación a proyecto:', notificationError);
        }

        res.status(201).json({
            success: true,
            message: 'Usuario asignado al proyecto exitosamente'
        });
    } catch (error) {
        next(error);
    }
};

// Remover usuario de proyecto
const removeUserFromProjectController = async (req, res, next) => {
    try {
        const { projectId, userId } = req.params;

        // Verificar que el proyecto existe y pertenece al usuario
        const project = await getProjectById(projectId, req.user.id, req.user.rol);
        if (!project) {
            return next(new AppError('Proyecto no encontrado', 404));
        }

        const result = await removeUserFromProject(projectId, userId);

        if (result.affectedRows === 0) {
            return next(new AppError('Usuario no encontrado en este proyecto', 404));
        }

        res.status(200).json({
            success: true,
            message: 'Usuario removido del proyecto exitosamente'
        });
    } catch (error) {
        next(error);
    }
};

// Obtener usuarios de un proyecto
const getProjectUsersController = async (req, res, next) => {
    try {
        const { projectId } = req.params;

        // Verificar que el proyecto existe y pertenece al usuario
        const project = await getProjectById(projectId, req.user.id, req.user.rol);
        if (!project) {
            return next(new AppError('Proyecto no encontrado', 404));
        }

        const users = await getProjectUsers(projectId);

        res.status(200).json({
            success: true,
            message: 'Usuarios del proyecto obtenidos exitosamente',
            data: users
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAllProjects,
    getProjectByIdController,
    createProjectController,
    updateProjectController,
    deleteProjectController,
    assignUserToProjectController,
    removeUserFromProjectController,
    getProjectUsersController
};