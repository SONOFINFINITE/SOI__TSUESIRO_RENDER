import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Допустимые типы команд
export const COMMAND_TYPES = [
    'simple',               // статический ответ
    'random_reply',         // случайный вариант из variants
    'random_target',        // случайный юзер из чата
    'random_target_action', // случайный юзер + случайное действие из variants
    'random_percent_target',// проценты + случайный юзер
    'random_range',         // случайное число из диапазонов (variants = [{min,max,text}])
];

export function createDatabase(dbPath) {
    const db = new Database(dbPath || path.join(__dirname, 'bot.db'));

    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Команды чата
    db.exec(`
        CREATE TABLE IF NOT EXISTS commands (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trigger TEXT NOT NULL UNIQUE,
            type TEXT NOT NULL DEFAULT 'simple',
            response TEXT NOT NULL,
            variants TEXT,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);

    // Миграция: добавляем колонки type и variants если их нет
    const columns = db.pragma('table_info(commands)').map(c => c.name);
    if (!columns.includes('type')) {
        db.exec(`ALTER TABLE commands ADD COLUMN type TEXT NOT NULL DEFAULT 'simple'`);
    }
    if (!columns.includes('variants')) {
        db.exec(`ALTER TABLE commands ADD COLUMN variants TEXT`);
    }
    if (!columns.includes('enabled')) {
        db.exec(`ALTER TABLE commands ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1`);
    }

    // Администраторы (для будущей панели управления)
    db.exec(`
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);

    // Таймерные команды (отправляются по интервалу, пока стрим онлайн)
    db.exec(`
        CREATE TABLE IF NOT EXISTS timer_commands (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            message TEXT NOT NULL,
            interval_minutes INTEGER NOT NULL DEFAULT 25,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);

    return db;
}

// ─── CRUD для обычных команд ────────────────────────────────────────────────

function serializeVariants(variants) {
    if (variants === undefined || variants === null) return null;
    return typeof variants === 'string' ? variants : JSON.stringify(variants);
}

function deserializeCommand(row) {
    if (!row) return row;
    return {
        ...row,
        variants: row.variants ? JSON.parse(row.variants) : null
    };
}

export function getAllCommands(db) {
    return db.prepare('SELECT * FROM commands ORDER BY trigger').all().map(deserializeCommand);
}

export function getCommandById(db, id) {
    return deserializeCommand(db.prepare('SELECT * FROM commands WHERE id = ?').get(id));
}

export function getCommandByTrigger(db, trigger) {
    return deserializeCommand(db.prepare('SELECT * FROM commands WHERE trigger = ?').get(trigger));
}

export function createCommand(db, { trigger, type, response, variants, enabled }) {
    const stmt = db.prepare(
        `INSERT INTO commands (trigger, type, response, variants, enabled) VALUES (?, ?, ?, ?, ?)`
    );
    const result = stmt.run(trigger, type || 'simple', response, serializeVariants(variants), enabled !== undefined ? (enabled ? 1 : 0) : 1);
    return getCommandById(db, result.lastInsertRowid);
}

export function updateCommand(db, id, { trigger, type, response, variants, enabled }) {
    const existing = getCommandById(db, id);
    if (!existing) return null;

    const stmt = db.prepare(
        `UPDATE commands SET trigger = ?, type = ?, response = ?, variants = ?, enabled = ?, updated_at = datetime('now') WHERE id = ?`
    );
    stmt.run(
        trigger ?? existing.trigger,
        type ?? existing.type,
        response ?? existing.response,
        variants !== undefined ? serializeVariants(variants) : serializeVariants(existing.variants),
        enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
        id
    );
    return getCommandById(db, id);
}

export function deleteCommand(db, id) {
    const existing = getCommandById(db, id);
    if (!existing) return false;
    db.prepare('DELETE FROM commands WHERE id = ?').run(id);
    return true;
}

export function getEnabledCommands(db) {
    return db.prepare('SELECT * FROM commands WHERE enabled = 1 ORDER BY trigger').all().map(deserializeCommand);
}

// ─── CRUD для таймерных команд ──────────────────────────────────────────────

export function getAllTimerCommands(db) {
    return db.prepare('SELECT * FROM timer_commands ORDER BY name').all();
}

export function getTimerCommandById(db, id) {
    return db.prepare('SELECT * FROM timer_commands WHERE id = ?').get(id);
}

export function createTimerCommand(db, { name, message, interval_minutes, enabled }) {
    const stmt = db.prepare(
        `INSERT INTO timer_commands (name, message, interval_minutes, enabled) VALUES (?, ?, ?, ?)`
    );
    const result = stmt.run(
        name,
        message,
        interval_minutes ?? 25,
        enabled !== undefined ? (enabled ? 1 : 0) : 1
    );
    return getTimerCommandById(db, result.lastInsertRowid);
}

export function updateTimerCommand(db, id, { name, message, interval_minutes, enabled }) {
    const existing = getTimerCommandById(db, id);
    if (!existing) return null;

    const stmt = db.prepare(
        `UPDATE timer_commands SET name = ?, message = ?, interval_minutes = ?, enabled = ?, updated_at = datetime('now') WHERE id = ?`
    );
    stmt.run(
        name ?? existing.name,
        message ?? existing.message,
        interval_minutes ?? existing.interval_minutes,
        enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
        id
    );
    return getTimerCommandById(db, id);
}

export function deleteTimerCommand(db, id) {
    const existing = getTimerCommandById(db, id);
    if (!existing) return false;
    db.prepare('DELETE FROM timer_commands WHERE id = ?').run(id);
    return true;
}

export function getEnabledTimerCommands(db) {
    return db.prepare('SELECT * FROM timer_commands WHERE enabled = 1 ORDER BY name').all();
}

// ─── Функции для администраторов ────────────────────────────────────────────

const SALT_ROUNDS = 10;

export function getAdminByUsername(db, username) {
    return db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
}

export async function createAdmin(db, { username, password }) {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const stmt = db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)');
    const result = stmt.run(username, passwordHash);
    return { id: result.lastInsertRowid, username };
}

export async function verifyAdmin(db, username, password) {
    const admin = getAdminByUsername(db, username);
    if (!admin) return null;
    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) return null;
    return { id: admin.id, username: admin.username };
}

// ─── Seed: начальные данные ─────────────────────────────────────────────────

export async function seedDefaults(db) {
    const commandCount = db.prepare('SELECT COUNT(*) as cnt FROM commands').get().cnt;
    const timerCount = db.prepare('SELECT COUNT(*) as cnt FROM timer_commands').get().cnt;
    const adminCount = db.prepare('SELECT COUNT(*) as cnt FROM admins').get().cnt;

    if (commandCount === 0) {
        const defaultCommands = [
            // Простые команды
            {
                trigger: '!вк',
                type: 'simple',
                response: '@{user}, Паблик со стримлерскими новостями - https://vk.com/sys_vtube',
                variants: null
            },
            {
                trigger: '!бусти',
                type: 'simple',
                response: '@{user}, Мой бусти со всякими штучками - https://boosty.to/isysi',
                variants: null
            },
            {
                trigger: '!дис',
                type: 'simple',
                response: '@{user}, Я обязательно наведу тут порядок - discord.gg/jcQBmQ58NC',
                variants: null
            },
            {
                trigger: '!тг',
                type: 'simple',
                response: '@{user}, Телега с щитпостами - https://t.me/cbicran',
                variants: null
            },
            // Случайный вариант из списка
            {
                trigger: '!сыс',
                type: 'random_reply',
                response: 'Поздравляю, @{user}, сегодня ты - {variant}!',
                variants: [
                    'Довольная СыСя', 'Злая СыС', 'Голодная СыСня', 'Элегантная СыСесса',
                    'Гламурная СыСуня', 'Горящая Сыска', 'Ми-ми-ми СыСюня', 'Внимательный СыСщик',
                    'не СыС', 'КиберСыСлета', 'Игривая СыСуня', 'СыСлик', 'СыСруина', 'импоСыСтер'
                ]
            },
            {
                trigger: '!дэви',
                type: 'random_reply',
                response: '@{user}, накормил Дэви хлебом с {variant}!',
                variants: [
                    'маслом', 'хлебом', 'вареньем', 'сгущенкой', 'мармеладом', 'колбасой',
                    'сыром', 'говном', 'сгущенкой', 'мясом', 'плесенью', 'чаем', 'кофе',
                    'СыС', 'валорантом', 'Дэви', 'кетчупом', 'курочкой', 'овощами',
                    'слизью', 'мазиком', 'покемоном', 'стингером', 'енотом', 'пельменями',
                    'Шреком', 'тундрой', 'сахаром'
                ]
            },
            // Случайный юзер из чата
            {
                trigger: '!почухать',
                type: 'random_target',
                response: '@{user}, нежно чухает за ушком @{target}',
                variants: null
            },
            // Случайный юзер + случайное действие из variants
            {
                trigger: '!шалость',
                type: 'random_target_action',
                response: '@{user}, {variant} @{target}',
                variants: [
                    'Жестко отхлестал', 'накормил вкусняхами', 'украл кошелек у',
                    'украл зарплату у', 'похитил', 'запер в подвале', 'сел на лицо',
                    'взял в долг питсот мильонов деняк у', 'развел на дроп',
                    'отправил в Екатеринбург', 'отправил в космос', 'удалил',
                    'хочет купить подписку', 'заткнул кляпом рот', 'зовет на свидание',
                    'клянется в любви до гроба', 'тайно ненавидит', 'получил по жопе от',
                    'лопнули от обжорства с', 'нашел в коробке', 'откусил жопу'
                ]
            },
            // Проценты + случайный юзер
            {
                trigger: '!любовь',
                type: 'random_percent_target',
                response: '{percent}% любви между @{user} и @{target}',
                variants: null
            },
            // Случайное число из диапазонов
            {
                trigger: '!биба',
                type: 'random_range',
                response: '@{user}, {variant}',
                variants: [
                    { min: 1, max: 4, text: '{size}см, согрейся и попробуй еще раз {{ (>_<) }}' },
                    { min: 5, max: 9, text: 'не переживай, {size}см тоже неплохо ヽ(￣ω￣(。。 )ゝ' },
                    { min: 10, max: 15, text: 'имеет твердый среднячок с {size}см бибой (─‿‿─)' },
                    { min: 16, max: 19, text: 'отрастил себе {size}см бибу  („ಡωಡ„)' },
                    { min: 20, max: 24, text: 'можешь гордиться своей {size}см змеей ( ͡° ͜ʖ ͡°)' },
                    { min: 25, max: 28, text: 'УБЕРИ СВОЮ {size}см ВАЛЫНУ!!! ε===D(っ≧ω≦)っ' },
                    { min: 0, max: 0, text: 'Ой, пипка отвалилась (⊙_⊙)' }
                ]
            },
            // Статический текст (ASCII-арт)
            {
                trigger: '!страшно',
                type: 'simple',
                response: '⣿⠟⢋⣉⢙⣿⣿⡉⢉⣙⣿⠏⢉⠉⢹⣿⡿⠋⠙⣿⣿⡏⠙⠋⣙⣿⡿⠋⠙⣿ ⣿⡀⠘⣋⣽⣿⡟⠀⣼⣿⠏⢠⣶⣶⣿⠏⣠⣬⠀⣿⠟⢁⡄⢸⣿⠋⢠⡄⠀⣿ ⣿⣿⣿⣿⣿⣿⣿⣿⣿⠏⠹⠏⢉⣿⠏⣉⣉⣹⣿⣏⠉⣉⣹⣿⣿⣿⣿⣿⣿⣿ ⣿⣿⣿⣿⣿⣿⣿⣿⠏⣰⡆⢠⣿⠏⠐⠒⢒⣾⣿⠃⣸⣿⣿⣿⣿⣿⣿⣿⣿⣿ ⣿⣿⣿⡿⠋⣉⣉⣹⣿⠏⣉⠉⣹⣿⡿⠋⠉⣿⣿⣍⠉⣉⣽⡿⠉⠽⢿⣿⣿⣿ ⣿⣿⣿⣧⡀⢉⣩⣿⠋⣰⣶⣾⣿⢋⣤⣅⢀⣿⣿⡃⣸⣿⣿⠁⠒⢀⣼⣿⣿⣿ ⣿⣿⣿⡏⠉⠭⢹⣿⡿⠉⠭⢭⣿⡟⢩⡟⠉⣽⡟⠉⠽⠋⣹⡿⠋⣩⡍⢹⣿⣿ ⣿⣿⡟⠀⠒⠀⣼⣟⠁⠀⠒⣾⣿⣷⣶⢀⣼⣿⢁⣴⡀⣼⣿⣇⡈⢉⣠⣾⣿⣿ ⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛ ⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣴⠖⡒⠒⠖⣋⡀⡄⠀⠀⠀⠀⠀⠀⠀⠀⣠⠄⡀ ⠀⠀⠀⠀⣀⣤⣶⣿⣿⣿⡀⠛⠀⠀⠱⠛⠀⠽⠀⠀⠀⠀⢀⡤⠚⠁⠔⠁⠀⠀ ⠀⠀⣰⣿⣿⠉⡉⣿⣿⣽⣮⣥⣾⣿⣮⣷⡾⠀⠀⠀⢠⠎⠀⠀⠀⡑⢄⠀⠀ ⢀⠎⠸⣿⣿⣦⠑⠑⠒⠒⠒⠒⠒⠒⡉⠀⠀⠀⠀⠀⣇⠀⣈⠍⡲⣀⡄⠇⠀ ⣿⣶⣤⡈⠛⠿⠿⢿⣿⠿⠿⢿⣛⡯⣲⣄⠀⠀⠀⠀⠈⠓⠮⣔⠒⢏⠀⠀⠀ ⣿⣿⣿⣿⣷⣶⣄⠸⠟⠛⠛⠻⢿⣷⣿⣿⣷⡀⠀⠀⠀⠀⠀⠀⠈⠛⠚⠀⠀',
                variants: null
            },
        ];

        const insert = db.prepare(
            'INSERT INTO commands (trigger, type, response, variants) VALUES (?, ?, ?, ?)'
        );
        const insertMany = db.transaction((cmds) => {
            for (const cmd of cmds) {
                insert.run(cmd.trigger, cmd.type, cmd.response, serializeVariants(cmd.variants));
            }
        });
        insertMany(defaultCommands);
        console.log(`📦 Добавлены начальные команды: ${defaultCommands.length}`);
    }

    if (timerCount === 0) {
        const defaultTimers = [
            {
                name: 'tg_promo',
                message: 'Если хотите знать о СыСществовании вне стримов,  то добро пожаловать на мою тг грядку t.me/cbicran',
                interval_minutes: 25,
                enabled: 1
            },
            {
                name: 'donate_promo',
                message: 'Если хотите поддержать меня копейком или подаркой,  то в описании есть ссылочки на актуальные сервисы <3',
                interval_minutes: 60,
                enabled: 1
            },
        ];

        const insert = db.prepare(
            'INSERT INTO timer_commands (name, message, interval_minutes, enabled) VALUES (?, ?, ?, ?)'
        );
        const insertMany = db.transaction((timers) => {
            for (const t of timers) insert.run(t.name, t.message, t.interval_minutes, t.enabled);
        });
        insertMany(defaultTimers);
        console.log(`📦 Добавлены начальные таймерные команды: ${defaultTimers.length}`);
    }

    if (adminCount === 0) {
        await createAdmin(db, { username: 'i_cbic_i', password: '3k4a0t9y2a783' });
        console.log('📦 Добавлен администратор по умолчанию: i_cbic_i');
    }
}
