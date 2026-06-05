import tmi from 'tmi.js';
import axios from 'axios';

export class TwitchBot {
    constructor(config) {
        this.config = config;
        this.cachedChatters = [];
        
        // Массивы с данными для команд
        this.endings = [
            'Довольная СыСя',
            'Злая СыС',
            'Голодная СыСня',
            'Элегантная СыСесса',
            'Гламурная СыСуня',
            'Горящая Сыска',
            'Ми-ми-ми СыСюня',
            'Внимательный СыСщик',
            'не СыС',
            'КиберСыСлета',
            'Игривая СыСуня',
            'СыСлик',
            'СыСруина',
            'импоСыСтер'
        ];
        
        this.deviMeals = [
            'маслом',
            'хлебом',
            'вареньем',
            'сгущенкой',
            'мармеладом',
            'колбасой',
            'сыром',
            'говном',
            'сгущенкой',
            'мясом',
            'плесенью',
            'чаем',
            'кофе',
            'СыС',
            'валорантом',
            'Дэви',
            'кетчупом',
            'курочкой',
            'овощами',
            'слизью',
            'мазиком',
            'покемоном',
            'стингером',
            'енотом',
            'пельменями',
            'Шреком',
            'тундрой',
            'сахаром'
        ];
        
        this.client = new tmi.Client({
            options: { debug: false },
            identity: {
                username: config.botUsername,
                password: config.botOauth
            },
            channels: [config.channel]
        });
        
        this.setupHandlers();
    }
    
    setupHandlers() {
        this.client.on('connected', (addr, port) => {
            console.log(`✅ Бот подключен к ${addr}:${port}`);
            this.refreshChatters();
            setInterval(() => this.refreshChatters(), 30000);
        });
        
        this.client.on('subscription', (channel, username, method, message, userstate) => {
            this.client.say(channel, `Добро пожаловать в сысье царство, ${username}!`);
        });
        
        this.client.on('message', (channel, tags, message, self) => {
            if (self) return;
            
            this.handleMessage(channel, tags, message);
        });
    }
    
