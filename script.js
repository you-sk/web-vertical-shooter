const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreBoard = document.getElementById('scoreBoard');

const startOverlay = document.getElementById('startOverlay');
const startButton = document.getElementById('startButton');

const messageOverlay = document.getElementById('messageOverlay');
const messageText = document.getElementById('messageText');
const overlayRestartButton = document.getElementById('overlayRestartButton');

let canvasWidth = Math.min(window.innerWidth * 0.9, 400);
let canvasHeight = Math.min(window.innerHeight * 0.65, 550); 

canvas.width = canvasWidth;
canvas.height = canvasHeight;

// ゲームの状態
let score = 0;
let gameOver = false;
let gameRunning = false; // 最初は false
let animationFrameId;
let mouseOverCanvas = false;
let playerShooting = true;
let enemiesMissed = 0;
const maxEnemiesMissed = 100;

// キー入力状態
let leftKeyPressed = false;
let rightKeyPressed = false;

// オーディオ関連
let audioInitialized = false;
let playerShootSound, enemyExplosionSound, powerUpSound, playerHitSound;

async function initializeAudio() {
    if (audioInitialized) {
        return;
    }

    if (typeof Tone === 'undefined' || Tone === null) {
        console.error("Tone.js is not loaded!");
        return;
    }

    try {
        await Tone.start(); 

        if (Tone.context.state === "running") {
            audioInitialized = true;

            playerShootSound = new Tone.MembraneSynth({
                pitchDecay: 0.005,
                octaves: 3,
                oscillator: { type: "sine" },
                envelope: { attack: 0.001, decay: 0.15, sustain: 0.01, release: 0.05 },
                volume: -18 
            }).toDestination();

            enemyExplosionSound = new Tone.NoiseSynth({
                noise: { type: "white" },
                envelope: { attack: 0.005, decay: 0.1, sustain: 0 },
                volume: -10
            }).toDestination();

            powerUpSound = new Tone.Synth({
                oscillator: { type: "triangle" },
                envelope: { attack: 0.01, decay: 0.1, sustain: 0.05, release: 0.1 },
                volume: -8
            }).toDestination();

            playerHitSound = new Tone.Synth({
                oscillator: { type: "sawtooth" },
                envelope: { attack: 0.01, decay: 0.25, sustain: 0 },
                volume: -8
            }).toDestination();
        }
    } catch (e) {
        console.error("Error during Tone.start() or synth initialization:", e);
    }
}

// 星の背景
let stars = [];
const numStars = 100;
const starSpeed = 0.5;

function initStars() {
    stars = [];
    for (let i = 0; i < numStars; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            radius: Math.random() * 1.5,
            alpha: Math.random() * 0.5 + 0.5
        });
    }
}

function drawStars() {
    ctx.save();
    stars.forEach(star => {
        star.y += starSpeed;
        if (star.y > canvas.height) {
            star.y = 0;
            star.x = Math.random() * canvas.width;
        }
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
        ctx.fill();
    });
    ctx.restore();
}

// 自機
const player = {
    x: canvas.width / 2 - 15,
    y: canvas.height - 50,
    width: 30,
    height: 30,
    color: '#4CAF50',
    dx: 5,
    lives: 3,
    invincible: false,
    invincibleTimer: 0,
    invincibleDuration: 120,
    powerLevel: 0,
    maxPowerLevel: 2
};

