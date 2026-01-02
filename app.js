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

// UI Setup
const nInput = document.getElementById('userNameInput');
if(nInput) { nInput.value = myName; nInput.oninput = () => { myName = nInput.value; localStorage.setItem('f7_name', myName); }; }
if(gameCode && myName) document.getElementById('resume-btn').style.display = 'block';

window.showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'flex';
};

// --- Game Logic ---
window.askPlayerCount = () => {
    const c = prompt("Total players (including you):", "4");
    if(c && myName) hostGame(parseInt(c));
};

async function hostGame(target) {
    gameCode = Math.floor(100000 + Math.random() * 900000);
    localStorage.setItem('f7_code', gameCode);
    await set(ref(db, `games/${gameCode}`), { host: myName, targetCount: target, status: "waiting", roundNum: 1 });
    joinGame(gameCode);
}

window.openJoinPopup = () => {
    let c = prompt("6-digit code:");
    if(c && myName) { gameCode = c; localStorage.setItem('f7_code', c); joinGame(c); }
};

window.resumeGame = () => joinGame(gameCode);

async function joinGame(code) {
    const playerRef = ref(db, `games/${code}/players/${myName}`);
    const snap = await get(playerRef);
    if (!snap.exists()) await update(playerRef, { name: myName, history: [0, 0], submitted: false });
    onValue(ref(db, `games/${code}`), syncApp);
}

// --- Calculator ---
window.toggleMod = (id, val) => {
    if(id === 'm2') mult = (mult === 2) ? 1 : 2;
    else bonus = (bonus === val) ? 0 : val;
    updateUI();
};

window.triggerBust = () => { 
    busted = true; usedCards = []; mult = 1; bonus = 0; 
    document.getElementById('calc-display').classList.add('shake');
    setTimeout(() => document.getElementById('calc-display').classList.remove('shake'), 400);
    updateUI(); 
};

// Generate Grid
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

function updateUI() {
    let sum = usedCards.reduce((a, b) => a + b, 0);
    let total = busted ? 0 : (sum * mult) + bonus;
    const disp = document.getElementById('calc-display');
    disp.innerText = busted ? "BUST!" : total;
    disp.style.color = busted ? "#ff4444" : "white";
    for(let i=1; i<=12; i++) {
        const b = document.getElementById('c-'+i);
        if(b) b.style.background = usedCards.includes(i) ? "var(--teal)" : "rgba(255,255,255,0.2)";
    }
}

// --- Round Syncing ---
window.submitRound = async () => {
    let sum = usedCards.reduce((a, b) => a + b, 0);
    let score = busted ? 0 : (sum * mult) + bonus;
    const snap = await get(ref(db, `games/${gameCode}`));
    const data = snap.val();
    let h = data.players[myName].history || [0];
    while(h.length <= data.roundNum) h.push(0);
    h[data.roundNum] = score;
    await update(ref(db, `games/${gameCode}/players/${myName}`), { history: h, submitted: true });
    usedCards = []; mult = 1; bonus = 0; busted = false; updateUI();
};

window.readyForNextRound = async () => {
    const snap = await get(ref(db, `games/${gameCode}`));
    const data = snap.val();
    const nextR = data.roundNum + 1;
    const updates = { [`games/${gameCode}/roundNum`]: nextR };
    for (let p in data.players) {
        updates[`games/${gameCode}/players/${p}/submitted`] = false;
        let h = data.players[p].history || [0];
        while(h.length <= nextR) h.push(0);
        updates[`games/${gameCode}/players/${p}/history`] = h;
    }
    await update(ref(db), updates);
};

window.revertToRound = async (rIdx) => {
    if (confirm(`Revert to Round ${rIdx}?`)) {
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

function syncApp(snap) {
    const data = snap.val(); if(!data) return;
    const players = Object.values(data.players || {});
    const me = data.players[myName];

    if (data.status === "waiting") {
        showScreen('lobby-screen');
        document.getElementById('roomDisplayLobby').innerText = "Game: " + gameCode;
        if(players.length >= data.targetCount && data.host === myName) update(ref(db, `games/${gameCode}`), {status: "active"});
        return;
    }

    showScreen('game-screen');
    document.getElementById('roomCodeDisplay').innerText = `GAME: ${gameCode} | R${data.roundNum}`;

    // Leaderboard
    let lb = document.getElementById('leaderboard'); lb.innerHTML = "";
    players.map(p => ({ ...p, total: (p.history || []).reduce((a,b)=>a+b, 0) })).sort((a,b)=>b.total-a.total).forEach(p => {
        lb.innerHTML += `<div class="p-row ${p.name === myName ? 'is-me' : ''}"><div><b>${p.name} ${p.submitted ? '✅' : '⏳'}</b><br><small>Round: +${p.history[data.roundNum] || 0}</small></div><div style="font-size:1.5rem;font-weight:800;">${p.total}</div></div>`;
    });

    // History
    let hLog = document.getElementById('history-log-container'); hLog.innerHTML = "";
    for (let r = data.roundNum; r >= 1; r--) {
        let rHTML = `<div class="history-block" ${data.host === myName ? `onclick="revertToRound(${r})"` : ''}><span class="round-label">Round ${r} ${data.host === myName ? '↩️' : ''}</span>`;
        players.forEach(p => { rHTML += `<div style="display:flex;justify-content:space-between;font-size:0.8rem;"><span>${p.name}</span><span>${p.history[r] || 0}</span></div>`; });
        hLog.innerHTML += rHTML + `</div>`;
    }

    // Toggle View
    if (me && me.submitted) {
        document.getElementById('calc-view').style.display = 'none';
        document.getElementById('waiting-view').style.display = 'block';
    } else {
        document.getElementById('calc-view').style.display = 'block';
        document.getElementById('waiting-view').style.display = 'none';
    }
    document.getElementById('nextRoundBtn').style.display = (data.host === myName && players.every(p => p.submitted)) ? 'block' : 'none';
}

window.leaveGame = () => { localStorage.removeItem('f7_code'); location.reload(); };
