import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { verifyAdmin } from '../database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'twitch-bot-jwt-secret-key';
const JWT_EXPIRES_IN = '24h';

export function createAuthRouter(db) {
    const router = Router();

    // POST /api/auth/login — логин администратора
    router.post('/login', async (req, res) => {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Поля username и password обязательны' });
        }

        try {
            const admin = await verifyAdmin(db, username, password);
            if (!admin) {
                return res.status(401).json({ error: 'Неверный логин или пароль' });
            }

            const token = jwt.sign(
                { id: admin.id, username: admin.username },
                JWT_SECRET,
                { expiresIn: JWT_EXPIRES_IN }
            );

            res.json({
                token,
                admin: { id: admin.id, username: admin.username }
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/auth/me — проверка текущего токена
    router.get('/me', (req, res) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Токен не предоставлен' });
        }

        try {
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, JWT_SECRET);
            res.json({ id: decoded.id, username: decoded.username });
        } catch (err) {
            res.status(401).json({ error: 'Невалидный или истёкший токен' });
        }
    });

    return router;
}

// Middleware для защиты роутов
export function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Токен не предоставлен' });
    }

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Невалидный или истёкший токен' });
    }
}
