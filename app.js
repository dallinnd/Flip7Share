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

const vib = (ms = 15) => { if(navigator.vibrate) navigator.vibrate(ms); };

// --- UI NAVIGATION ---
window.showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'flex';
};

// --- JOIN LOGIC (FIXED) ---
window.openJoinPopup = () => {
    if(!myName || myName.trim() === "") {
        alert("PLEASE ENTER YOUR NAME FIRST!");
        return;
    }
    let c = prompt("Enter 6-digit code:");
    if(c && c.trim() !== "") { 
        gameCode = c.trim(); 
        joinGame(gameCode); 
    }
};

async function joinGame(code) {
    const gameRef = ref(db, `games/${code}`);
    const gameSnap = await get(gameRef);
    
    if (!gameSnap.exists()) {
        alert("GAME NOT FOUND! Check the code.");
        localStorage.removeItem('f7_code');
        return;
    }

    localStorage.setItem('f7_code', code);
    const pRef = ref(db, `games/${code}/players/${myName}`);
    const pSnap = await get(pRef);
    
    if (!pSnap.exists()) {
        await set(pRef, { name: myName, history: [0], submitted: false });
    }
    
    onValue(gameRef, syncApp);
}

window.resumeGame = () => { if(gameCode) joinGame(gameCode); };

window.leaveGame = () => {
    if(confirm("Leave the lobby and return home?")) {
        vib(30);
        localStorage.removeItem('f7_code');
        location.reload(); 
    }
};

window.clearSession = () => { 
    if(confirm("Clear current session?")) { 
        localStorage.removeItem('f7_code'); 
        location.reload(); 
    }
};

// --- HOSTING & COUNTERS ---
window.adjustCount = (v) => {
    let newVal = targetPlayerCount + v;
    if (newVal >= 1 && newVal <= 20) {
        targetPlayerCount = newVal;
        document.getElementById('playerCountDisplay').innerText = targetPlayerCount;
        vib(10);
    }
};

window.hostGameFromUI = async () => {
    if(!myName || myName.trim() === "") return alert("Please enter your name first!");
    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    gameCode = newCode;
    localStorage.setItem('f7_code', gameCode);
    try {
        await set(ref(db, `games/${gameCode}`), { host: myName, targetCount: targetPlayerCount, status: "waiting", roundNum: 1 });
        await set(ref(db, `games/${gameCode}/players/${myName}`), { name: myName, history: [0], submitted: false });
        onValue(ref(db, `games/${gameCode}`), syncApp);
    } catch (e) { alert("Hosting failed!"); }
};

// --- GAMEPLAY CALC ---
window.triggerBust = () => {
    vib(40);
    busted = !busted;
    if(busted) { usedCards = []; bonuses = []; mult = 1; }
    updateUI();
};

window.toggleMod = (id, val) => {
    vib(10);
    if(id === 'm2') mult = (mult === 2) ? 1 : 2;
    else bonuses.includes(val) ? bonuses = bonuses.filter(b=>b!==val) : bonuses.push(val);
    updateUI();
};

function updateUI() {
    let sum = usedCards.reduce((a, b) => a + b, 0);
    let totalB = bonuses.reduce((a, b) => a + b, 0);
    const hasF7 = (usedCards.length === 7);
    
    if(hasF7 && !hasCelebrated && !busted) {
        document.getElementById('celebration-overlay').style.display = 'flex';
        vib([50, 30, 50]);
        hasCelebrated = true;
    }
    if(!hasF7) hasCelebrated = false;

    let roundScore = busted ? 0 : (sum * mult) + totalB + (hasF7 ? 15 : 0);
    document.getElementById('round-display').innerText = busted ? "BUST" : roundScore;
    document.getElementById('grand-display').innerText = currentGrandTotal + roundScore;
    document.getElementById('bust-toggle-btn').className = busted ? "big-btn bust-btn bust-active" : "big-btn bust-btn";
    document.getElementById('flip7-banner').style.display = (hasF7 && !busted) ? 'block' : 'none';

    const grid = document.getElementById('cardGrid');
    if(grid) {
        Array.from(grid.children).forEach((btn, i) => {
            btn.style.background = usedCards.includes(i) ? "var(--orange)" : "rgba(255,255,255,0.2)";
        });
    }
    
    document.getElementById('btn-m2').className = (mult === 2) ? "mod-btn-active" : "";
    [2,4,6,8,10].forEach(v => {
        const btn = document.getElementById('btn-p' + v);
        if(btn) btn.className = bonuses.includes(v) ? "mod-btn-active" : "";
    });
}

