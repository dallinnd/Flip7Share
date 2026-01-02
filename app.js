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

// --- APP STATE ---
let gameCode = localStorage.getItem('f7_code'), myName = localStorage.getItem('f7_name') || "";
let usedCards = [], bonuses = [], mult = 1, busted = false;
let targetPlayerCount = 4;

// --- INITIALIZATION & KEYBOARD HANDLING ---
const nInput = document.getElementById('userNameInput');
if(nInput) {
    nInput.value = myName;
    nInput.oninput = () => { myName = nInput.value; localStorage.setItem('f7_name', myName); };
    nInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') nInput.blur(); });
}
if(gameCode && myName) document.getElementById('resume-btn').style.display = 'block';

window.showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'flex';
};

// --- HOST SETUP UI ---
window.adjustCount = (val) => {
    targetPlayerCount = Math.max(2, Math.min(10, targetPlayerCount + val));
    document.getElementById('playerCountDisplay').innerText = targetPlayerCount;
};

window.hostGameFromUI = () => {
    if(!myName || myName.trim() === "") { alert("Enter your name first!"); nInput.focus(); return; }
    hostGame(targetPlayerCount);
};

// --- CORE GAME LOGIC ---
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
    const pRef = ref(db, `games/${code}/players/${myName}`);
    const snap = await get(pRef);
    if (!snap.exists()) await update(pRef, { name: myName, history: [0, 0], submitted: false });
    onValue(ref(db, `games/${code}`), syncApp);
}

// --- CALCULATOR & MULTI-SELECT ---
window.toggleMod = (id, val) => {
    if(id === 'm2') mult = (mult === 2) ? 1 : 2;
    else {
        if(bonuses.includes(val)) bonuses = bonuses.filter(b => b !== val);
        else bonuses.push(val);
    }
    updateUI();
};

window.triggerBust = () => { 
    busted = true; usedCards = []; bonuses = []; mult = 1; 
    const disp = document.getElementById('calc-display');
    disp.classList.add('shake'); setTimeout(() => disp.classList.remove('shake'), 400);
    updateUI(); 
};

// Generate Grid
const grid = document.getElementById('cardGrid');
if (grid && grid.children.length === 0) {
    for(let i=1; i<=12; i++){
        let btn = document.createElement('button'); btn.id = 'c-'+i; btn.innerText = i;
        btn.onclick = () => { if(usedCards.includes(i)) usedCards = usedCards.filter(v=>v!==i); else usedCards.push(i); updateUI(); };
        grid.appendChild(btn);
    }
}

function updateUI() {
    let sum = usedCards.reduce((a, b) => a + b, 0);
    let totalB = bonuses.reduce((a, b) => a + b, 0);
    let total = busted ? 0 : (sum * mult) + totalB;
    
    const d = document.getElementById('calc-display');
    d.innerText = busted ? "BUST!" : total; d.style.color = busted ? "#ff4444" : "white";

    for(let i=1; i<=12; i++) {
        const b = document.getElementById('c-'+i);
        if(b) b.style.background = usedCards.includes(i) ? "var(--teal)" : "rgba(255,255,255,0.2)";
    }
    
    // Toggle Orange Active States
    document.getElementById('btn-m2').className = (mult === 2) ? "mod-btn-active" : "";
    [2, 4, 6, 8, 10].forEach(v => {
        document.getElementById('btn-p' + v).className = bonuses.includes(v) ? "mod-btn-active" : "";
    });
}

// --- SYNC & TIME MACHINE ---
window.submitRound = async () => {
    let sum = usedCards.reduce((a, b) => a + b, 0);
    let totalB = bonuses.reduce((a, b) => a + b, 0);
    let score = busted ? 0 : (sum * mult) + totalB;
    const snap = await get(ref(db, `games/${gameCode}`));
    const data = snap.val();
    let h = data.players[myName].history || [0];
    while(h.length <= data.roundNum) h.push(0);
    h[data.roundNum] = score;
    await update(ref(db, `games/${gameCode}/players/${myName}`), { history: h, submitted: true });
    usedCards = []; bonuses = []; mult = 1; busted = false; updateUI();
};

window.readyForNextRound = async () => {
    const snap = await get(ref(db, `games/${gameCode}`));
    const data = snap.val();
    const nextR = data.roundNum + 1;
    const up = { [`games/${gameCode}/roundNum`]: nextR };
    for (let p in data.players) {
        up[`games/${gameCode}/players/${p}/submitted`] = false;
        let h = data.players[p].history || [0];
        while(h.length <= nextR) h.push(0);
        up[`games/${gameCode}/players/${p}/history`] = h;
    }
    await update(ref(db), up);
};

window.revertToRound = async (r) => {
    if (confirm(`Rewind to Round ${r}?`)) {
        const snap = await get(ref(db, `games/${gameCode}`));
        const data = snap.val();
        const up = { [`games/${gameCode}/roundNum`]: r };
        for (let p in data.players) {
            up[`games/${gameCode}/players/${p}/history`] = data.players[p].history.slice(0, r + 1);
            up[`games/${gameCode}/players/${p}/submitted`] = false;
        }
        await update(ref(db), up); showScreen('game-screen');
    }
};

function syncApp(snap) {
    const data = snap.val(); if(!data) { localStorage.removeItem('f7_code'); location.reload(); return; }
    const players = Object.values(data.players || {});
    const me = data.players[myName]; if(!me) return;

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
        if(p.total >= 200) alert(p.name + " WINS!");
    });

    // History
    let hLog = document.getElementById('history-log-container'); hLog.innerHTML = "";
    for (let r = data.roundNum; r >= 1; r--) {
        let rH = `<div class="history-block" ${data.host === myName ? `onclick="revertToRound(${r})"` : ''}><span class="round-label">Round ${r} ${data.host === myName ? '↩️' : ''}</span>`;
        players.forEach(p => { rH += `<div style="display:flex;justify-content:space-between;font-size:0.8rem;"><span>${p.name}</span><span>${p.history[r] || 0}</span></div>`; });
        hLog.innerHTML += rH + `</div>`;
    }

    if (me.submitted) { document.getElementById('calc-view').style.display = 'none'; document.getElementById('waiting-view').style.display = 'block'; }
    else { document.getElementById('calc-view').style.display = 'block'; document.getElementById('waiting-view').style.display = 'none'; }
    document.getElementById('nextRoundBtn').style.display = (data.host === myName && players.every(p=>p.submitted)) ? 'block' : 'none';
}

window.leaveGame = () => { if(confirm("Leave?")) { localStorage.removeItem('f7_code'); location.reload(); }};
