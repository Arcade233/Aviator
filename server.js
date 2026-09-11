const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

let roundPhase = 'WAITING';
let currentMultiplier = 1.00;
let crashPoint = 1.00;
let countdown = 5.0;

function generateCrashPoint() {
    const r = Math.random() * 100;
    if (r < 3) return 1.00;
    return parseFloat((Math.max(1.00, 100 / (100 - r))).toFixed(2));
}

function startWaitingPhase() {
    roundPhase = 'WAITING';
    currentMultiplier = 1.00;
    countdown = 5.0;

    io.emit('game_state', { phase: roundPhase, countdown: countdown.toFixed(1) });

    const waitTimer = setInterval(() => {
        countdown -= 0.1;
        io.emit('waiting_tick', { countdown: Math.max(0, countdown).toFixed(1) });

        if (countdown <= 0) {
            clearInterval(waitTimer);
            startFlightPhase();
        }
    }, 100);
}

function startFlightPhase() {
    roundPhase = 'RUNNING';
    crashPoint = generateCrashPoint();
    currentMultiplier = 1.00;

    const startTime = Date.now();
    io.emit('game_state', { phase: roundPhase });

    const gameInterval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        currentMultiplier = parseFloat((Math.pow(Math.E, 0.06 * elapsed)).toFixed(2));

        if (currentMultiplier >= crashPoint) {
            currentMultiplier = crashPoint;
            clearInterval(gameInterval);
            triggerCrash();
        } else {
            io.emit('multiplier_tick', { multiplier: currentMultiplier.toFixed(2), elapsed });
        }
    }, 100);
}

function triggerCrash() {
    roundPhase = 'CRASHED';
    io.emit('game_state', { phase: roundPhase, crashPoint: currentMultiplier.toFixed(2) });

    setTimeout(() => {
        startWaitingPhase();
    }, 3000);
}

startWaitingPhase();

io.on('connection', (socket) => {
    socket.emit('init_state', {
        phase: roundPhase,
        multiplier: currentMultiplier.toFixed(2),
        countdown: countdown.toFixed(1)
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