function drawPlayer() {
    if (!gameRunning) return; 
    if (player.invincible && Math.floor(player.invincibleTimer / 10) % 2 === 0) {
        // 点滅
    } else {
        let playerColor = player.color;
        if (player.powerLevel === 1) playerColor = '#66BB6A';
        else if (player.powerLevel === 2) playerColor = '#81C784';

        ctx.beginPath();
        ctx.moveTo(player.x + player.width / 2, player.y);
        ctx.lineTo(player.x, player.y + player.height);
        ctx.lineTo(player.x + player.width, player.y + player.height);
        ctx.closePath();
        ctx.fillStyle = playerColor;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(player.x + player.width / 2, player.y + player.height * 0.6, player.width * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = '#87CEEB';
        ctx.fill();
    }

    if (player.invincible) {
        player.invincibleTimer--;
        if (player.invincibleTimer <= 0) {
            player.invincible = false;
        }
    }
}

function movePlayer() {
    if (!gameRunning) return;
    if (!mouseOverCanvas) {
        if (leftKeyPressed && player.x > 0) {
            player.x -= player.dx;
        }
        if (rightKeyPressed && player.x < canvas.width - player.width) {
            player.x += player.dx;
        }
    }
}

// 弾
const bullets = [];
const bulletSpeed = 7;
const bulletRadius = 4;
const bulletColor = '#FFEB3B';
let shootCooldown = 0;
const shootInterval = 15;

function shoot() {
    if (!gameRunning || !playerShooting || shootCooldown > 0 || gameOver) return;

    const baseBullet = {
        y: player.y,
        radius: bulletRadius,
        color: bulletColor,
        speed: bulletSpeed
    };

    if (player.powerLevel === 0) {
        bullets.push({ ...baseBullet, x: player.x + player.width / 2 });
    } else if (player.powerLevel === 1) {
        bullets.push({ ...baseBullet, x: player.x + player.width / 2 - 5, angle: -0.05 });
        bullets.push({ ...baseBullet, x: player.x + player.width / 2 + 5, angle: 0.05 });
    } else if (player.powerLevel >= 2) {
        bullets.push({ ...baseBullet, x: player.x + player.width / 2 });
        bullets.push({ ...baseBullet, x: player.x + player.width / 2 - 8, angle: -0.15 });
        bullets.push({ ...baseBullet, x: player.x + player.width / 2 + 8, angle: 0.15 });
    }
    shootCooldown = shootInterval;

    if (audioInitialized && playerShootSound) {
        try {
            playerShootSound.triggerAttackRelease("C6", "32n", Tone.now());
        } catch (e) {
            // エラー時のみログ出力
        }
    }
}

function updateBullets() {
    if (!gameRunning) return;
    if (shootCooldown > 0) {
        shootCooldown--;
    }
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        if (bullet.angle) {
            bullet.x += Math.sin(bullet.angle) * bullet.speed * 0.3;
        }
        bullet.y -= bullet.speed;
        if (bullet.y < -bullet.radius) {
            bullets.splice(i, 1);
        }
    }
}

function drawBullets() {
    if (!gameRunning) return;
    bullets.forEach(bullet => {
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
        ctx.fillStyle = bullet.color;
        ctx.fill();
    });
}

// パワーアップアイテム
const powerUpItems = [];
const powerUpItemRadius = 8;
const powerUpItemColor = '#00BCD4';
const powerUpItemSpeed = 2;
const powerUpDropChance = 0.2;

function spawnPowerUpItem(x, y) {
    powerUpItems.push({
        x: x, y: y, radius: powerUpItemRadius,
        color: powerUpItemColor, speed: powerUpItemSpeed
    });
}

function updatePowerUpItems() {
    if (!gameRunning) return;
    for (let i = powerUpItems.length - 1; i >= 0; i--) {
        const item = powerUpItems[i];
        item.y += item.speed;
        if (item.y > canvas.height + item.radius) {
            powerUpItems.splice(i, 1);
        }
    }
}

function drawPowerUpItems() {
    if (!gameRunning) return;
    powerUpItems.forEach(item => {
        ctx.beginPath();
        ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
        ctx.fillStyle = item.color;
        ctx.fill();
        ctx.fillStyle = "white";
        ctx.font = "bold 10px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("P", item.x, item.y);
    });
}

// 敵
const enemies = [];
const enemyWidth = 30;
const enemyHeight = 30;
const enemySpeedBase = 1.5;
const enemySpawnInterval = 80;
let enemySpawnTimer = 0;