    async handleMessage(channel, tags, message) {
        const msg = message.toLowerCase();
        const username = tags.username;
        
        // Команды
        if (msg === '!вк') {
            this.client.say(
                channel,
                `@${username}, Паблик со стримлерскими новостями - https://vk.com/sys_vtube`
            );
        }
        
        else if (msg === '!почухать') {
            const excludedUsers = ['tsuesiro_bot', 'streamelements', 'creatisbot', username.toLowerCase()];
            const filteredChatters = this.cachedChatters.filter(chatter => !excludedUsers.includes(chatter.toLowerCase()));
            
            if (filteredChatters.length === 0) {
                this.client.say(channel, `@${username}, не удалось найти подходящего участника чата.`);
                return;
            }
            
            const validChatter = filteredChatters[Math.floor(Math.random() * filteredChatters.length)];
            this.client.say(channel, `@${username}, нежно чухает за ушком @${validChatter}`);
        }
        
        else if (msg === '!бусти') {
            this.client.say(channel, `@${username}, Мой бусти со всякими штучками - https://boosty.to/isysi`);
        }
        
        else if (msg === '!шалость') {
            const shalostActions = [
                'Жестко отхлестал',
                'накормил вкусняхами',
                'украл кошелек у',
                'украл зарплату у',
                'похитил',
                'запер в подвале',
                'сел на лицо',
                'взял в долг питсот мильонов деняк у',
                'развел на дроп',
                'отправил в Екатеринбург',
                'отправил в космос',
                'удалил',
                'хочет купить подписку',
                'заткнул кляпом рот',
                'зовет на свидание',
                'клянется в любви до гроба',
                'тайно ненавидит',
                'получил по жопе от',
                'лопнули от обжорства с',
                'нашел в коробке',
                'откусил жопу'
            ];
            const excludedUsers = ['tsuesiro_bot', 'streamelements', 'creatisbot', username.toLowerCase()];
            const filteredChatters = this.cachedChatters.filter(chatter => !excludedUsers.includes(chatter.toLowerCase()));
            
            if (filteredChatters.length === 0) {
                this.client.say(channel, `@${username}, не удалось найти подходящего участника чата.`);
                return;
            }
            
            const randomAction = shalostActions[Math.floor(Math.random() * shalostActions.length)];
            const randomChatter = filteredChatters[Math.floor(Math.random() * filteredChatters.length)];
            this.client.say(channel, `@${username}, ${randomAction} @${randomChatter}`);
        }
        
        else if (msg === '!дэви') {
            const randomMeal = this.deviMeals[Math.floor(Math.random() * this.deviMeals.length)];
            this.client.say(channel, `@${username}, накормил Дэви хлебом с ${randomMeal}!`);
        }
        
        else if (msg === '!любовь') {
            const excludedUsers = ['tsuesiro_bot', 'streamelements', 'creatisbot', username.toLowerCase()];
            const filteredChatters = this.cachedChatters.filter(chatter => !excludedUsers.includes(chatter.toLowerCase()));
            
            if (filteredChatters.length === 0) {
                this.client.say(channel, `@${username}, не удалось найти подходящего участника чата.`);
                return;
            }
            
            const percent = Math.floor(Math.random() * 101);
            const randomChatter = filteredChatters[Math.floor(Math.random() * filteredChatters.length)];
            this.client.say(channel, `${percent}% любви между @${username} и @${randomChatter}`);
        }
        
        else if (msg === '!дис') {
            this.client.say(channel, `@${username}, Я обязательно наведу тут порядок - discord.gg/jcQBmQ58NC`);
        }
        
        else if (msg === '!тг') {
            this.client.say(channel, `@${username}, Телега с щитпостами - https://t.me/cbicran`);
        }
        
        else if (msg === '!сыс') {
            const randomGreeting = this.endings[Math.floor(Math.random() * this.endings.length)];
            this.client.say(channel, `Поздравляю, @${username}, сегодня ты - ${randomGreeting}!`);
        }
        
        else if (msg === '!биба') {
            const biba = [
                { min: 1, max: 4, text: (n) => `${n}см, согрейся и попробуй еще раз {{ (>_<) }}` },
                { min: 5, max: 9, text: (n) => `не переживай, ${n}см тоже неплохо ヽ(￣ω￣(。。 )ゝ` },
                { min: 10, max: 15, text: (n) => `имеет твердый среднячок с ${n}см бибой (─‿‿─)` },
                { min: 16, max: 19, text: (n) => `отрастил себе ${n}см бибу  („ಡωಡ„)` },
                { min: 20, max: 24, text: (n) => `можешь гордиться своей ${n}см змеей ( ͡° ͜ʖ ͡°)` },
                { min: 25, max: 28, text: (n) => `УБЕРИ СВОЮ ${n}см ВАЛЫНУ!!! ε===D(っ≧ω≦)っ` },
                { min: 0, max: 0, text: () => `Ой, пипка отвалилась (⊙_⊙)` }
            ];
            const randomTier = biba[Math.floor(Math.random() * biba.length)];
            const size = randomTier.min === 0 ? 0 : Math.floor(Math.random() * (randomTier.max - randomTier.min + 1)) + randomTier.min;
            this.client.say(channel, `@${username}, ${randomTier.text(size)}`);
        }
        
        else if (msg === '!страшно') {
            this.client.say(
                channel,
                `⣿⠟⢋⣉⢙⣿⣿⡉⢉⣙⣿⠏⢉⠉⢹⣿⡿⠋⠙⣿⣿⡏⠙⠋⣙⣿⡿⠋⠙⣿ ⣿⡀⠘⣋⣽⣿⡟⠀⣼⣿⠏⢠⣶⣶⣿⠏⣠⣬⠀⣿⠟⢁⡄⢸⣿⠋⢠⡄⠀⣿ ⣿⣿⣿⣿⣿⣿⣿⣿⣿⠏⠹⠏⢉⣿⠏⣉⣉⣹⣿⣏⠉⣉⣹⣿⣿⣿⣿⣿⣿⣿ ⣿⣿⣿⣿⣿⣿⣿⣿⠏⣰⡆⢠⣿⠏⠐⠒⢒⣾⣿⠃⣸⣿⣿⣿⣿⣿⣿⣿⣿⣿ ⣿⣿⣿⡿⠋⣉⣉⣹⣿⠏⣉⠉⣹⣿⡿⠋⠉⣿⣿⣍⠉⣉⣽⡿⠉⠽⢿⣿⣿⣿ ⣿⣿⣿⣧⡀⢉⣩⣿⠋⣰⣶⣾⣿⢋⣤⣅⢀⣿⣿⡃⣸⣿⣿⠁⠒⢀⣼⣿⣿⣿ ⣿⣿⣿⡏⠉⠭⢹⣿⡿⠉⠭⢭⣿⡟⢩⡟⠉⣽⡟⠉⠽⠋⣹⡿⠋⣩⡍⢹⣿⣿ ⣿⣿⡟⠀⠒⠀⣼⣟⠁⠀⠒⣾⣿⣷⣶⢀⣼⣿⢁⣴⡀⣼⣿⣇⡈⢉⣠⣾⣿⣿ ⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛ ⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣴⠖⡒⠒⠖⣋⡀⡄⠀⠀⠀⠀⠀⠀⠀⠀⣠⠄⡀ ⠀⠀⠀⠀⣀⣤⣶⣿⣿⣿⡀⠛⠀⠀⠱⠛⠀⠽⠀⠀⠀⠀⢀⡤⠚⠁⠔⠁⠀⠀ ⠀⠀⣰⣿⣿⠉⡉⣿⣿⣽⣮⣥⣾⣿⣮⣷⡾⠀⠀⠀⢠⠎⠀⠀⠀⡑⢄⠀⠀ ⢀⠎⠸⣿⣿⣦⠑⠑⠒⠒⠒⠒⠒⠒⡉⠀⠀⠀⠀⠀⣇⠀⣈⠍⡲⣀⡄⠇⠀ ⣿⣶⣤⡈⠛⠿⠿⢿⣿⠿⠿⢿⣛⡯⣲⣄⠀⠀⠀⠀⠈⠓⠮⣔⠒⢏⠀⠀⠀ ⣿⣿⣿⣿⣷⣶⣄⠸⠟⠛⠛⠻⢿⣷⣿⣿⣷⡀⠀⠀⠀⠀⠀⠀⠈⠛⠚⠀⠀`
            );
        }
    }
    
