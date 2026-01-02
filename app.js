// Register Service Worker for PWA support
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js')
    .then(() => console.log("Service Worker Registered"));
}

// Add an "Install" event listener to help users add to home screen
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // You could show a custom 'Install' button here if you want
});


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
let usedCards = [], bonuses = [], mult = 1, busted = false, targetPlayerCount = 4;

// Init
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

window.adjustCount = (val) => {
    targetPlayerCount = Math.max(1, Math.min(20, targetPlayerCount + val));
    document.getElementById('playerCountDisplay').innerText = targetPlayerCount;
};

// Networking
window.hostGameFromUI = () => { if(!myName) return alert("Enter name!"); hostGame(targetPlayerCount); };

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
    const pRef = ref(db, `games/${code}/players/${myName}`);
    const snap = await get(pRef);
    if (!snap.exists()) await set(pRef, { name: myName, history: [0, 0], submitted: false });
    onValue(ref(db, `games/${code}`), syncApp);
}

// Logic
const grid = document.getElementById('cardGrid');
if (grid && grid.children.length === 0) {
    for(let i=1; i<=12; i++){
        let btn = document.createElement('button'); btn.id = 'c-'+i; btn.innerText = i;
        btn.onclick = () => {
            if(usedCards.includes(i)) usedCards = usedCards.filter(v => v !== i);
            else if (usedCards.length < 7) usedCards.push(i);
            updateUI();
        };
        grid.appendChild(btn);
    }
}

window.toggleMod = (id, val) => {
    if(id === 'm2') mult = (mult === 2) ? 1 : 2;
    else bonuses.includes(val) ? bonuses = bonuses.filter(b=>b!==val) : bonuses.push(val);
    updateUI();
};

window.triggerBust = () => { 
    busted = true; usedCards = []; bonuses = []; mult = 1; 
    document.getElementById('calc-display').classList.add('shake');
    setTimeout(() => document.getElementById('calc-display').classList.remove('shake'), 400);
    updateUI(); 
};

function updateUI() {
    let sum = usedCards.reduce((a, b) => a + b, 0);
    let totalB = bonuses.reduce((a, b) => a + b, 0);
    const hasF7 = (usedCards.length === 7);
    let total = busted ? 0 : (sum * mult) + totalB + (hasF7 ? 15 : 0);
    document.getElementById('flip7-banner').style.display = (hasF7 && !busted) ? 'block' : 'none';
    const d = document.getElementById('calc-display');
    d.innerText = busted ? "BUST!" : total;
    d.style.color = busted ? "#ff4444" : (hasF7 ? "var(--gold)" : "white");
    for(let i=1; i<=12; i++) {
        const b = document.getElementById('c-'+i);
        if(b) {
            b.style.background = usedCards.includes(i) ? "var(--teal)" : "rgba(255,255,255,0.2)";
            b.style.opacity = (hasF7 && !usedCards.includes(i)) ? "0.3" : "1";
        }
    }
    document.getElementById('btn-m2').className = (mult === 2) ? "mod-btn-active" : "";
    [2, 4, 6, 8, 10].forEach(v => { document.getElementById('btn-p' + v).className = bonuses.includes(v) ? "mod-btn-active" : ""; });
}

function syncApp(snap) {
    const data = snap.val(); if(!data) { localStorage.removeItem('f7_code'); location.reload(); return; }
    const players = Object.values(data.players || {});
    const me = data.players[myName]; if(!me) return;

    if (data.status === "waiting") {
        showScreen('lobby-screen');
        document.getElementById('roomDisplayLobby').innerText = "Game: " + gameCode;
        document.getElementById('lobby-status').innerText = `Joined: ${players.length} / ${data.targetCount}`;
        document.getElementById('player-list').innerHTML = players.map(p => `<div class="p-tag">${p.name}</div>`).join("");
        if(players.length >= data.targetCount && data.host === myName) update(ref(db, `games/${gameCode}`), {status: "active"});
        return;
    }

    showScreen('game-screen');
    document.getElementById('roomCodeDisplay').innerText = `GAME: ${gameCode} | R${data.roundNum}`;

    // Winner Calculation Logic
    const sortedPlayers = players.map(p => ({ ...p, total: (p.history || []).reduce((a,b)=>a+b, 0) })).sort((a,b)=>b.total-a.total);
    const someoneOverThreshold = sortedPlayers.some(p => p.total >= 200);
    const everyoneDone = players.every(p => p.submitted);
    
    const banner = document.getElementById('winner-banner');
    if (someoneOverThreshold && everyoneDone) {
        banner.innerHTML = `<div class="winner-announce">🏆 ${sortedPlayers[0].name.toUpperCase()} WINS!<br><small>${sortedPlayers[0].total} Total Points</small></div>`;
    } else if (someoneOverThreshold) {
        banner.innerHTML = `<div style="color:var(--orange); font-weight:bold; margin-bottom:10px;">FINAL ROUND IN PROGRESS!</div>`;
    } else {
        banner.innerHTML = "";
    }

    // Leaderboard
    let lb = document.getElementById('leaderboard'); lb.innerHTML = "";
    sortedPlayers.forEach(p => {
        lb.innerHTML += `<div class="p-row ${p.name === myName ? 'is-me' : ''}"><div><b>${p.name} ${p.submitted ? '✅' : '⏳'}</b><br><small>Round: +${p.history[data.roundNum] || 0}</small></div><div style="font-size:1.5rem;font-weight:800;">${p.total}</div></div>`;
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
    
    // Hide Next Round button if game is over
    document.getElementById('nextRoundBtn').style.display = (data.host === myName && everyoneDone && !someoneOverThreshold) ? 'block' : 'none';
    
    // If game is over, show Host "End Game" button more prominently
    document.getElementById('host-end-game-container').innerHTML = (data.host === myName) ? 
        `<button class="big-btn host-btn" onclick="endGame()">${someoneOverThreshold && everyoneDone ? 'START NEW GAME' : 'END GAME FOR ALL'}</button>` : "";
}

window.submitRound = async () => {
    let sum = usedCards.reduce((a, b) => a + b, 0);
    let totalB = bonuses.reduce((a, b) => a + b, 0);
    const score = busted ? 0 : (sum * mult) + totalB + (usedCards.length === 7 ? 15 : 0);
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
        await update(ref(db), up);
    }
};

window.leaveGame = () => { localStorage.removeItem('f7_code'); location.reload(); };
window.endGame = async () => { if(confirm("End game?")) { await set(ref(db, `games/${gameCode}`), null); location.reload(); }};
