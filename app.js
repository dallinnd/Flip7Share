import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// 1. Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyConuxhGCtGvJaa6TZ1bkUvlOhhTdyTgZE",
    authDomain: "flip7share.firebaseapp.com",
    databaseURL: "https://flip7share-default-rtdb.firebaseio.com",
    projectId: "flip7share",
    storageBucket: "flip7share.firebasestorage.app",
    messagingSenderId: "467127126520",
    appId: "1:467127126520:web:0646f4fc19352eaa11ee0d"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 2. Global State
let gameCode = localStorage.getItem('f7_code');
let myName = localStorage.getItem('f7_name') || "";
let usedCards = [], activeMods = [], mult = 1, busted = false;

// Initialize Name Field
const nameInput = document.getElementById('userNameInput');
nameInput.value = myName;
nameInput.oninput = () => {
    myName = nameInput.value;
    localStorage.setItem('f7_name', myName);
};

// Check for existing game to resume
if(gameCode && myName) document.getElementById('resume-btn').style.display = 'block';

// Screen Navigation Helper
window.showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'block';
};

// --- 3. Lobby & Connection Logic ---

window.askPlayerCount = () => {
    if(!myName) return alert("Please enter your name first!");
    const count = prompt("Total players (including you):", "4");
    if(count && !isNaN(count)) hostGame(parseInt(count));
};

async function hostGame(targetCount) {
    gameCode = Math.floor(100000 + Math.random() * 900000);
    localStorage.setItem('f7_code', gameCode);
    await set(ref(db, 'games/' + gameCode), {
        host: myName,
        targetCount: targetCount,
        status: "waiting",
        players: {}
    });
    joinGame(gameCode);
}

window.openJoinPopup = () => {
    if(!myName) return alert("Please enter your name first!");
    let code = prompt("Enter 6-digit game code:");
    if(code) {
        gameCode = code;
        localStorage.setItem('f7_code', code);
        joinGame(code);
    }
};

window.resumeGame = () => joinGame(gameCode);

async function joinGame(code) {
    // Register self in the game room
    await update(ref(db, `games/${code}/players/${myName}`), {
        name: myName,
        grandTotal: 0,
        lastScore: 0,
        submitted: false
    });
    // Listen for all changes in this game room
    onValue(ref(db, `games/${code}`), syncAppStatus);
}

// --- 4. Calculator Logic ---

// Generate Card Buttons 1-12
const grid = document.getElementById('cardGrid');
for(let i=1; i<=12; i++){
    let btn = document.createElement('button');
    btn.id = 'c-'+i; btn.innerText = i;
    btn.onclick = () => {
        if(usedCards.includes(i)) usedCards = usedCards.filter(v => v !== i);
        else usedCards.push(i);
        updateUI();
    };
    grid.appendChild(btn);
}

window.toggleMod = (id, val) => {
    if(id === 'm2') {
        mult = (mult === 2) ? 1 : 2;
    } else {
        if (activeMods.includes(val)) activeMods = activeMods.filter(v => v !== val);
        else activeMods.push(val);
    }
    updateUI();
};

window.triggerBust = () => {
    busted = true; usedCards = []; activeMods = []; mult = 1;
    updateUI();
};

function updateUI() {
    let sum = usedCards.reduce((a, b) => a + b, 0);
    let modSum = activeMods.reduce((a, b) => a + b, 0);
    let total = busted ? 0 : (sum * mult) + modSum;

    const display = document.getElementById('calc-display');
    display.innerText = busted ? "BUST!" : total;
    display.style.color = busted ? "#ff4444" : "white";

    // Highlight Buttons
    for(let i=1; i<=12; i++) {
        const b = document.getElementById('c-'+i);
        if(b) b.style.background = usedCards.includes(i) ? "var(--teal)" : "rgba(255,255,255,0.2)";
    }
    document.getElementById('btn-m2').style.background = (mult === 2) ? "var(--teal)" : "rgba(255,255,255,0.1)";
    [2, 4, 6, 8, 10].forEach(v => {
        const b = document.getElementById('btn-p' + v);
        if(b) b.style.background = activeMods.includes(v) ? "var(--teal)" : "rgba(255,255,255,0.1)";
    });
}

// --- 5. Real-time Game Sync ---

function syncAppStatus(snap) {
    const data = snap.val();
    if(!data) return;

    const players = Object.values(data.players || {});
    const target = data.targetCount;

    // A. Handle Waiting Lobby
    if (data.status === "waiting") {
        showScreen('lobby-screen');
        document.getElementById('roomDisplayLobby').innerText = "Game: " + gameCode;
        document.getElementById('lobby-status').innerText = `Joined: ${players.length} / ${target}`;
        document.getElementById('player-list').innerHTML = players.map(p => `<div class="p-tag">${p.name}</div>`).join("");
        
        // Auto-start game when count is met
        if (players.length >= target && data.host === myName) {
            update(ref(db, 'games/' + gameCode), { status: "active" });
        }
        return;
    }

    // B. Handle Active Game
    showScreen('game-screen');
    document.getElementById('roomCodeDisplay').innerText = "Game: " + gameCode;
    
    // Sort players by total score
    players.sort((a,b) => b.grandTotal - a.grandTotal);

    // Update Leaderboard
    let lb = document.getElementById('leaderboard');
    lb.innerHTML = "";
    players.forEach(p => {
        lb.innerHTML += `
            <div class="p-row">
                <span>${p.name} ${p.submitted ? '✅' : '⏳'}</span>
                <span>${p.grandTotal} <small>(+${p.lastScore || 0})</small></span>
            </div>`;
        if(p.grandTotal >= 200) alert(p.name + " WINS!");
    });

    // Toggle Next Round Button (Only if everyone is submitted)
    const allDone = players.length >= target && players.every(p => p.submitted === true);
    document.getElementById('nextRoundBtn').style.display = allDone ? 'block' : 'none';

    // Auto-Return to Calculator if a new round has started
    const me = data.players[myName];
    if (me && me.submitted === false && document.getElementById('waiting-view').style.display === 'block') {
        document.getElementById('calc-view').style.display = 'block';
        document.getElementById('waiting-view').style.display = 'none';
        busted = false; updateUI(); // Reset UI for fresh round
    }
}

// --- 6. Round Actions ---

window.submitRound = async () => {
    let sum = usedCards.reduce((a, b) => a + b, 0);
    let modSum = activeMods.reduce((a, b) => a + b, 0);
    let total = busted ? 0 : (sum * mult) + modSum;

    await update(ref(db, `games/${gameCode}/players/${myName}`), { 
        grandTotal: increment(total), 
        lastScore: total, 
        submitted: true 
    });

    // Reset local calc and switch to wait view
    usedCards = []; activeMods = []; mult = 1; busted = false; updateUI();
    document.getElementById('calc-view').style.display = 'none';
    document.getElementById('waiting-view').style.display = 'block';
};

window.readyForNextRound = () => {
    // Reset submission status to trigger the next round start for everyone
    update(ref(db, `games/${gameCode}/players/${myName}`), { submitted: false });
};
