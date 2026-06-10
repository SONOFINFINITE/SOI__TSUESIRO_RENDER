import express from 'express';
import cron from 'node-cron';
import axios from 'axios';
import crypto from 'crypto';
import { TwitchBot } from './bot.js';
import { createDatabase, seedDefaults, getEnabledTimerCommands } from './database.js';
import { createCommandsRouter } from './routes/commands.js';
import { createTimerCommandsRouter } from './routes/timer-commands.js';
import { createAuthRouter } from './routes/auth.js';

// Загрузка переменных окружения
const config = {
    botUsername: process.env.TWITCH_BOT_USERNAME || 'tsuesiro_bot',
    botOauth: process.env.TWITCH_BOT_OAUTH || '',
    channel: process.env.TWITCH_CHANNEL || 'I_CbIC_I',
    clientId: process.env.TWITCH_CLIENT_ID || '',
    accessToken: process.env.TWITCH_ACCESS_TOKEN || '',
    broadcasterId: process.env.BROADCASTER_ID || '144394710',
    moderatorId: process.env.MODERATOR_ID || '1046743105',
    port: process.env.PORT || 3000,
    renderUrl: process.env.RNDR_URL || '',
    eventsubSecret: process.env.EVENTSUB_SECRET || 'my-eventsub-secret',
    clientSecret: process.env.TWITCH_CLIENT_SECRET || ''
};

// ─── Инициализация БД ───────────────────────────────────────────────────────

const db = createDatabase();
await seedDefaults(db);

// Создаём Express приложение
const app = express();

// JSON body parser для API роутов
app.use('/api', express.json());

// Простой endpoint для проверки работы
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        bot: 'Twitch Bot',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Health check endpoint для Render.com
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// Endpoint для получения статистики
app.get('/stats', (req, res) => {
    const streamOnline = timerIntervals.length > 0;
    res.json({
        status: 'running',
        channel: config.channel,
        botUsername: config.botUsername,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        stream: streamOnline ? 'online' : 'offline',
        activeTimers: timerIntervals.length
    });
});

// ─── REST API роуты ─────────────────────────────────────────────────────────

app.use('/api/commands', createCommandsRouter(db));
app.use('/api/timer-commands', createTimerCommandsRouter(db, {
    onTimersChanged: () => {
        // Перезапускаем таймеры, если стрим онлайн
        if (timerIntervals.length > 0) {
            stopScheduledMessages();
            startScheduledMessages();
        }
    }
}));
app.use('/api/auth', createAuthRouter(db));

// Инициализация бота
let bot = null;

async function startBot() {
    try {
        console.log('🚀 Запуск Twitch бота...');
        
        if (!config.botOauth || !config.accessToken) {
            console.error('❌ Ошибка: отсутствуют необходимые токены!');
            console.error('Проверьте переменные окружения TWITCH_BOT_OAUTH и TWITCH_ACCESS_TOKEN');
            return;
        }
        
        bot = new TwitchBot(config, db);
        await bot.connect();
        console.log('✅ Бот успешно запущен и подключен к чату!');
    } catch (error) {
        console.error('❌ Ошибка при запуске бота:', error);
    }
}

// Функция самопинга для поддержания активности на бесплатном тарифе Render.com
function setupSelfPing() {
    if (!config.renderUrl) {
        console.log('⚠️  RENDER_URL не настроен, самопинг отключен');
        return;
    }
    
    // Пингуем каждые 5 минут (бесплатный тариф Render засыпает после 15 минут неактивности)
    cron.schedule('*/5 * * * *', async () => {
        try {
            const response = await axios.get(`${config.renderUrl}/health`);
            const streamStatus = timerIntervals.length > 0 ? 'stream: online 🟢' : 'stream: offline 🔴';
            console.log(`🏓 Самопинг выполнен: ${response.data.status} | ${streamStatus} - ${new Date().toISOString()}`);
        } catch (error) {
            console.error('❌ Ошибка самопинга:', error.message);
        }
    });
    
    console.log('✅ Самопинг настроен (каждые 5 минут)');
}

// ─── Таймерные сообщения из БД ──────────────────────────────────────────────

let timerIntervals = [];

function startScheduledMessages() {
    if (timerIntervals.length > 0) return; // уже запущены

    const timers = getEnabledTimerCommands(db);
    if (timers.length === 0) {
        console.log('⚠️  Нет активных таймерных команд в БД');
        return;
    }

    console.log(`▶️  Стрим онлайн — запускаем ${timers.length} таймерных сообщений`);

    for (const timer of timers) {
        const intervalMs = timer.interval_minutes * 60 * 1000;
        const id = setInterval(async () => {
            if (!bot) return;
            try {
                await bot.client.say(`#${config.channel}`, timer.message);
                console.log(`📨 [${timer.name}] Плановое сообщение отправлено в ${new Date().toISOString()}`);
            } catch (error) {
                console.error(`❌ Ошибка при отправке сообщения [${timer.name}]:`, error.message);
            }
        }, intervalMs);

        timerIntervals.push({ timerId: timer.id, intervalId: id });
    }
}

function stopScheduledMessages() {
    if (timerIntervals.length === 0) return;
    for (const { intervalId } of timerIntervals) {
        clearInterval(intervalId);
    }
    timerIntervals = [];
    console.log('⏹️  Стрим оффлайн — плановые сообщения остановлены');
}

