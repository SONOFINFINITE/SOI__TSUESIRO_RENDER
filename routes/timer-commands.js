import { Router } from 'express';
import {
    getAllTimerCommands, getTimerCommandById,
    createTimerCommand, updateTimerCommand, deleteTimerCommand
} from '../database.js';

export function createTimerCommandsRouter(db, { onTimersChanged }) {
    const router = Router();

    // GET /api/timer-commands — список всех таймерных команд
    router.get('/', (req, res) => {
        const commands = getAllTimerCommands(db);
        res.json(commands);
    });

    // GET /api/timer-commands/:id — одна таймерная команда
    router.get('/:id', (req, res) => {
        const command = getTimerCommandById(db, Number(req.params.id));
        if (!command) return res.status(404).json({ error: 'Таймерная команда не найдена' });
        res.json(command);
    });

    // POST /api/timer-commands — создать таймерную команду
    router.post('/', (req, res) => {
        const { name, message, interval_minutes, enabled } = req.body;

        if (!name || !message) {
            return res.status(400).json({ error: 'Поля name и message обязательны' });
        }

        if (interval_minutes !== undefined && (typeof interval_minutes !== 'number' || interval_minutes < 1)) {
            return res.status(400).json({ error: 'interval_minutes должен быть числом >= 1' });
        }

        try {
            const command = createTimerCommand(db, { name, message, interval_minutes, enabled });
            onTimersChanged?.();
            res.status(201).json(command);
        } catch (err) {
            if (err.message.includes('UNIQUE')) {
                return res.status(409).json({ error: `Таймерная команда "${name}" уже существует` });
            }
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/timer-commands/:id — обновить таймерную команду
    router.put('/:id', (req, res) => {
        const { name, message, interval_minutes, enabled } = req.body;

        if (!name && !message && interval_minutes === undefined && enabled === undefined) {
            return res.status(400).json({ error: 'Нужно указать хотя бы одно поле для обновления' });
        }

        if (interval_minutes !== undefined && (typeof interval_minutes !== 'number' || interval_minutes < 1)) {
            return res.status(400).json({ error: 'interval_minutes должен быть числом >= 1' });
        }

        try {
            const command = updateTimerCommand(db, Number(req.params.id), { name, message, interval_minutes, enabled });
            if (!command) return res.status(404).json({ error: 'Таймерная команда не найдена' });
            onTimersChanged?.();
            res.json(command);
        } catch (err) {
            if (err.message.includes('UNIQUE')) {
                return res.status(409).json({ error: `Таймерная команда "${name}" уже существует` });
            }
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE /api/timer-commands/:id — удалить таймерную команду
    router.delete('/:id', (req, res) => {
        const deleted = deleteTimerCommand(db, Number(req.params.id));
        if (!deleted) return res.status(404).json({ error: 'Таймерная команда не найдена' });
        onTimersChanged?.();
        res.status(204).send();
    });

    return router;
}