function spawnEnemy() {
    const x = Math.random() * (canvas.width - enemyWidth);
    const y = -enemyHeight;
    
    const enemyTypeRoll = Math.random();
    let newEnemyType;

    if (enemyTypeRoll < 0.35) { newEnemyType = 'normal';}
    else if (enemyTypeRoll < 0.60) { newEnemyType = 'shooter';}
    else if (enemyTypeRoll < 0.80) { newEnemyType = 'waver';}
    else { newEnemyType = 'dasher'; }

    let enemyData = { x: x, y: y, width: enemyWidth, height: enemyHeight, type: newEnemyType };

    if (newEnemyType === 'normal') {
        enemyData.color = '#F44336'; enemyData.health = 1;
        enemyData.speed = enemySpeedBase + Math.random() * 1;
    } else if (newEnemyType === 'shooter') {
        enemyData.color = '#9C27B0'; enemyData.health = 2;
        enemyData.speed = enemySpeedBase + Math.random() * 0.8;
        enemyData.shootCooldown = Math.random() * 100 + 50;
    } else if (newEnemyType === 'waver') {
        enemyData.color = '#2196F3'; enemyData.health = 1;
        enemyData.speed = enemySpeedBase * 0.9 + Math.random() * 0.4;
        enemyData.initialX = x;
        enemyData.waveAmplitude = 30 + Math.random() * 30;
        enemyData.waveFrequency = 0.02 + Math.random() * 0.015;
    } else if (newEnemyType === 'dasher') {
        enemyData.color = '#FF9800'; enemyData.originalColor = enemyData.color;
        enemyData.health = 1;
        enemyData.speed = enemySpeedBase * 0.6;
        enemyData.dashSpeed = enemySpeedBase * 4.5;
        enemyData.dashState = 'charging';
        enemyData.dashChargeTime = 80 + Math.random() * 50;
        enemyData.flashTimer = 0;
    }
    enemies.push(enemyData);
}

function updateEnemies() {
    if (!gameRunning) return;
    enemySpawnTimer++;
    if (enemySpawnTimer >= enemySpawnInterval && !gameOver) {
        spawnEnemy();
        enemySpawnTimer = 0;
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];

        if (enemy.type === 'waver') {
            enemy.y += enemy.speed;
            enemy.x = enemy.initialX + Math.sin(enemy.y * enemy.waveFrequency) * enemy.waveAmplitude;
            enemy.x = Math.max(0, Math.min(enemy.x, canvas.width - enemy.width));
        } else if (enemy.type === 'dasher') {
            if (enemy.dashState === 'charging') {
                enemy.y += enemy.speed;
                enemy.dashChargeTime--;
                if (enemy.dashChargeTime <= 0) {
                    enemy.dashState = 'dashing';
                    enemy.flashTimer = 15; 
                }
            } else if (enemy.dashState === 'dashing') {
                if (enemy.flashTimer > 0) {
                    enemy.color = (Math.floor(enemy.flashTimer / 3) % 2 === 0) ? '#FFFFFF' : enemy.originalColor;
                    enemy.flashTimer--;
                    if (enemy.flashTimer === 0) enemy.color = enemy.originalColor;
                }
                enemy.y += enemy.dashSpeed;
            }
        } else { 
            enemy.y += enemy.speed;
            if (enemy.type === 'shooter') {
                enemy.shootCooldown--;
                if (enemy.shootCooldown <= 0 && !gameOver) {
                    spawnEnemyBullet(enemy);
                    enemy.shootCooldown = 100 + Math.random() * 50;
                }
            }
        }

        if (enemy.y > canvas.height + enemy.height) {
            enemies.splice(i, 1);
            if (!gameOver) {
                enemiesMissed++;
                if (enemiesMissed >= maxEnemiesMissed) {
                    triggerGameOver(`敵を${maxEnemiesMissed}機逃しました！`);
                }
            }
        }
    }
}

