const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 8080 });
const clients = new Map(); // userId -> { ws, lastSeen }

const SERVER_VERSION = '3.0';
const SERVER_NAME = 'XM Ver. 3.0';

console.log(`╔════════════════════════════════════════════════════════╗`);
console.log(`║     📡 ${SERVER_NAME} WebSocket-сервер (с ретрансляцией)   ║`);
console.log(`╚════════════════════════════════════════════════════════╝`);

// Проверка активности клиентов (удаляем неактивные)
setInterval(() => {
    const now = Date.now();
    for (const [id, client] of clients.entries()) {
        if (now - client.lastSeen > 60000) { // 1 минута бездействия
            clients.delete(id);
            console.log(`⏰ ${id} удалён (таймаут)`);
            broadcastOnlineUsers();
        }
    }
}, 30000);

server.on('connection', (ws) => {
    let userId = null;

    ws.on('message', (msg) => {
        try {
            const data = JSON.parse(msg);
            
            if (data.type === 'register') {
                userId = data.id;
                clients.set(userId, { ws, lastSeen: Date.now() });
                ws.send(JSON.stringify({ type: 'registered', id: userId, serverVersion: SERVER_VERSION }));
                console.log(`✅ ${userId} подключился`);
                broadcastOnlineUsers();
            }
            else if (data.type === 'offer') {
                const target = clients.get(data.to);
                if (target) {
                    target.ws.send(JSON.stringify({
                        type: 'offer',
                        from: userId,
                        offer: data.offer
                    }));
                    console.log(`📞 Вызов от ${userId} к ${data.to}`);
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: `Пользователь ${data.to} не в сети` }));
                    console.log(`❌ ${userId} → ${data.to}: не найден`);
                }
            }
            else if (data.type === 'answer') {
                const target = clients.get(data.to);
                if (target) {
                    target.ws.send(JSON.stringify({
                        type: 'answer',
                        from: userId,
                        answer: data.answer
                    }));
                    console.log(`🔄 Ответ от ${userId} к ${data.to}`);
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: `Пользователь ${data.to} не в сети` }));
                }
            }
            else if (data.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong', time: Date.now() }));
                const client = clients.get(userId);
                if (client) client.lastSeen = Date.now();
            }
            // === РЕТРАНСЛЯЦИЯ СООБЩЕНИЙ (если прямое соединение не удалось) ===
            else if (data.type === 'chat_relay') {
                const target = clients.get(data.to);
                if (target) {
                    target.ws.send(JSON.stringify({
                        type: 'chat',
                        from: userId,
                        text: data.text,
                        sender: data.sender
                    }));
                    console.log(`💬 РЕТРАНСЛЯЦИЯ: ${userId} → ${data.to}`);
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: `Не удалось доставить сообщение ${data.to}` }));
                }
            }
            else if (data.type === 'file_relay') {
                const target = clients.get(data.to);
                if (target) {
                    target.ws.send(JSON.stringify({
                        type: 'file',
                        from: userId,
                        name: data.name,
                        data: data.data,
                        sender: data.sender
                    }));
                    console.log(`📎 РЕТРАНСЛЯЦИЯ файла: ${userId} → ${data.to} (${data.name})`);
                }
            }
        } catch(e) {
            console.log('Ошибка:', e);
        }
    });

    ws.on('close', () => {
        if (userId) {
            clients.delete(userId);
            console.log(`❌ ${userId} отключился`);
            broadcastOnlineUsers();
        }
    });
});

function broadcastOnlineUsers() {
    const online = Array.from(clients.keys());
    const message = JSON.stringify({ type: 'online_users', users: online });
    clients.forEach((client) => {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(message);
        }
    });
}

const os = require('os');
const interfaces = os.networkInterfaces();
let localIp = 'localhost';
for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
        if (net.family === 'IPv4' && !net.internal && net.address.startsWith('192.168.')) {
            localIp = net.address;
            break;
        }
    }
}

console.log(`✅ Сервер ${SERVER_NAME} запущен на порту 8080`);
console.log(`📱 Адрес: ws://${localIp}:8080`);
console.log(`💡 Режим: сигнальный + ретрансляция сообщений`);
console.log('');