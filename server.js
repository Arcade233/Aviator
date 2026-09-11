const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

// Game State
let gameState = {
    phase: 'WAITING', // 'WAITING', 'RUNNING', 'CRASHED'
    multiplier: 1.00,
    crashPoint: 1.00,
    countdown: 5,
    roundId: Date.now()
};

// Helper: Generate crash multiplier weighted towards lower numbers (like real Aviator)
function generateCrashPoint() {
    const e = 100;
    const r = Math.floor(Math.random() * e);
    if (r === 0) return 1.00; // Instant crash
    const crash = parseFloat((Math.floor((100 * e - r) / (e - r)) / 100).toFixed(2));
    // Cap maximum payout multiplier for safety
    return Math.min(crash, 100.00);
}

// 1. API Endpoint for your Telegram Bot to query the next multiplier
app.get('/api/next-multiplier', (req, res) => {
    res.json({
        roundId: gameState.roundId,
        phase: gameState.phase,
        countdown: gameState.countdown,
        predictedMultiplier: gameState.crashPoint
    });
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Main Game Loop
function startNewRound() {
    gameState.phase = 'WAITING';
    gameState.multiplier = 1.00;
    gameState.countdown = 5;
    gameState.roundId = Date.now();
    
    // PREDICT & LOCK IN THE CRASH POINT BEFORE TAKEOFF
    gameState.crashPoint = generateCrashPoint();
    console.log(`[Round ${gameState.roundId}] Predicted Crash Point: ${gameState.crashPoint}x`);

    io.emit('game_state', gameState);

    // 5-second countdown timer
    const countdownInterval = setInterval(() => {
        gameState.countdown -= 1;
        io.emit('waiting_tick', { countdown: gameState.countdown });

        if (gameState.countdown <= 0) {
            clearInterval(countdownInterval);
            launchFlight();
        }
    }, 1000);
}

function launchFlight() {
    gameState.phase = 'RUNNING';
    io.emit('game_state', gameState);

    let startTime = Date.now();

    const flightInterval = setInterval(() => {
        let elapsed = (Date.now() - startTime) / 1000;
        // Exponential growth formula for multiplier curve
        gameState.multiplier = parseFloat(Math.pow(Math.E, 0.06 * elapsed).toFixed(2));

        if (gameState.multiplier >= gameState.crashPoint) {
            clearInterval(flightInterval);
            gameState.multiplier = gameState.crashPoint;
            gameState.phase = 'CRASHED';

            io.emit('game_state', gameState);

            // Wait 3 seconds before starting next round
            setTimeout(() => {
                startNewRound();
            }, 3000);
        } else {
            io.emit('multiplier_tick', {
                multiplier: gameState.multiplier,
                elapsed: elapsed
            });
        }
    }, 100);
}

// Start game loop
startNewRound();

// Socket Connection handling
io.on('connection', (socket) => {
    socket.emit('init_state', gameState);
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
