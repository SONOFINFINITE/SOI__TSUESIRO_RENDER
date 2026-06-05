import express from 'express';
import cron from 'node-cron';
import axios from 'axios';
import { TwitchBot } from './bot.js';

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
    renderUrl: process.env.RENDER_URL || ''
};

// Создаём Express приложение
const app = express();

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
    res.json({
        status: 'running',
        channel: config.channel,
        botUsername: config.botUsername,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

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
        
        bot = new TwitchBot(config);
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
    
    // Пингуем каждые 10 минут (бесплатный тариф Render засыпает после 15 минут неактивности)
    cron.schedule('*/10 * * * *', async () => {
        try {
            const response = await axios.get(`${config.renderUrl}/health`);
            console.log(`🏓 Самопинг выполнен: ${response.data.status} - ${new Date().toISOString()}`);
        } catch (error) {
            console.error('❌ Ошибка самопинга:', error.message);
        }
    });
    
    console.log('✅ Самопинг настроен (каждые 10 минут)');
}

// Запуск сервера
app.listen(config.port, () => {
    console.log(`🌐 Сервер запущен на порту ${config.port}`);
    console.log(`📡 Health check: http://localhost:${config.port}/health`);
    console.log(`📊 Статистика: http://localhost:${config.port}/stats`);
    
    // Запускаем бота
    startBot();
    
    // Настраиваем самопинг
    setupSelfPing();
});

// Обработка завершения процесса
process.on('SIGINT', async () => {
    console.log('⏹️  Получен сигнал остановки...');
    if (bot) {
        await bot.disconnect();
        console.log('👋 Бот отключен');
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('⏹️  Получен сигнал завершения...');
    if (bot) {
        await bot.disconnect();
        console.log('👋 Бот отключен');
    }
    process.exit(0);
});