// Верификация подписи Twitch EventSub
function verifyEventSubSignature(req) {
    const messageId = req.headers['twitch-eventsub-message-id'];
    const timestamp = req.headers['twitch-eventsub-message-timestamp'];
    const signature = req.headers['twitch-eventsub-message-signature'];

    if (!messageId || !timestamp || !signature) return false;

    const hmacMessage = messageId + timestamp + req.rawBody;
    const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', config.eventsubSecret)
        .update(hmacMessage)
        .digest('hex');

    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
    );
}

// Middleware для сохранения raw body (нужен для подписи EventSub)
app.use('/eventsub', express.json({
    verify: (req, _res, buf) => {
        req.rawBody = buf.toString();
    }
}));

// Webhook endpoint для Twitch EventSub
app.post('/eventsub', (req, res) => {
    if (!verifyEventSubSignature(req)) {
        console.warn('⚠️  EventSub: неверная подпись, запрос отклонён');
        return res.status(403).send('Forbidden');
    }

    const messageType = req.headers['twitch-eventsub-message-type'];

    // Верификация подписки (разовый запрос при создании)
    if (messageType === 'webhook_callback_verification') {
        console.log('✅ EventSub подписка подтверждена');
        return res.status(200).send(req.body.challenge);
    }

    // Отписка (Twitch отменил подписку)
    if (messageType === 'revocation') {
        console.warn('⚠️  EventSub подписка отозвана:', req.body.subscription?.type);
        return res.sendStatus(204);
    }

    // Событие
    if (messageType === 'notification') {
        const eventType = req.body.subscription?.type;

        if (eventType === 'stream.online') {
            startScheduledMessages();
        } else if (eventType === 'stream.offline') {
            stopScheduledMessages();
        }
    }

    res.sendStatus(204);
});

// ─── Регистрация EventSub подписок ──────────────────────────────────────────

// App Access Token (client credentials) — обязателен для EventSub webhook подписок
async function getAppAccessToken() {
    const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
        params: {
            client_id: config.clientId,
            client_secret: config.clientSecret,
            grant_type: 'client_credentials'
        }
    });
    return response.data.access_token;
}

async function deleteExistingSubscriptions(appToken) {
    try {
        const response = await axios.get('https://api.twitch.tv/helix/eventsub/subscriptions', {
            headers: {
                'Authorization': `Bearer ${appToken}`,
                'Client-Id': config.clientId
            }
        });

        const subs = response.data.data.filter(s =>
            (s.type === 'stream.online' || s.type === 'stream.offline') &&
            s.condition?.broadcaster_user_id === config.broadcasterId
        );

        for (const sub of subs) {
            await axios.delete(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${sub.id}`, {
                headers: {
                    'Authorization': `Bearer ${appToken}`,
                    'Client-Id': config.clientId
                }
            });
            console.log(`🗑️  Удалена старая подписка: ${sub.type} (${sub.id})`);
        }
    } catch (error) {
        console.error('❌ Ошибка при удалении старых подписок:', error.response?.data || error.message);
    }
}

async function subscribeToStreamEvents() {
    if (!config.renderUrl) {
        console.warn('⚠️  RENDER_URL не задан — EventSub подписки не будут зарегистрированы');
        return;
    }

    let appToken;
    try {
        appToken = await getAppAccessToken();
        console.log('✅ App Access Token получен');
    } catch (error) {
        console.error('❌ Не удалось получить App Access Token:', error.response?.data || error.message);
        return;
    }

    await deleteExistingSubscriptions(appToken);

    const callbackUrl = `${config.renderUrl}/eventsub`;
    const headers = {
        'Authorization': `Bearer ${appToken}`,
        'Client-Id': config.clientId,
        'Content-Type': 'application/json'
    };

    const types = ['stream.online', 'stream.offline'];

    for (const type of types) {
        try {
            await axios.post('https://api.twitch.tv/helix/eventsub/subscriptions', {
                type,
                version: '1',
                condition: { broadcaster_user_id: config.broadcasterId },
                transport: {
                    method: 'webhook',
                    callback: callbackUrl,
                    secret: config.eventsubSecret
                }
            }, { headers });
            console.log(`✅ EventSub подписка создана: ${type}`);
        } catch (error) {
            console.error(`❌ Ошибка создания подписки ${type}:`, error.response?.data || error.message);
        }
    }
}

// ─── Экспорт для тестов ─────────────────────────────────────────────────────

export { app, db };

// ─── Запуск сервера ──────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== 'test') {
    app.listen(config.port, async () => {
        console.log(`🌐 Сервер запущен на порту ${config.port}`);
        console.log(`📡 Health check: http://localhost:${config.port}/health`);
        console.log(`📊 Статистика: http://localhost:${config.port}/stats`);
        
        // Запускаем бота
        await startBot();
        
        // Настраиваем самопинг
        setupSelfPing();

        // Регистрируем EventSub подписки с задержкой 20 секунд,
        // чтобы сервер успел подняться и обработать challenge от Twitch
        console.log('⏳ EventSub: ждём 20 секунд перед регистрацией подписок...');
        setTimeout(() => subscribeToStreamEvents(), 20_000);
    });
}