function drawEnemies() {
    if (!gameRunning) return;
    enemies.forEach(enemy => {
        ctx.fillStyle = enemy.color;
        ctx.beginPath();
        ctx.ellipse(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemy.width / 2, enemy.height / 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF'; 
        ctx.beginPath();
        ctx.ellipse(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2 - 3, enemy.width / 4, enemy.height / 6, 0, 0, Math.PI * 2);
        ctx.fill();

        if (enemy.type === 'dasher' && enemy.dashState === 'charging') {
            const pulseFactor = Math.abs(Math.sin(Date.now() * 0.005));
            ctx.strokeStyle = `rgba(255, 152, 0, ${0.3 + pulseFactor * 0.4})`;
            ctx.lineWidth = 1 + pulseFactor * 2;
            ctx.beginPath();
            ctx.ellipse(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, 
                        enemy.width / 2 + ctx.lineWidth, enemy.height / 3 + ctx.lineWidth, 
                        0, 0, Math.PI * 2);
            ctx.stroke();
        }
    });
}

// 敵の弾
const enemyBullets = [];
const enemyBulletSpeed = 4;
const enemyBulletRadius = 5;
const enemyBulletColor = '#FF9800';

function spawnEnemyBullet(enemy) {
    enemyBullets.push({
        x: enemy.x + enemy.width / 2,
        y: enemy.y + enemy.height,
        radius: enemyBulletRadius,
        color: enemyBulletColor,
        speed: enemyBulletSpeed
    });
}

function updateEnemyBullets() {
    if (!gameRunning) return;
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const bullet = enemyBullets[i];
        bullet.y += bullet.speed;
        if (bullet.y > canvas.height + bullet.radius) {
            enemyBullets.splice(i, 1);
        }
    }
}

function drawEnemyBullets() {
    if (!gameRunning) return;
    enemyBullets.forEach(bullet => {
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
        ctx.fillStyle = bullet.color;
        ctx.fill();
    });
}

// 当たり判定
function checkCollisions() {
    if (!gameRunning) return;
    // プレイヤーの弾 vs 敵
    for (let i = bullets.length - 1; i >= 0; i--) {
        if (!bullets[i]) continue;
        for (let j = enemies.length - 1; j >= 0; j--) {
            if (!enemies[j]) continue;
            const bullet = bullets[i];
            const enemy = enemies[j];

            if (bullet.x + bullet.radius > enemy.x && bullet.x - bullet.radius < enemy.x + enemy.width &&
                bullet.y + bullet.radius > enemy.y && bullet.y - bullet.radius < enemy.y + enemy.height) {
                
                bullets.splice(i, 1);
                enemy.health--;

                if (enemy.health <= 0) {
                    const killedEnemy = enemies.splice(j, 1)[0];
                    score += (killedEnemy.type === 'dasher' ? 15 : (killedEnemy.type === 'shooter' ? 12 : 10));
                    createExplosion(killedEnemy.x + killedEnemy.width / 2, killedEnemy.y + killedEnemy.height / 2);
                    if (audioInitialized && enemyExplosionSound) {
                        try {
                            enemyExplosionSound.triggerAttackRelease("8n", Tone.now());
                        } catch (e) {
                            // エラー時のみログ出力
                        }
                    }
                    if (killedEnemy.type === 'shooter' && Math.random() < powerUpDropChance) {
                        spawnPowerUpItem(killedEnemy.x + killedEnemy.width / 2, killedEnemy.y + killedEnemy.height / 2);
                    }
                }
                break; 
            }
        }
    }

    // パワーアップアイテム vs プレイヤー
    for (let i = powerUpItems.length - 1; i >= 0; i--) {
        const item = powerUpItems[i];
        const dist = Math.hypot(player.x + player.width / 2 - item.x, player.y + player.height / 2 - item.y);
        if (dist < player.width / 2 + item.radius) {
            powerUpItems.splice(i, 1);
            if (player.powerLevel < player.maxPowerLevel) {
                player.powerLevel++;
            }
            if (audioInitialized && powerUpSound) {
                try {
                    powerUpSound.triggerAttackRelease("C5", "16n", Tone.now());
                    powerUpSound.triggerAttackRelease("E5", "16n", Tone.now() + 0.1);
                    powerUpSound.triggerAttackRelease("G5", "16n", Tone.now() + 0.2);
                } catch (e) {
                    // エラー時のみログ出力
                }
            }
        }
    }

    if (player.invincible) return;

    // 敵 vs プレイヤー
    for (let i = enemies.length - 1; i >= 0; i--) {
         if (!enemies[i]) continue;
        const enemy = enemies[i];
        if (player.x < enemy.x + enemy.width &&
            player.x + player.width > enemy.x &&
            player.y < enemy.y + enemy.height &&
            player.y + player.height > enemy.y) {
            
            playerHit();
            createExplosion(player.x + player.width/2, player.y + player.height/2);
            if (enemy.type === 'dasher' || enemy.type === 'waver') {
                 createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);
                 enemies.splice(i, 1);
            }
            break; 
        }
    }

    // 敵の弾 vs プレイヤー
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        if (!enemyBullets[i]) continue;
        const bullet = enemyBullets[i];
        const dist = Math.hypot(player.x + player.width / 2 - bullet.x, player.y + player.height / 2 - bullet.y);
        if (dist < player.width / 2.5 + bullet.radius) {
            enemyBullets.splice(i, 1);
            playerHit();
            createExplosion(player.x + player.width/2, player.y + player.height/2);
            break;
        }
    }
}

