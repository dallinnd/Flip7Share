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
let usedCards = [], bonuses = [], mult = 1, busted = false, currentGrandTotal = 0;
let targetPlayerCount = 4, hasCelebrated = false;

// --- Real-time Syncing ---
async function syncLiveScore(score) {
    if (!gameCode || !myName) return;
    await update(ref(db, `games/${gameCode}/players/${myName}`), { 
        liveScore: score, 
        isBusted: busted 
    });
}

// --- UI Logic ---
function updateUI() {
    let sum = usedCards.reduce((a, b) => a + b, 0);
    let totalB = bonuses.reduce((a, b) => a + b, 0);
    const hasF7 = (usedCards.length === 7);
    
    if(hasF7 && !hasCelebrated && !busted) {
        document.getElementById('celebration-overlay').style.display = 'flex';
        hasCelebrated = true;
    }
    if(!hasF7) hasCelebrated = false;

    let roundScore = busted ? 0 : (sum * mult) + totalB + (hasF7 ? 15 : 0);
    document.getElementById('round-display').innerText = busted ? "BUST" : roundScore;
    document.getElementById('grand-display').innerText = currentGrandTotal + roundScore;
    
    syncLiveScore(roundScore);

    const grid = document.getElementById('cardGrid');
    if(grid) {
        for(let i=0; i<=12; i++) {
            const b = grid.children[i];
            if(b) b.style.background = usedCards.includes(i) ? "var(--teal)" : "rgba(255,255,255,0.2)";
        }
    }
    document.getElementById('bust-toggle-btn').className = busted ? "big-btn bust-btn bust-active" : "big-btn bust-btn";
    document.getElementById('btn-m2').className = (mult === 2) ? "mod-btn-active" : "";
    [2,4,6,8,10].forEach(v => {
        const b = document.getElementById('btn-p' + v);
        if(b) b.className = bonuses.includes(v) ? "mod-btn-active" : "";
    });
}

// --- Firebase Sync ---
function syncApp(snap) {
    const data = snap.val(); if(!data) return;
    const me = data.players[myName]; if(!me) return;
    const playersArr = Object.values(data.players || {});

    const history = me.history || [0];
    currentGrandTotal = history.reduce((acc, entry, idx) => {
        if (idx > 0 && idx < data.roundNum) return acc + (typeof entry === 'object' ? entry.score : entry);
        return acc;
    }, 0);
    
    if (data.status === "waiting") {
        window.showScreen('lobby-screen');
        document.getElementById('lobby-status').innerText = `Joined: ${playersArr.length} / ${data.targetCount}`;
        document.getElementById('player-list').innerHTML = playersArr.map(p => `<div class="p-row"><b>${p.name}</b></div>`).join("");
        if(playersArr.length >= data.targetCount && data.host === myName) update(ref(db, `games/${gameCode}`), { status: "active" });
    } else {
        window.showScreen('game-screen');
        document.getElementById('roomCodeDisplay').innerText = `CODE: ${gameCode} | R${data.roundNum}`;
        document.getElementById('calc-view').style.display = me.submitted ? 'none' : 'block';
        document.getElementById('waiting-view').style.display = me.submitted ? 'block' : 'none';
        
        const sorted = playersArr.map(p => {
            const grand = (p.history || []).reduce((a,b) => a + (typeof b === 'object' ? b.score : b), 0);
            const live = p.submitted ? 0 : (p.liveScore || 0);
            return { ...p, displayTotal: grand + live };
        }).sort((a,b) => b.displayTotal - a.displayTotal);
        
        document.getElementById('leaderboard').innerHTML = sorted.map(p => `
            <div class="p-row ${p.displayTotal >= 200 ? 'threshold-reached' : ''} ${p.isBusted ? 'busted-row' : ''}">
                <b>${p.name} ${p.submitted ? '✅' : '<span class="live-icon">⚡</span>'}</b>
                <span>${p.isBusted ? 'BUST' : p.displayTotal + ' pts'}</span>
            </div>`).join("");
        
        document.getElementById('nextRoundBtn').style.display = (data.host === myName && playersArr.every(p => p.submitted)) ? 'block' : 'none';
    }
}

