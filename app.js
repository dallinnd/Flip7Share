import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- FIREBASE CONFIGURATION ---
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

// --- APP STATE ---
let gameCode = localStorage.getItem('f7_code'), myName = localStorage.getItem('f7_name') || "";
let usedCards = [], mult = 1, bonus = 0, busted = false;

// --- INITIALIZATION ---
const nameInput = document.getElementById('userNameInput');
if (nameInput) {
    nameInput.value = myName;
    nameInput.oninput = () => { myName = nameInput.value; localStorage.setItem('f7_name', myName); };
}
if(gameCode && myName) document.getElementById('resume-btn').style.display = 'block';

window.showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'block';
};

// --- HOSTING & JOINING ---
window.askPlayerCount = () => {
    if(!myName) return alert("Enter your name first!");
    const count = prompt("Total players (including you):", "4");
    if(count) hostGame(parseInt(count));
};

async function hostGame(target) {
    gameCode = Math.floor(100000 + Math.random() * 900000);
    localStorage.setItem('f7_code', gameCode);
    // Initialize history with a 0 at index 0 (unused) and index 1 (round 1)
    await set(ref(db, `games/${gameCode}`), { 
        host: myName, 
        targetCount: target, 
        status: "waiting", 
        roundNum: 1 
    });
    joinGame(gameCode);
}

window.openJoinPopup = () => {
    if(!myName) return alert("Enter your name first!");
    let c = prompt("6-digit code:");
    if(c) { gameCode = c; localStorage.setItem('f7_code', c); joinGame(c); }
};

window.resumeGame = () => joinGame(gameCode);

async function joinGame(code) {
    const playerRef = ref(db, `games/${code}/players/${myName}`);
    const snap = await get(playerRef);
    if (!snap.exists()) {
        // history[0] is a placeholder so history[1] matches Round 1
        await update(playerRef, { name: myName, history: [0, 0], submitted: false });
    }
    onValue(ref(db, `games/${code}`), syncApp);
}

// --- CALCULATOR LOGIC ---
window.toggleMod = (id, val) => {
    if(id === 'm2') mult = (mult === 2) ? 1 : 2;
    else bonus = (bonus === val) ? 0 : val;
    updateUI();
};

window.triggerBust = () => { 
    busted = true; usedCards = []; mult = 1; bonus = 0; 
    const display = document.getElementById('calc-display');
    display.classList.add('shake');
    setTimeout(() => display.classList.remove('shake'), 400);
    updateUI(); 
};

window.onclickCard = (i) => {
    if(usedCards.includes(i)) usedCards = usedCards.filter(v => v !== i);
    else usedCards.push(i);
    updateUI();
};

// Generate Card Grid
const grid = document.getElementById('cardGrid');
if (grid && grid.children.length === 0) {
    for(let i=1; i<=12; i++){
        let btn = document.createElement('button');
        btn.id = 'c-'+i; btn.innerText = i;
        btn.onclick = () => window.onclickCard(i);
        grid.appendChild(btn);
    }
}

function updateUI() {
    let sum = usedCards.reduce((a, b) => a + b, 0);
    let total = busted ? 0 : (sum * mult) + bonus;
    const display = document.getElementById('calc-display');
    display.innerText = busted ? "BUST!" : total;
    display.style.color = busted ? "#ff4444" : "white";

    for(let i=1; i<=12; i++) {
        const b = document.getElementById('c-'+i);
        if(b) b.style.background = usedCards.includes(i) ? "var(--teal)" : "rgba(255,255,255,0.2)";
    }
    document.getElementById('btn-m2').style.background = (mult === 2) ? "var(--teal)" : "rgba(255,255,255,0.1)";
    [2, 4, 6, 8, 10].forEach(v => {
        const b = document.getElementById('btn-p' + v);
        if(b) b.style.background = (bonus === v) ? "var(--teal)" : "rgba(255,255,255,0.1)";
    });
}

// --- ROUND & HISTORY MANAGEMENT ---
window.submitRound = async () => {
    let sum = usedCards.reduce((a, b) => a + b, 0);
    let score = busted ? 0 : (sum * mult) + bonus;
    
    const snap = await get(ref(db, `games/${gameCode}`));
    const data = snap.val();
    let myHistory = data.players[myName].history || [0];
    
    // Ensure array is large enough for current round
    while(myHistory.length <= data.roundNum) myHistory.push(0);
    myHistory[data.roundNum] = score;

    await update(ref(db, `games/${gameCode}/players/${myName}`), { 
        history: myHistory, 
        submitted: true 
    });
    
    usedCards = []; mult = 1; bonus = 0; busted = false; updateUI();
};

window.readyForNextRound = async () => {
    const snap = await get(ref(db, `games/${gameCode}`));
    const data = snap.val();
    const nextRound = data.roundNum + 1;
    const updates = { [`games/${gameCode}/roundNum`]: nextRound };
    
    for (let p in data.players) {
        updates[`games/${gameCode}/players/${p}/submitted`] = false;
        let h = data.players[p].history || [0];
        // Pad history so index nextRound exists
        while(h.length <= nextRound) h.push(0);
        updates[`games/${gameCode}/players/${p}/history`] = h;
    }
    await update(ref(db), updates);
};

