import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDatabase, seedDefaults, COMMAND_TYPES } from '../database.js';
import { createCommandsRouter } from '../routes/commands.js';
import { createTimerCommandsRouter } from '../routes/timer-commands.js';

function createTestApp() {
    const db = createDatabase(':memory:');
    const app = express();
    app.use(express.json());

    let onTimersChangedCalled = false;

    app.use('/api/commands', createCommandsRouter(db));
    app.use('/api/timer-commands', createTimerCommandsRouter(db, {
        onTimersChanged: () => { onTimersChangedCalled = true; }
    }));

    return { app, db, getTimersChanged: () => onTimersChangedCalled };
}

// ═══════════════════════════════════════════════════════════════════════════
// Тесты для /api/commands
// ═══════════════════════════════════════════════════════════════════════════

describe('/api/commands', () => {
    let app, db;

    beforeEach(() => {
        ({ app, db } = createTestApp());
    });

    afterEach(() => {
        db.close();
    });

    describe('GET /api/commands/types', () => {
        it('возвращает список допустимых типов', async () => {
            const res = await request(app).get('/api/commands/types');
            expect(res.status).toBe(200);
            expect(res.body).toEqual(COMMAND_TYPES);
            expect(res.body).toContain('simple');
            expect(res.body).toContain('random_reply');
        });
    });

    describe('GET /api/commands', () => {
        it('возвращает пустой массив, если команд нет', async () => {
            const res = await request(app).get('/api/commands');
            expect(res.status).toBe(200);
            expect(res.body).toEqual([]);
        });

        it('возвращает список команд после seed', async () => {
            seedDefaults(db);
            const res = await request(app).get('/api/commands');
            expect(res.status).toBe(200);
            expect(res.body.length).toBeGreaterThanOrEqual(11);
            expect(res.body[0]).toHaveProperty('trigger');
            expect(res.body[0]).toHaveProperty('response');
            expect(res.body[0]).toHaveProperty('type');
            expect(res.body[0]).toHaveProperty('variants');
        });

        it('seed содержит все типы команд', async () => {
            seedDefaults(db);
            const res = await request(app).get('/api/commands');
            const types = [...new Set(res.body.map(c => c.type))];
            expect(types).toContain('simple');
            expect(types).toContain('random_reply');
            expect(types).toContain('random_target');
            expect(types).toContain('random_target_action');
            expect(types).toContain('random_percent_target');
            expect(types).toContain('random_range');
        });
    });

    describe('POST /api/commands', () => {
        it('создаёт простую команду (type по умолчанию = simple)', async () => {
            const res = await request(app)
                .post('/api/commands')
                .send({ trigger: '!тест', response: 'Тестовый ответ' });

            expect(res.status).toBe(201);
            expect(res.body.trigger).toBe('!тест');
            expect(res.body.response).toBe('Тестовый ответ');
            expect(res.body.type).toBe('simple');
            expect(res.body.variants).toBeNull();
            expect(res.body).toHaveProperty('id');
        });

        it('создаёт random_reply команду с variants', async () => {
            const variants = ['Вариант 1', 'Вариант 2', 'Вариант 3'];
            const res = await request(app)
                .post('/api/commands')
                .send({
                    trigger: '!рандом',
                    type: 'random_reply',
                    response: '@{user}, ты - {variant}!',
                    variants
                });

            expect(res.status).toBe(201);
            expect(res.body.type).toBe('random_reply');
            expect(res.body.variants).toEqual(variants);
        });

        it('создаёт random_range команду с объектами в variants', async () => {
            const variants = [
                { min: 1, max: 10, text: '{size}см маленький' },
                { min: 11, max: 20, text: '{size}см большой' }
            ];
            const res = await request(app)
                .post('/api/commands')
                .send({
                    trigger: '!размер',
                    type: 'random_range',
                    response: '@{user}, {variant}',
                    variants
                });

            expect(res.status).toBe(201);
            expect(res.body.type).toBe('random_range');
            expect(res.body.variants).toEqual(variants);
        });

        it('возвращает 400 без trigger', async () => {
            const res = await request(app)
                .post('/api/commands')
                .send({ response: 'Ответ' });
            expect(res.status).toBe(400);
        });

        it('возвращает 400 без response', async () => {
            const res = await request(app)
                .post('/api/commands')
                .send({ trigger: '!тест' });
            expect(res.status).toBe(400);
        });

        it('возвращает 400 при недопустимом type', async () => {
            const res = await request(app)
                .post('/api/commands')
                .send({ trigger: '!тест', response: 'Ответ', type: 'invalid_type' });
            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Недопустимый тип');
        });

        it('возвращает 409 при дублировании триггера', async () => {
            await request(app)
                .post('/api/commands')
                .send({ trigger: '!тест', response: 'Ответ 1' });

            const res = await request(app)
                .post('/api/commands')
                .send({ trigger: '!тест', response: 'Ответ 2' });
            expect(res.status).toBe(409);
        });
    });

    describe('GET /api/commands/:id', () => {
        it('возвращает команду по ID с десериализованными variants', async () => {
            const variants = ['a', 'b', 'c'];
            const created = await request(app)
                .post('/api/commands')
                .send({ trigger: '!инфо', type: 'random_reply', response: '{variant}', variants });

            const res = await request(app).get(`/api/commands/${created.body.id}`);
            expect(res.status).toBe(200);
            expect(res.body.trigger).toBe('!инфо');
            expect(res.body.variants).toEqual(variants);
        });

        it('возвращает 404 для несуществующего ID', async () => {
            const res = await request(app).get('/api/commands/9999');
            expect(res.status).toBe(404);
        });
    });

    describe('PUT /api/commands/:id', () => {
        it('обновляет trigger и response', async () => {
            const created = await request(app)
                .post('/api/commands')
                .send({ trigger: '!старый', response: 'Старый ответ' });

            const res = await request(app)
                .put(`/api/commands/${created.body.id}`)
                .send({ trigger: '!новый', response: 'Новый ответ' });

            expect(res.status).toBe(200);
            expect(res.body.trigger).toBe('!новый');
            expect(res.body.response).toBe('Новый ответ');
        });

        it('обновляет type и variants', async () => {
            const created = await request(app)
                .post('/api/commands')
                .send({ trigger: '!тест', response: '@{user}, {variant}' });

            const res = await request(app)
                .put(`/api/commands/${created.body.id}`)
                .send({ type: 'random_reply', variants: ['X', 'Y'] });

            expect(res.status).toBe(200);
            expect(res.body.type).toBe('random_reply');
            expect(res.body.variants).toEqual(['X', 'Y']);
        });

        it('обновляет только variants', async () => {
            const created = await request(app)
                .post('/api/commands')
                .send({
                    trigger: '!тест',
                    type: 'random_reply',
                    response: '{variant}',
                    variants: ['old']
                });

            const res = await request(app)
                .put(`/api/commands/${created.body.id}`)
                .send({ variants: ['new1', 'new2'] });

            expect(res.status).toBe(200);
            expect(res.body.variants).toEqual(['new1', 'new2']);
            expect(res.body.trigger).toBe('!тест');
        });

        it('возвращает 404 для несуществующего ID', async () => {
            const res = await request(app)
                .put('/api/commands/9999')
                .send({ response: 'Новый ответ' });
            expect(res.status).toBe(404);
        });

        it('возвращает 400 без данных', async () => {
            const created = await request(app)
                .post('/api/commands')
                .send({ trigger: '!тест', response: 'Ответ' });

            const res = await request(app)
                .put(`/api/commands/${created.body.id}`)
                .send({});
            expect(res.status).toBe(400);
        });

        it('возвращает 400 при недопустимом type', async () => {
            const created = await request(app)
                .post('/api/commands')
                .send({ trigger: '!тест', response: 'Ответ' });

            const res = await request(app)
                .put(`/api/commands/${created.body.id}`)
                .send({ type: 'wrong_type' });
            expect(res.status).toBe(400);
        });

        it('возвращает 409 при конфликте триггера', async () => {
            await request(app)
                .post('/api/commands')
                .send({ trigger: '!первый', response: 'Ответ 1' });
            const second = await request(app)
                .post('/api/commands')
                .send({ trigger: '!второй', response: 'Ответ 2' });

            const res = await request(app)
                .put(`/api/commands/${second.body.id}`)
                .send({ trigger: '!первый' });
            expect(res.status).toBe(409);
        });
    });

    describe('DELETE /api/commands/:id', () => {
        it('удаляет команду', async () => {
            const created = await request(app)
                .post('/api/commands')
                .send({ trigger: '!удалить', response: 'Ответ' });

            const res = await request(app).delete(`/api/commands/${created.body.id}`);
            expect(res.status).toBe(204);

            const check = await request(app).get(`/api/commands/${created.body.id}`);
            expect(check.status).toBe(404);
        });

        it('возвращает 404 для несуществующего ID', async () => {
            const res = await request(app).delete('/api/commands/9999');
            expect(res.status).toBe(404);
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// Тесты для /api/timer-commands
// ═══════════════════════════════════════════════════════════════════════════

describe('/api/timer-commands', () => {
    let app, db, getTimersChanged;

    beforeEach(() => {
        ({ app, db, getTimersChanged } = createTestApp());
    });

    afterEach(() => {
        db.close();
    });

    describe('GET /api/timer-commands', () => {
        it('возвращает пустой массив, если таймеров нет', async () => {
            const res = await request(app).get('/api/timer-commands');
            expect(res.status).toBe(200);
            expect(res.body).toEqual([]);
        });

        it('возвращает список таймеров после seed', async () => {
            seedDefaults(db);
            const res = await request(app).get('/api/timer-commands');
            expect(res.status).toBe(200);
            expect(res.body.length).toBeGreaterThanOrEqual(2);
            expect(res.body[0]).toHaveProperty('name');
            expect(res.body[0]).toHaveProperty('message');
            expect(res.body[0]).toHaveProperty('interval_minutes');
        });
    });

    describe('POST /api/timer-commands', () => {
        it('создаёт таймерную команду', async () => {
            const res = await request(app)
                .post('/api/timer-commands')
                .send({ name: 'promo', message: 'Подпишись!', interval_minutes: 30 });

            expect(res.status).toBe(201);
            expect(res.body.name).toBe('promo');
            expect(res.body.message).toBe('Подпишись!');
            expect(res.body.interval_minutes).toBe(30);
            expect(res.body.enabled).toBe(1);
        });

        it('применяет значения по умолчанию', async () => {
            const res = await request(app)
                .post('/api/timer-commands')
                .send({ name: 'default_test', message: 'Тест' });

            expect(res.status).toBe(201);
            expect(res.body.interval_minutes).toBe(25);
            expect(res.body.enabled).toBe(1);
        });

        it('возвращает 400 без name', async () => {
            const res = await request(app)
                .post('/api/timer-commands')
                .send({ message: 'Сообщение' });
            expect(res.status).toBe(400);
        });

        it('возвращает 400 без message', async () => {
            const res = await request(app)
                .post('/api/timer-commands')
                .send({ name: 'test' });
            expect(res.status).toBe(400);
        });

        it('возвращает 400 при interval_minutes < 1', async () => {
            const res = await request(app)
                .post('/api/timer-commands')
                .send({ name: 'test', message: 'Msg', interval_minutes: 0 });
            expect(res.status).toBe(400);
        });

        it('возвращает 409 при дублировании name', async () => {
            await request(app)
                .post('/api/timer-commands')
                .send({ name: 'promo', message: 'Msg 1' });

            const res = await request(app)
                .post('/api/timer-commands')
                .send({ name: 'promo', message: 'Msg 2' });
            expect(res.status).toBe(409);
        });

        it('вызывает onTimersChanged', async () => {
            await request(app)
                .post('/api/timer-commands')
                .send({ name: 'test', message: 'Msg' });
            expect(getTimersChanged()).toBe(true);
        });
    });

    describe('GET /api/timer-commands/:id', () => {
        it('возвращает таймер по ID', async () => {
            const created = await request(app)
                .post('/api/timer-commands')
                .send({ name: 'promo', message: 'Msg', interval_minutes: 15 });

            const res = await request(app).get(`/api/timer-commands/${created.body.id}`);
            expect(res.status).toBe(200);
            expect(res.body.name).toBe('promo');
        });

        it('возвращает 404 для несуществующего ID', async () => {
            const res = await request(app).get('/api/timer-commands/9999');
            expect(res.status).toBe(404);
        });
    });

    describe('PUT /api/timer-commands/:id', () => {
        it('обновляет все поля', async () => {
            const created = await request(app)
                .post('/api/timer-commands')
                .send({ name: 'old', message: 'Old msg', interval_minutes: 10 });

            const res = await request(app)
                .put(`/api/timer-commands/${created.body.id}`)
                .send({ name: 'new', message: 'New msg', interval_minutes: 45, enabled: false });

            expect(res.status).toBe(200);
            expect(res.body.name).toBe('new');
            expect(res.body.message).toBe('New msg');
            expect(res.body.interval_minutes).toBe(45);
            expect(res.body.enabled).toBe(0);
        });

        it('обновляет только enabled', async () => {
            const created = await request(app)
                .post('/api/timer-commands')
                .send({ name: 'test', message: 'Msg' });

            const res = await request(app)
                .put(`/api/timer-commands/${created.body.id}`)
                .send({ enabled: false });

            expect(res.status).toBe(200);
            expect(res.body.enabled).toBe(0);
            expect(res.body.name).toBe('test');
        });

        it('возвращает 404 для несуществующего ID', async () => {
            const res = await request(app)
                .put('/api/timer-commands/9999')
                .send({ message: 'Новое' });
            expect(res.status).toBe(404);
        });

        it('возвращает 400 без данных', async () => {
            const created = await request(app)
                .post('/api/timer-commands')
                .send({ name: 'test', message: 'Msg' });

            const res = await request(app)
                .put(`/api/timer-commands/${created.body.id}`)
                .send({});
            expect(res.status).toBe(400);
        });

        it('возвращает 400 при interval_minutes < 1', async () => {
            const created = await request(app)
                .post('/api/timer-commands')
                .send({ name: 'test', message: 'Msg' });

            const res = await request(app)
                .put(`/api/timer-commands/${created.body.id}`)
                .send({ interval_minutes: -5 });
            expect(res.status).toBe(400);
        });

        it('возвращает 409 при конфликте name', async () => {
            await request(app)
                .post('/api/timer-commands')
                .send({ name: 'first', message: 'Msg 1' });
            const second = await request(app)
                .post('/api/timer-commands')
                .send({ name: 'second', message: 'Msg 2' });

            const res = await request(app)
                .put(`/api/timer-commands/${second.body.id}`)
                .send({ name: 'first' });
            expect(res.status).toBe(409);
        });
    });

    describe('DELETE /api/timer-commands/:id', () => {
        it('удаляет таймерную команду', async () => {
            const created = await request(app)
                .post('/api/timer-commands')
                .send({ name: 'remove_me', message: 'Msg' });

            const res = await request(app).delete(`/api/timer-commands/${created.body.id}`);
            expect(res.status).toBe(204);

            const check = await request(app).get(`/api/timer-commands/${created.body.id}`);
            expect(check.status).toBe(404);
        });

        it('возвращает 404 для несуществующего ID', async () => {
            const res = await request(app).delete('/api/timer-commands/9999');
            expect(res.status).toBe(404);
        });
    });
});