// --- UPDATED EDIT SCORE LOGIC ---
window.editScore = async () => {
    if (!gameCode || !myName) return;
    
    const gameRef = ref(db, `games/${gameCode}`);
    const snap = await get(gameRef);
    const data = snap.val();
    const roundNum = data.roundNum;
    const me = data.players[myName];

    // Restore the specific round data from history before showing the screen
    if (me.history && me.history[roundNum]) {
        const prev = me.history[roundNum];
        usedCards = [...(prev.usedCards || [])];
        bonuses = [...(prev.bonuses || [])];
        mult = prev.mult || 1;
        busted = prev.busted || false;
    }

    // Tell Firebase we are no longer submitted
    await update(ref(db, `games/${gameCode}/players/${myName}`), { submitted: false });
    
    // Refresh the local calculator UI with the restored cards
    updateUI();
};

window.submitRound = async () => {
    const snap = await get(ref(db, `games/${gameCode}`));
    const rNum = snap.val().roundNum;
    const score = busted ? 0 : (usedCards.reduce((a,b)=>a+b, 0) * mult) + bonuses.reduce((a,b)=>a+b, 0) + (usedCards.length === 7 ? 15 : 0);
    let h = (await get(ref(db, `games/${gameCode}/players/${myName}`))).val().history || [0];
    h[rNum] = { score, usedCards, bonuses, mult, busted };
    
    await update(ref(db, `games/${gameCode}/players/${myName}`), { 
        history: h, submitted: true, liveScore: 0, isBusted: false 
    });
    usedCards = []; bonuses = []; mult = 1; busted = false; updateUI();
};

window.readyForNextRound = async () => {
    const snap = await get(ref(db, `games/${gameCode}`));
    const up = { [`games/${gameCode}/roundNum`]: snap.val().roundNum + 1 };
    for (let p in snap.val().players) up[`games/${gameCode}/players/${p}/submitted`] = false;
    await update(ref(db), up);
};

window.adjustCount = (v) => {
    targetPlayerCount = Math.max(1, Math.min(20, targetPlayerCount + v));
    document.getElementById('playerCountDisplay').innerText = targetPlayerCount;
};

window.hostGameFromUI = async () => {
    if(!myName) return alert("Enter name!");
    gameCode = Math.floor(100000 + Math.random() * 900000).toString();
    localStorage.setItem('f7_code', gameCode);
    await set(ref(db, `games/${gameCode}`), { host: myName, targetCount: targetPlayerCount, status: "waiting", roundNum: 1 });
    await set(ref(db, `games/${gameCode}/players/${myName}`), { name: myName, history: [0], submitted: false });
    onValue(ref(db, `games/${gameCode}`), syncApp);
};

window.openJoinPopup = () => {
    let c = prompt("Enter code:");
    if(c && myName) { gameCode = c; localStorage.setItem('f7_code', c); joinGame(c); }
};

async function joinGame(code) {
    const pRef = ref(db, `games/${code}/players/${myName}`);
    const snap = await get(pRef);
    if (!snap.exists()) await set(pRef, { name: myName, history: [0], submitted: false });
    onValue(ref(db, `games/${code}`), syncApp);
}

window.showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'flex';
};

window.triggerBust = () => {
    busted = !busted;
    if(busted) { usedCards = []; bonuses = []; mult = 1; }
    updateUI();
};

window.toggleMod = (id, val) => {
    if(id === 'm2') mult = (mult === 2) ? 1 : 2;
    else bonuses.includes(val) ? bonuses = bonuses.filter(b=>b!==val) : bonuses.push(val);
    updateUI();
};

window.resumeGame = () => { if(gameCode) joinGame(gameCode); };
window.leaveGame = () => { if(confirm("Leave?")) { localStorage.removeItem('f7_code'); location.reload(); }};
window.closeCelebration = () => document.getElementById('celebration-overlay').style.display = 'none';

document.addEventListener('DOMContentLoaded', () => {
    const nInput = document.getElementById('userNameInput');
    if(nInput) {
        nInput.value = myName;
        nInput.oninput = () => { myName = nInput.value; localStorage.setItem('f7_name', myName); };
    }
    if(gameCode) document.getElementById('resume-btn').style.display = 'block';

    const grid = document.getElementById('cardGrid');
    if(grid) {
        grid.innerHTML = "";
        for(let i=0; i<=12; i++){
            let btn = document.createElement('button'); btn.innerText = i;
            btn.onclick = () => { 
                if (busted) { busted = false; usedCards = [i]; } 
                else {
                    if(usedCards.includes(i)) usedCards = usedCards.filter(v=>v!==i); 
                    else if(usedCards.length < 7) usedCards.push(i);
                }
                updateUI(); 
            };
            grid.appendChild(btn);
        }
    }
});
