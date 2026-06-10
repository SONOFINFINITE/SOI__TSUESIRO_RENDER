import { Router } from 'express';
import {
    getAllCommands, getCommandById, createCommand, updateCommand, deleteCommand,
    COMMAND_TYPES
} from '../database.js';

export function createCommandsRouter(db) {
    const router = Router();

    // GET /api/commands/types — список допустимых типов
    router.get('/types', (req, res) => {
        res.json(COMMAND_TYPES);
    });

    // GET /api/commands — список всех команд
    router.get('/', (req, res) => {
        const commands = getAllCommands(db);
        res.json(commands);
    });

    // GET /api/commands/:id — одна команда по ID
    router.get('/:id', (req, res) => {
        const command = getCommandById(db, Number(req.params.id));
        if (!command) return res.status(404).json({ error: 'Команда не найдена' });
        res.json(command);
    });

    // POST /api/commands — создать команду
    router.post('/', (req, res) => {
        const { trigger, type, response, variants } = req.body;

        if (!trigger || !response) {
            return res.status(400).json({ error: 'Поля trigger и response обязательны' });
        }

        if (type && !COMMAND_TYPES.includes(type)) {
            return res.status(400).json({
                error: `Недопустимый тип "${type}". Допустимые: ${COMMAND_TYPES.join(', ')}`
            });
        }

        try {
            const command = createCommand(db, { trigger, type, response, variants });
            res.status(201).json(command);
        } catch (err) {
            if (err.message.includes('UNIQUE')) {
                return res.status(409).json({ error: `Команда с триггером "${trigger}" уже существует` });
            }
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/commands/:id — обновить команду
    router.put('/:id', (req, res) => {
        const { trigger, type, response, variants } = req.body;

        if (!trigger && !type && !response && variants === undefined) {
            return res.status(400).json({ error: 'Нужно указать хотя бы одно поле для обновления' });
        }

        if (type && !COMMAND_TYPES.includes(type)) {
            return res.status(400).json({
                error: `Недопустимый тип "${type}". Допустимые: ${COMMAND_TYPES.join(', ')}`
            });
        }

        try {
            const command = updateCommand(db, Number(req.params.id), { trigger, type, response, variants });
            if (!command) return res.status(404).json({ error: 'Команда не найдена' });
            res.json(command);
        } catch (err) {
            if (err.message.includes('UNIQUE')) {
                return res.status(409).json({ error: `Команда с триггером "${trigger}" уже существует` });
            }
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE /api/commands/:id — удалить команду
    router.delete('/:id', (req, res) => {
        const deleted = deleteCommand(db, Number(req.params.id));
        if (!deleted) return res.status(404).json({ error: 'Команда не найдена' });
        res.status(204).send();
    });

    return router;
}