window.revertToRound = async (rIdx) => {
    if (confirm(`Time Machine: Revert game back to Round ${rIdx}?`)) {
        const snap = await get(ref(db, `games/${gameCode}`));
        const data = snap.val();
        const updates = { [`games/${gameCode}/roundNum`]: rIdx };
        
        for (let p in data.players) {
            // Keep history only up to the selected round
            updates[`games/${gameCode}/players/${p}/history`] = data.players[p].history.slice(0, rIdx + 1);
            updates[`games/${gameCode}/players/${p}/submitted`] = false;
        }
        await update(ref(db), updates);
        showScreen('game-screen');
    }
};

// --- SYNC & UI RENDERING ---
function syncApp(snap) {
    const data = snap.val(); 
    if(!data) { localStorage.removeItem('f7_code'); location.reload(); return; }
    
    const players = Object.values(data.players || {});
    const me = data.players[myName];
    if (!me) return;

    // 1. Lobby Screen Logic
    if (data.status === "waiting") {
        showScreen('lobby-screen');
        document.getElementById('roomDisplayLobby').innerText = "Game: " + gameCode;
        document.getElementById('host-controls-lobby').innerHTML = (data.host === myName) ? `<button class="host-danger-btn" onclick="endGame()">CANCEL GAME</button>` : "";
        document.getElementById('lobby-status').innerText = `Joined: ${players.length} / ${data.targetCount}`;
        document.getElementById('player-list').innerHTML = players.map(p => `
            <div class="p-tag">
                ${p.name} 
                ${(data.host === myName && p.name !== myName) ? `<span class="remove-player-btn" onclick="removePlayer('${p.name}')">×</span>` : ""}
            </div>
        `).join("");
        
        if(players.length >= data.targetCount && data.host === myName) {
            update(ref(db, `games/${gameCode}`), {status: "active"});
        }
        return;
    }

    // 2. Active Game UI
    showScreen('game-screen');
    document.getElementById('roomCodeDisplay').innerText = `Game: ${gameCode} | Round ${data.roundNum}`;
    document.getElementById('host-end-game-container').innerHTML = (data.host === myName) ? `<button class="host-danger-btn" onclick="endGame()">END GAME FOR ALL</button>` : "";

    // 3. Leaderboard Calculation
    let lb = document.getElementById('leaderboard'); 
    lb.innerHTML = "";
    players.map(p => {
        const total = (p.history || []).reduce((a,b) => a + b, 0);
        return { ...p, total };
    }).sort((a,b) => b.total - a.total).forEach(p => {
        const currentRoundScore = (p.history && p.history[data.roundNum]) ? p.history[data.roundNum] : 0;
        lb.innerHTML += `
            <div class="p-row ${p.name === myName ? 'is-me' : ''}">
                <span>${p.name} ${p.submitted ? '✅' : '⏳'}</span>
                <span>${p.total} <small>(+${currentRoundScore})</small></span>
            </div>`;
        if(p.total >= 200) alert(p.name + " WINS THE GAME!");
    });

    // 4. History Log Rendering
    let hLog = document.getElementById('history-log-container'); 
    hLog.innerHTML = "";
    for (let r = data.roundNum; r >= 1; r--) {
        let rHTML = `
            <div class="history-block" 
                 ${data.host === myName ? `onclick="revertToRound(${r})"` : ''} 
                 style="cursor: ${data.host === myName ? 'pointer' : 'default'}">
                <span class="round-label">Round ${r} ${data.host === myName ? ' ↩️' : ''}</span>
        `;
        players.forEach(p => { 
            const score = (p.history && p.history[r] !== undefined) ? p.history[r] : 0;
            rHTML += `
                <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin: 2px 0;">
                    <span>${p.name}</span><span>${score}</span>
                </div>`; 
        });
        hLog.innerHTML += rHTML + `</div>`;
    }

    // 5. Screen Auto-Toggle
    if (me.submitted) {
        document.getElementById('calc-view').style.display = 'none';
        document.getElementById('waiting-view').style.display = 'block';
    } else {
        document.getElementById('calc-view').style.display = 'block';
        document.getElementById('waiting-view').style.display = 'none';
    }

    // Next Round Button Visibility
    const everyoneDone = players.every(p => p.submitted);
    document.getElementById('nextRoundBtn').style.display = (data.host === myName && everyoneDone) ? 'block' : 'none';
}

// --- ADMIN CONTROLS ---
window.leaveGame = () => { if(confirm("Leave game?")) { localStorage.removeItem('f7_code'); location.reload(); }};
window.endGame = async () => { if(confirm("Delete game for everyone?")) { await set(ref(db, `games/${gameCode}`), null); location.reload(); }};
window.removePlayer = (pName) => { if(confirm(`Remove ${pName}?`)) set(ref(db, `games/${gameCode}/players/${pName}`), null); };
