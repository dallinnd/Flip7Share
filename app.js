import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, increment, remove, off } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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
if (nameInput) {
    nameInput.value = myName;
    nameInput.oninput = () => {
        myName = nameInput.value;
        localStorage.setItem('f7_name', myName);
    };
}

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
    if(count && !isNaN(count)) window.hostGame(parseInt(count));
};

window.hostGame = async (targetCount) => {
    gameCode = Math.floor(100000 + Math.random() * 900000);
    localStorage.setItem('f7_code', gameCode);
    await set(ref(db, 'games/' + gameCode), {
        host: myName,
        targetCount: targetCount,
        status: "waiting",
        players: {}
    });
    window.joinGame(gameCode);
}

window.openJoinPopup = () => {
    if(!myName) return alert("Please enter your name first!");
    let code = prompt("Enter 6-digit game code:");
    if(code) {
        gameCode = code;
        localStorage.setItem('f7_code', code);
        window.joinGame(code);
    }
};

window.resumeGame = () => window.joinGame(gameCode);

window.joinGame = async (code) => {
    gameCode = code;
    await update(ref(db, `games/${code}/players/${myName}`), {
        name: myName,
        grandTotal: 0,
        lastScore: 0,
        submitted: false
    });
    onValue(ref(db, `games/${code}`), syncAppStatus);
}

window.leaveGame = async () => {
    if (gameCode && myName) {
        off(ref(db, `games/${gameCode}`));
        await remove(ref(db, `games/${gameCode}/players/${myName}`));
        localStorage.removeItem('f7_code');
        gameCode = null;
        location.reload();
    }
};

// --- 4. Calculator Logic ---

const grid = document.getElementById('cardGrid');
if (grid && grid.children.length === 0) {
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
}

window.toggleMod = (id, val) => {
    if(id === 'm2') {
        mult = (mult === 2) ? 1 : 2;
    } else {
        // Toggle specific modifier independently
        if (activeMods.includes(val)) {
            activeMods = activeMods.filter(v => v !== val);
        } else {
            activeMods.push(val);
        }
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
    
    // Formula: (Numeric Cards * Multiplier) + Sum of all independent modifiers
    let total = busted ? 0 : (sum * mult) + modSum;

    const display = document.getElementById('calc-display');
    if (display) {
        display.innerText = busted ? "BUST!" : total;
        display.style.color = busted ? "#ff4444" : "white";
    }

    // Highlight Numeric Buttons
    for(let i=1; i<=12; i++) {
        const b = document.getElementById('c-'+i);
        if(b) b.style.background = usedCards.includes(i) ? "var(--teal)" : "rgba(255,255,255,0.2)";
    }

    // Highlight Multiplier Button
    const m2Btn = document.getElementById('btn-m2');
    if (m2Btn) m2Btn.style.background = (mult === 2) ? "var(--teal)" : "rgba(255,255,255,0.1)";

    // Highlight Addition Buttons independently
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

    if (data.status === "waiting") {
        window.showScreen('lobby-screen');
        document.getElementById('roomDisplayLobby').innerText = "Game: " + gameCode;
        document.getElementById('lobby-status').innerText = `Joined: ${players.length} / ${target}`;
        document.getElementById('player-list').innerHTML = players.map(p => `<div class="p-tag">${p.name}</div>`).join("");
        
        if (players.length >= target && data.host === myName) {
            update(ref(db, 'games/' + gameCode), { status: "active" });
        }
        return;
    }

    window.showScreen('game-screen');
    document.getElementById('roomCodeDisplay').innerText = "Game: " + gameCode;
    
    players.sort((a,b) => b.grandTotal - a.grandTotal);

    let lb = document.getElementById('leaderboard');
    if (lb) {
        lb.innerHTML = "";
        players.forEach(p => {
            lb.innerHTML += `
                <div class="p-row">
                    <span>${p.name} ${p.submitted ? '✅' : '⏳'}</span>
                    <span>${p.grandTotal} <small>(+${p.lastScore || 0})</small></span>
                </div>`;
            if(p.grandTotal >= 200) alert(p.name + " WINS!");
        });
    }

    const allDone = players.length >= target && players.every(p => p.submitted === true);
    const nextBtn = document.getElementById('nextRoundBtn');
    if (nextBtn) nextBtn.style.display = allDone ? 'block' : 'none';

    const me = data.players[myName];
    if (me && me.submitted === false && document.getElementById('waiting-view').style.display === 'block') {
        document.getElementById('calc-view').style.display = 'block';
        document.getElementById('waiting-view').style.display = 'none';
        busted = false; updateUI(); 
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

    usedCards = []; activeMods = []; mult = 1; busted = false; updateUI();
    document.getElementById('calc-view').style.display = 'none';
    document.getElementById('waiting-view').style.display = 'block';
};

window.readyForNextRound = () => {
    update(ref(db, `games/${gameCode}/players/${myName}`), { submitted: false });
};