function playerHit() {
    if (player.invincible) return;

    player.lives--;
    player.invincible = true;
    player.invincibleTimer = player.invincibleDuration;
    
    if (player.powerLevel > 0) {
        player.powerLevel--;
    }
    
    if (audioInitialized && playerHitSound) {
        try {
            playerHitSound.triggerAttackRelease("A2", "8n", Tone.now());
        } catch (e) {
            // エラー時のみログ出力
        }
    }

    if (player.lives <= 0) {
        triggerGameOver("ゲームオーバー！");
    }
}

function updateScore() {
     scoreBoard.innerHTML = `スコア: ${score} | ライフ: ${player.lives} | パワー: ${player.powerLevel === player.maxPowerLevel ? 'MAX' : player.powerLevel}<br>逃した敵: ${enemiesMissed}/${maxEnemiesMissed} | 射撃: ${playerShooting ? 'ON' : 'OFF'}`;
}

// 爆発エフェクト
const explosions = [];
function createExplosion(x, y) {
    const particleCount = 20 + Math.floor(Math.random() * 10);
    const angleStep = Math.PI * 2 / particleCount;
    for (let i = 0; i < particleCount; i++) {
        explosions.push({
            x: x, y: y,
            radius: Math.random() * 3.5 + 1.5,
            color: `hsl(${Math.random() * 60 + 0}, 100%, ${60 + Math.random() * 30}%)`,
            speed: Math.random() * 3.5 + 1.5,
            angle: angleStep * i + (Math.random() - 0.5) * 0.6,
            life: 25 + Math.random() * 15,
            decay: 0.96 + Math.random() * 0.02
        });
    }
}

function updateExplosions() {
    if (!gameRunning) return;
    for (let i = explosions.length - 1; i >= 0; i--) {
        const p = explosions[i];
        p.x += Math.cos(p.angle) * p.speed;
        p.y += Math.sin(p.angle) * p.speed;
        p.speed *= 0.97; 
        p.life--;
        p.radius *= p.decay; 
        if (p.life <= 0 || p.radius < 0.5) {
            explosions.splice(i, 1);
        }
    }
}

function drawExplosions() {
    if (!gameRunning) return;
    explosions.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life / 30);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    });
}

// ゲームオーバー処理
function triggerGameOver(message) {
    gameOver = true;
    gameRunning = false; 
    if(animationFrameId) cancelAnimationFrame(animationFrameId); 
    
    let finalMessage = `${message}<br>最終スコア: ${score}`;
    messageText.innerHTML = finalMessage;
    messageOverlay.classList.remove('hidden');
    canvas.style.cursor = 'default';
}

