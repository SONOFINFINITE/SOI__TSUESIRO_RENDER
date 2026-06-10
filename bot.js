import tmi from 'tmi.js';
import axios from 'axios';
import { getCommandByTrigger } from './database.js';

export class TwitchBot {
    constructor(config, db) {
        this.config = config;
        this.db = db;
        this.cachedChatters = [];
        
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
    
    // ─── Шаблонный движок команд ────────────────────────────────────────────

    getRandomChatter(username) {
        const excludedUsers = ['tsuesiro_bot', 'streamelements', 'creatisbot', username.toLowerCase()];
        const filtered = this.cachedChatters.filter(
            chatter => !excludedUsers.includes(chatter.toLowerCase())
        );
        if (filtered.length === 0) return null;
        return filtered[Math.floor(Math.random() * filtered.length)];
    }

    executeCommand(command, username) {
        const { type, response, variants } = command;
        let result = response;

        switch (type) {
            case 'simple': {
                result = result.replaceAll('{user}', username);
                break;
            }

            case 'random_reply': {
                if (!variants || variants.length === 0) return null;
                const variant = variants[Math.floor(Math.random() * variants.length)];
                result = result.replaceAll('{user}', username).replaceAll('{variant}', variant);
                break;
            }

            case 'random_target': {
                const target = this.getRandomChatter(username);
                if (!target) return null;
                result = result.replaceAll('{user}', username).replaceAll('{target}', target);
                break;
            }

            case 'random_target_action': {
                const target = this.getRandomChatter(username);
                if (!target) return null;
                if (!variants || variants.length === 0) return null;
                const variant = variants[Math.floor(Math.random() * variants.length)];
                result = result
                    .replaceAll('{user}', username)
                    .replaceAll('{target}', target)
                    .replaceAll('{variant}', variant);
                break;
            }

            case 'random_percent_target': {
                const target = this.getRandomChatter(username);
                if (!target) return null;
                const percent = Math.floor(Math.random() * 101);
                result = result
                    .replaceAll('{user}', username)
                    .replaceAll('{target}', target)
                    .replaceAll('{percent}', String(percent));
                break;
            }

            case 'random_range': {
                if (!variants || variants.length === 0) return null;
                const tier = variants[Math.floor(Math.random() * variants.length)];
                const size = tier.min === 0 && tier.max === 0
                    ? 0
                    : Math.floor(Math.random() * (tier.max - tier.min + 1)) + tier.min;
                const variantText = tier.text.replaceAll('{size}', String(size));
                result = result
                    .replaceAll('{user}', username)
                    .replaceAll('{variant}', variantText);
                break;
            }

            default:
                result = result.replaceAll('{user}', username);
        }

        return result;
    }

    async handleMessage(channel, tags, message) {
        const msg = message.toLowerCase();
        const username = tags.username;
        
        if (!msg.startsWith('!') || !this.db) return;

        const command = getCommandByTrigger(this.db, msg);
        if (!command || !command.enabled) return;

        const result = this.executeCommand(command, username);

        if (result === null) {
            // Не удалось выполнить (нет чаттеров или вариантов)
            const needsTarget = ['random_target', 'random_target_action', 'random_percent_target'];
            if (needsTarget.includes(command.type)) {
                this.client.say(channel, `@${username}, не удалось найти подходящего участника чата.`);
            }
            return;
        }

        this.client.say(channel, result);
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