    async deleteMessage(messageId) {
        try {
            await axios.delete(`https://api.twitch.tv/helix/moderation/chat`, {
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`,
                    'Client-Id': this.config.clientId
                },
                params: {
                    broadcaster_id: this.config.broadcasterId,
                    moderator_id: this.config.moderatorId,
                    message_id: messageId
                }
            });
        } catch (error) {
            console.error('Error deleting message:', error.response?.data || error.message);
        }
    }
    
    async getUserId(username) {
        try {
            const response = await axios.get(`https://api.twitch.tv/helix/users`, {
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`,
                    'Client-Id': this.config.clientId
                },
                params: {
                    login: username
                }
            });
            
            return response.data.data[0]?.id || null;
        } catch (error) {
            console.error('Error getting user ID:', error.response?.data || error.message);
            return null;
        }
    }
    
    async banUser(userId, duration) {
        try {
            await axios.post(
                `https://api.twitch.tv/helix/moderation/bans`,
                {
                    data: {
                        user_id: userId,
                        duration: duration
                    }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.config.accessToken}`,
                        'Client-Id': this.config.clientId,
                        'Content-Type': 'application/json'
                    },
                    params: {
                        broadcaster_id: this.config.broadcasterId,
                        moderator_id: this.config.moderatorId
                    }
                }
            );
        } catch (error) {
            console.error('Error banning user:', error.response?.data || error.message);
        }
    }
    
    async refreshChatters() {
        this.cachedChatters = await this.getChatters();
    }

    async getChatters() {
        try {
            const response = await axios.get(`https://api.twitch.tv/helix/chat/chatters`, {
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`,
                    'Client-Id': this.config.clientId
                },
                params: {
                    broadcaster_id: this.config.broadcasterId,
                    moderator_id: this.config.moderatorId,
                    first: 1000
                }
            });
            
            return response.data.data.map(chatter => chatter.user_name);
        } catch (error) {
            console.error('Error getting chatters:', error.response?.data || error.message);
            return [];
        }
    }
    
    connect() {
        return this.client.connect();
    }
    
    disconnect() {
        return this.client.disconnect();
    }
}