// ゲームリセット
function resetGame() {
    score = 0;
    player.lives = 3;
    player.x = canvas.width / 2 - player.width / 2;
    player.y = canvas.height - 50;
    player.invincible = false;
    player.invincibleTimer = 0;
    player.powerLevel = 0;
    enemiesMissed = 0;
    bullets.length = 0;
    enemies.length = 0;
    enemyBullets.length = 0;
    powerUpItems.length = 0;
    explosions.length = 0;
    enemySpawnTimer = 0;
    shootCooldown = 0;
    playerShooting = true;
    gameOver = false;
    
    messageOverlay.classList.add('hidden');
    canvas.style.cursor = 'none';
    
    initStars(); 
    updateScore(); 

    if (!gameRunning) { 
        gameRunning = true;
        gameLoop();
    }
}

// ゲームループ
function gameLoop() {
    if (!gameRunning) { 
         if(animationFrameId) cancelAnimationFrame(animationFrameId);
        return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawStars();
    movePlayer();
    drawPlayer();
    shoot();
    updateBullets();
    drawBullets();
    updatePowerUpItems();
    drawPowerUpItems();
    updateEnemies();
    drawEnemies();
    updateEnemyBullets();
    drawEnemyBullets();
    checkCollisions();
    updateExplosions();
    drawExplosions();
    updateScore();

    animationFrameId = requestAnimationFrame(gameLoop);
}

startButton.addEventListener('click', async () => {
    await initializeAudio(); 
    startOverlay.classList.add('hidden');
    resetGame(); 
});

overlayRestartButton.addEventListener('click', async () => {
    await initializeAudio(); 
    resetGame();
});

canvas.addEventListener('mouseenter', () => {
    mouseOverCanvas = true;
    if (!gameOver && gameRunning) canvas.style.cursor = 'none';
});

canvas.addEventListener('mouseleave', () => {
    mouseOverCanvas = false;
    canvas.style.cursor = 'default';
});

canvas.addEventListener('mousemove', (e) => {
    if (mouseOverCanvas && !gameOver && gameRunning) {
        const rect = canvas.getBoundingClientRect();
        let newX = e.clientX - rect.left - player.width / 2;
        player.x = Math.max(0, Math.min(newX, canvas.width - player.width));
    }
});

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!gameOver && gameRunning) {
        mouseOverCanvas = true; 
        if (!gameOver) canvas.style.cursor = 'none';
        const rect = canvas.getBoundingClientRect();
        if (e.touches.length > 0) {
            let newX = e.touches[0].clientX - rect.left - player.width / 2;
            player.x = Math.max(0, Math.min(newX, canvas.width - player.width));
        }
    }
}, { passive: false });

window.addEventListener('keydown', (e) => {
    if (!gameRunning && !gameOver && e.key !== 'Enter') return; 
    if (gameOver && e.key !== 'Enter') return;

    if (e.key === 'ArrowLeft') {
        leftKeyPressed = true;
    } else if (e.key === 'ArrowRight') {
        rightKeyPressed = true;
    } else if (e.key === ' ') { 
        e.preventDefault(); 
        if (gameRunning && !gameOver) playerShooting = !playerShooting;
    } else if (e.key === 'Enter' && gameOver) { 
         overlayRestartButton.click(); 
    }
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft') {
        leftKeyPressed = false;
    } else if (e.key === 'ArrowRight') {
        rightKeyPressed = false;
    }
});

window.addEventListener('resize', () => {
    canvasWidth = Math.min(window.innerWidth * 0.9, 400);
    canvasHeight = Math.min(window.innerHeight * 0.65, 550);
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    player.x = Math.max(0, Math.min(player.x, canvas.width - player.width));
    player.y = canvas.height - 50; 

    initStars(); 
    
    if (!gameRunning) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawStars();
        if (gameOver) { 
             drawPlayer(); 
        }
    }
});

function initialDraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    initStars();
    drawStars();
    updateScore(); 
}
initialDraw(); 