// --- SYNC ---
function syncApp(snap) {
    const data = snap.val(); 
    if(!data) return; // Silent return if game data is missing
    
    if(data.status === "closed") { 
        alert("Game has been ended.");
        localStorage.removeItem('f7_code');
        location.reload(); 
        return; 
    }
    
    const me = data.players[myName]; 
    if(!me) return;

    const playersArr = Object.values(data.players || {});

    currentGrandTotal = (me.history || []).reduce((acc, entry, idx) => {
        if (idx > 0 && idx < data.roundNum) return acc + (typeof entry === 'object' ? entry.score : entry);
        return acc;
    }, 0);

    if (data.status === "waiting") {
        window.showScreen('lobby-screen');
        document.getElementById('roomDisplayLobby').innerText = "Game: " + gameCode;
        document.getElementById('lobby-status').innerText = `Joined: ${playersArr.length} / ${data.targetCount}`;
        document.getElementById('player-list').innerHTML = playersArr.map(p => `<div class="p-row"><b>${p.name}</b></div>`).join("");
        if(playersArr.length >= data.targetCount && data.host === myName) update(ref(db, `games/${gameCode}`), { status: "active" });
    } else {
        window.showScreen('game-screen');
        document.getElementById('roomCodeDisplay').innerText = `CODE: ${gameCode} | R${data.roundNum}`;
        document.getElementById('calc-view').style.display = me.submitted ? 'none' : 'block';
        document.getElementById('waiting-view').style.display = me.submitted ? 'flex' : 'none';
        
        const sorted = playersArr.map(p => ({ 
            ...p, total: (p.history || []).reduce((a,b) => a + (typeof b === 'object' ? b.score : b), 0) 
        })).sort((a,b)=>b.total-a.total);

        const isGameOver = sorted.some(p => p.total >= 200);
        document.getElementById('waiting-header').innerText = isGameOver ? "FINAL RESULTS" : "Leaderboard";
        document.getElementById('leaderboard').innerHTML = sorted.map((p, idx) => `
            <div class="p-row ${idx === 0 && isGameOver ? 'winner-highlight' : ''}">
                <b>${p.name} ${p.submitted ? '✅' : '⏳'}</b>
                <span>${p.total} pts</span>
            </div>`).join("");
        
        const allSubmitted = playersArr.every(p => p.submitted);
        document.getElementById('nextRoundBtn').style.display = (data.host === myName && allSubmitted && !isGameOver) ? 'block' : 'none';
        document.getElementById('finishGameBtn').style.display = (data.host === myName && allSubmitted && isGameOver) ? 'block' : 'none';
    }
    updateUI();
}

window.submitRound = async () => {
    vib(30);
    const snap = await get(ref(db, `games/${gameCode}`));
    const rNum = snap.val().roundNum;
    const score = busted ? 0 : (usedCards.reduce((a,b)=>a+b, 0) * mult) + bonuses.reduce((a,b)=>a+b, 0) + (usedCards.length === 7 ? 15 : 0);
    const roundState = { score, usedCards: [...usedCards], bonuses: [...bonuses], mult, busted };
    let h = (await get(ref(db, `games/${gameCode}/players/${myName}`))).val().history || [0];
    h[rNum] = roundState;
    await update(ref(db, `games/${gameCode}/players/${myName}`), { history: h, submitted: true });
    usedCards = []; bonuses = []; mult = 1; busted = false; updateUI();
};

window.readyForNextRound = async () => {
    vib(40);
    const snap = await get(ref(db, `games/${gameCode}`));
    const up = { [`games/${gameCode}/roundNum`]: snap.val().roundNum + 1 };
    for (let p in snap.val().players) up[`games/${gameCode}/players/${p}/submitted`] = false;
    await update(ref(db), up);
};

window.editCurrentRound = async () => {
    const snap = await get(ref(db, `games/${gameCode}`));
    const data = snap.val();
    const myData = data.players[myName];
    const saved = myData.history[data.roundNum];
    if (saved) {
        usedCards = saved.usedCards || []; bonuses = saved.bonuses || [];
        mult = saved.mult || 1; busted = saved.busted || false;
        await update(ref(db, `games/${gameCode}/players/${myName}`), { submitted: false });
        updateUI();
    }
};

window.closeCelebration = () => { document.getElementById('celebration-overlay').style.display = 'none'; };

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    const nInput = document.getElementById('userNameInput');
    if(nInput) {
        nInput.value = myName;
        nInput.oninput = () => { myName = nInput.value.toUpperCase(); localStorage.setItem('f7_name', myName); };
    }
    if(gameCode) document.getElementById('resume-container').style.display = "flex";
    const grid = document.getElementById('cardGrid');
    if (grid) {
        grid.innerHTML = "";
        for(let i=0; i<=12; i++){
            let btn = document.createElement('button'); btn.innerText = i;
            btn.onclick = () => { 
                vib(10); 
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
