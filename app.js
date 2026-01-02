import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Service Worker Registration
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.log("SW error", err));
}

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

// State Variables
let gameCode = localStorage.getItem('f7_code'), myName = localStorage.getItem('f7_name') || "";
let usedCards = [], bonuses = [], mult = 1, busted = false, currentGrandTotal = 0;
let targetPlayerCount = 4;

// Init Name Input
const nInput = document.getElementById('userNameInput');
if(nInput) {
    nInput.value = myName;
    nInput.oninput = () => { myName = nInput.value; localStorage.setItem('f7_name', myName); };
}
if(gameCode && myName) document.getElementById('resume-btn').style.display = 'block';

// Navigation Global
window.showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'flex';
};

// Host Counter
window.adjustCount = (val) => {
    targetPlayerCount = Math.max(1, Math.min(20, targetPlayerCount + val));
    const display = document.getElementById('playerCountDisplay');
    if (display) display.innerText = targetPlayerCount;
};

// Network Actions
window.hostGameFromUI = async () => {
    if(!myName) return alert("Enter your name first!");
    gameCode = Math.floor(100000 + Math.random() * 900000);
    localStorage.setItem('f7_code', gameCode);
    await set(ref(db, `games/${gameCode}`), { 
        host: myName, targetCount: targetPlayerCount, status: "waiting", roundNum: 1 
    });
    joinGame(gameCode);
};

window.openJoinPopup = () => {
    let c = prompt("6-Digit Code:");
    if(c && myName) { gameCode = c; localStorage.setItem('f7_code', c); joinGame(c); }
    else if (!myName) alert("Enter your name first!");
};

window.resumeGame = () => joinGame(gameCode);

async function joinGame(code) {
    const pRef = ref(db, `games/${code}/players/${myName}`);
    const snap = await get(pRef);
    if (!snap.exists()) await set(pRef, { name: myName, history: [0, 0], submitted: false });
    onValue(ref(db, `games/${code}`), syncApp);
}

// Logic Functions
const grid = document.getElementById('cardGrid');
if (grid && grid.children.length === 0) {
    for(let i=1; i<=12; i++){
        let btn = document.createElement('button'); btn.innerText = i;
        btn.onclick = () => {
            if ("vibrate" in navigator) navigator.vibrate(10);
            busted = false;
            if(usedCards.includes(i)) usedCards = usedCards.filter(v => v !== i);
            else if (usedCards.length < 7) usedCards.push(i);
            updateUI();
        };
        grid.appendChild(btn);
    }
}

window.toggleMod = (id, val) => {
    if ("vibrate" in navigator) navigator.vibrate(10);
    if(id === 'm2') mult = (mult === 2) ? 1 : 2;
    else bonuses.includes(val) ? bonuses = bonuses.filter(b=>b!==val) : bonuses.push(val);
    updateUI();
};

window.triggerBust = () => {
    if ("vibrate" in navigator) navigator.vibrate([100, 50, 100]);
    busted = true; usedCards = []; bonuses = []; mult = 1;
    updateUI();
};

function updateUI() {
    let sum = usedCards.reduce((a, b) => a + b, 0);
    let totalB = bonuses.reduce((a, b) => a + b, 0);
    const hasF7 = (usedCards.length === 7);
    let roundScore = busted ? 0 : (sum * mult) + totalB + (hasF7 ? 15 : 0);

    const rDisp = document.getElementById('round-display');
    const gDisp = document.getElementById('grand-display');
    
    if(rDisp) {
        rDisp.innerText = busted ? "BUST" : roundScore;
        rDisp.style.color = busted ? "#ff4444" : (hasF7 ? "var(--gold)" : "white");
    }
    if(gDisp) gDisp.innerText = currentGrandTotal + roundScore;

    // Card/Mod Selection View
    for(let i=1; i<=12; i++) {
        const b = grid.children[i-1];
        if(b) b.style.background = usedCards.includes(i) ? "var(--teal)" : "rgba(255,255,255,0.2)";
    }
    const m2b = document.getElementById('btn-m2');
    if(m2b) m2b.className = (mult === 2) ? "mod-btn-active" : "";
    [2, 4, 6, 8, 10].forEach(v => {
        const b = document.getElementById('btn-p' + v);
        if(b) b.className = bonuses.includes(v) ? "mod-btn-active" : "";
    });
}

function syncApp(snap) {
    const data = snap.val();
    if(!data) return;
    const me = data.players[myName];
    if(!me) return;

    currentGrandTotal = (me.history || []).reduce((a,b) => a + b, 0);
    
    if (data.status === "waiting") {
        showScreen('lobby-screen');
        document.getElementById('roomDisplayLobby').innerText = "Game: " + gameCode;
        const pLen = Object.keys(data.players).length;
        document.getElementById('lobby-status').innerText = `Joined: ${pLen} / ${data.targetCount}`;
        if(pLen >= data.targetCount && data.host === myName) update(ref(db, `games/${gameCode}`), { status: "active" });
    } else {
        showScreen('game-screen');
        document.getElementById('roomCodeDisplay').innerText = `GAME: ${gameCode} | R${data.roundNum}`;
        document.getElementById('calc-view').style.display = me.submitted ? 'none' : 'block';
        document.getElementById('waiting-view').style.display = me.submitted ? 'block' : 'none';
    }

    const sorted = Object.values(data.players).map(p => ({ ...p, total: (p.history || []).reduce((a,b)=>a+b, 0) })).sort((a,b)=>b.total-a.total);
    document.getElementById('leaderboard').innerHTML = sorted.map(p => `
        <div class="p-row ${p.name === myName ? 'is-me' : ''}">
            <div><b>${p.name} ${p.submitted ? '✅' : '⏳'}</b></div>
            <div style="font-size:1.5rem;font-weight:800;">${p.total}</div>
        </div>`).join("");

    updateUI();
}

window.submitRound = async () => {
    let sum = usedCards.reduce((a, b) => a + b, 0);
    let totalB = bonuses.reduce((a, b) => a + b, 0);
    const score = busted ? 0 : (sum * mult) + totalB + (usedCards.length === 7 ? 15 : 0);
    const snap = await get(ref(db, `games/${gameCode}`));
    const data = snap.val();
    let h = data.players[myName].history || [0];
    h[data.roundNum] = score;
    await update(ref(db, `games/${gameCode}/players/${myName}`), { history: h, submitted: true });
    usedCards = []; bonuses = []; mult = 1; busted = false; updateUI();
};

window.leaveGame = () => { if(confirm("Leave game?")) { localStorage.removeItem('f7_code'); location.reload(); }};
