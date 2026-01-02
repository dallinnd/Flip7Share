import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

let gameCode = localStorage.getItem('f7_code'), myName = localStorage.getItem('f7_name') || "";
let usedCards = [], mult = 1, bonus = 0, busted = false;

// Initialization
const nameInput = document.getElementById('userNameInput');
nameInput.value = myName;
nameInput.oninput = () => { myName = nameInput.value; localStorage.setItem('f7_name', myName); };
if(gameCode && myName) document.getElementById('resume-btn').style.display = 'block';

window.showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'block';
};

// Host & Join
window.askPlayerCount = () => {
    if(!myName) return alert("Enter your name first!");
    const count = prompt("Total players (including you):", "4");
    if(count) hostGame(parseInt(count));
};

async function hostGame(target) {
    gameCode = Math.floor(100000 + Math.random() * 900000);
    localStorage.setItem('f7_code', gameCode);
    await set(ref(db, `games/${gameCode}`), { host: myName, targetCount: target, status: "waiting", roundNum: 1 });
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
        await update(playerRef, { name: myName, history: [0], submitted: false });
    }
    onValue(ref(db, `games/${code}`), syncApp);
}

// Calculator Logic
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

// Round Management
window.submitRound = async () => {
    let sum = usedCards.reduce((a, b) => a + b, 0);
    let score = busted ? 0 : (sum * mult) + bonus;
    
    const snap = await get(ref(db, `games/${gameCode}`));
    const data = snap.val();
    let myHistory = data.players[myName].history || [0];
    myHistory[data.roundNum] = score;

    await update(ref(db, `games/${gameCode}/players/${myName}`), { history: myHistory, submitted: true });
    usedCards = []; mult = 1; bonus = 0; busted = false; updateUI();
};

window.readyForNextRound = async () => {
    const snap = await get(ref(db, `games/${gameCode}`));
    const data = snap.val();
    const updates = { [`games/${gameCode}/roundNum`]: data.roundNum + 1 };
    
    for (let p in data.players) {
        updates[`games/${gameCode}/players/${p}/submitted`] = false;
        let h = data.players[p].history || [0];
        h.push(0); 
        updates[`games/${gameCode}/players/${p}/history`] = h;
    }
    await update(ref(db), updates);
};

window.revertToRound = async (rIdx) => {
    if (confirm(`Revert game back to Round ${rIdx}?`)) {
        const snap = await get(ref(db, `games/${gameCode}`));
        const data = snap.val();
        const updates = { [`games/${gameCode}/roundNum`]: rIdx };
        for (let p in data.players) {
            updates[`games/${gameCode}/players/${p}/history`] = data.players[p].history.slice(0, rIdx + 1);
            updates[`games/${gameCode}/players/${p}/submitted`] = false;
        }
        await update(ref(db), updates);
        showScreen('game-screen');
    }
};

window.leaveGame = () => { if(confirm("Leave game?")) { localStorage.removeItem('f7_code'); location.reload(); }};
window.endGame = async () => { if(confirm("Delete game for everyone?")) { await set(ref(db, `games/${gameCode}`), null); location.reload(); }};
window.removePlayer = (pName) => { if(confirm(`Remove ${pName}?`)) set(ref(db, `games/${gameCode}/players/${pName}`), null); };

// Real-time Sync
function syncApp(snap) {
    const data = snap.val(); 
    if(!data) { localStorage.removeItem('f7_code'); location.reload(); return; }
    
    const players = Object.values(data.players || {});
    const me = data.players[myName];

    // Lobby Screen
    if (data.status === "waiting") {
        showScreen('lobby-screen');
        document.getElementById('roomDisplayLobby').innerText = "Game: " + gameCode;
        document.getElementById('host-controls-lobby').innerHTML = (data.host === myName) ? `<button class="host-danger-btn" onclick="endGame()">CANCEL GAME</button>` : "";
        document.getElementById('lobby-status').innerText = `Joined: ${players.length} / ${data.targetCount}`;
        document.getElementById('player-list').innerHTML = players.map(p => `<div class="p-tag">${p.name} ${(data.host === myName && p.name !== myName) ? `<span class="remove-player-btn" onclick="removePlayer('${p.name}')">×</span>` : ""}</div>`).join("");
        if(players.length >= data.targetCount && data.host === myName) update(ref(db, `games/${gameCode}`), {status: "active"});
        return;
    }

    // Game Screen
    showScreen('game-screen');
    document.getElementById('roomCodeDisplay').innerText = "Game: " + gameCode;
    document.getElementById('host-end-game-container').innerHTML = (data.host === myName) ? `<button class="host-danger-btn" onclick="endGame()">END GAME FOR ALL</button>` : "";

    // Leaderboard
    let lb = document.getElementById('leaderboard'); lb.innerHTML = "";
    players.map(p => ({ ...p, total: (p.history || []).reduce((a,b)=>a+b, 0) })).sort((a,b)=>b.total-a.total).forEach(p => {
        lb.innerHTML += `<div class="p-row ${p.name === myName ? 'is-me' : ''}"><span>${p.name} ${p.submitted ? '✅' : '⏳'}</span><span>${p.total} <small>(+${p.history[data.roundNum] || 0})</small></span></div>`;
        if(p.total >= 200) alert(p.name + " WINS!");
    });

    // History Screen
    let hLog = document.getElementById('history-log-container'); hLog.innerHTML = "";
    for (let r = data.roundNum; r >= 1; r--) {
        let rHTML = `<div class="history-block" onclick="${data.host === myName ? `revertToRound(${r})` : ''}"><span class="round-label">Round ${r}</span>`;
        players.forEach(p => { rHTML += `<div style="display:flex; justify-content:space-between; font-size:0.8rem;"><span>${p.name}</span><span>${p.history ? p.history[r] || 0 : 0}</span></div>`; });
        hLog.innerHTML += rHTML + `</div>`;
    }

    // View Toggle
    if (me.submitted) {
        document.getElementById('calc-view').style.display = 'none';
        document.getElementById('waiting-view').style.display = 'block';
    } else {
        document.getElementById('calc-view').style.display = 'block';
        document.getElementById('waiting-view').style.display = 'none';
    }
    document.getElementById('nextRoundBtn').style.display = (data.host === myName && players.every(p => p.submitted)) ? 'block' : 'none';
}
