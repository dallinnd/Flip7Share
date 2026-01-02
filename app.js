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

// Game State Variables
let gameCode = localStorage.getItem('f7_code'), myName = localStorage.getItem('f7_name') || "";
let usedCards = [], bonuses = [], mult = 1, busted = false, currentGrandTotal = 0;
let targetPlayerCount = 4, hasCelebrated = false, lastRoundTriggered = false;

// --- HOME SCREEN & SESSION MANAGEMENT ---
window.adjustCount = (v) => {
    targetPlayerCount = Math.max(1, Math.min(20, targetPlayerCount + v));
    const disp = document.getElementById('playerCountDisplay');
    if (disp) disp.innerText = targetPlayerCount;
};

window.resumeActiveGame = () => { if (gameCode) joinGame(gameCode); };

window.deleteActiveGame = async () => {
    if (!gameCode) return;
    if (confirm("Are you sure you want to delete this game for everyone?")) {
        await set(ref(db, `games/${gameCode}`), null);
        localStorage.removeItem('f7_code');
        gameCode = null;
        checkActiveGame();
    }
};

function checkActiveGame() {
    const container = document.getElementById('active-game-container');
    if (container) container.style.display = gameCode ? 'block' : 'none';
}

// --- HOST & JOIN LOGIC ---
window.hostGameFromUI = async () => {
    if(!myName || myName.trim() === "") return alert("Please enter your name first!");
    gameCode = Math.floor(100000 + Math.random() * 900000).toString();
    localStorage.setItem('f7_code', gameCode);
    try {
        await set(ref(db, `games/${gameCode}`), { 
            host: myName, 
            targetCount: targetPlayerCount, 
            status: "waiting", 
            roundNum: 1 
        });
        await set(ref(db, `games/${gameCode}/players/${myName}`), { 
            name: myName, 
            history: [0], 
            submitted: false 
        });
        onValue(ref(db, `games/${gameCode}`), syncApp);
        checkActiveGame();
    } catch (e) { alert("Hosting failed: " + e.message); }
};

async function joinGame(code) {
    const pRef = ref(db, `games/${code}/players/${myName}`);
    const snap = await get(pRef);
    if (!snap.exists()) await set(pRef, { name: myName, history: [0], submitted: false });
    onValue(ref(db, `games/${code}`), syncApp);
    checkActiveGame();
}

// --- CORE SYNC ENGINE ---
function syncApp(snap) {
    const data = snap.val(); if(!data) return;
    const me = data.players[myName]; if(!me) return;
    const playersArr = Object.values(data.players || {});
    const isHost = data.host === myName;

    // 1. STATE RESTORATION: Populate calculator if player is editing (not submitted)
    if (!me.submitted) {
        const historyData = (me.history && me.history[data.roundNum]);
        if (historyData && typeof historyData === 'object') {
            usedCards = historyData.usedCards || [];
            bonuses = historyData.bonuses || [];
            mult = historyData.mult || 1;
            busted = historyData.busted || false;
        }
    }

    // 2. CALCULATE GRAND TOTAL (Everything before current round)
    currentGrandTotal = (me.history || [0]).reduce((acc, entry, idx) => {
        if (idx > 0 && idx < data.roundNum) {
            return acc + (typeof entry === 'object' ? entry.score : entry);
        }
        return acc;
    }, 0);
    
    if (data.status === "waiting") {
        window.showScreen('lobby-screen');
        document.getElementById('lobby-status').innerText = `Joined: ${playersArr.length} / ${data.targetCount}`;
    } else {
        window.showScreen('game-screen');
        document.getElementById('roomCodeDisplay').innerText = `CODE: ${gameCode} | R${data.roundNum}`;
        document.getElementById('calc-view').style.display = me.submitted ? 'none' : 'block';
        document.getElementById('waiting-view').style.display = me.submitted ? 'block' : 'none';
        
        const sorted = playersArr.map(p => ({ 
            ...p, 
            total: (p.history || []).reduce((a,b) => a + (typeof b === 'object' ? b.score : b), 0) 
        })).sort((a,b)=>b.total-a.total);
        
        // 3. SMART HOST CONTROLS: Next Round button state
        const hControls = document.getElementById('host-round-controls');
        const nextBtn = document.getElementById('nextRoundBtn');
        if (hControls) {
            hControls.style.display = isHost ? 'flex' : 'none';
            const allReady = playersArr.every(p => p.submitted);
            nextBtn.disabled = !allReady; // Fades/disables button if someone isn't ready
        }

        // 4. WINNER BANNER
        const leader = sorted[0];
        if (leader && leader.total >= 200) {
            document.getElementById('target-leader-banner').style.display = 'block';
            document.getElementById('leader-name-display').innerText = leader.name.toUpperCase();
            document.getElementById('leader-score-display').innerText = leader.total;
            if (!lastRoundTriggered) { alert("🚨 LAST ROUND! Someone passed 200!"); lastRoundTriggered = true; }
        } else {
            document.getElementById('target-leader-banner').style.display = 'none';
            lastRoundTriggered = false;
        }

        document.getElementById('leaderboard').innerHTML = sorted.map(p => `
            <div class="p-row ${p.total >= 200 ? 'threshold-reached' : ''}">
                <b>${p.name} ${p.submitted ? '✅' : '⏳'}</b>
                <span>${p.total} pts</span>
            </div>`).join("");

        // 5. UPDATE HISTORY LOGS
        let hHTML = "";
        for (let r = data.roundNum; r >= 1; r--) {
            let rows = playersArr.map(p => {
                let sVal = (p.history && p.history[r]) ? (typeof p.history[r] === 'object' ? p.history[r].score : p.history[r]) : 0;
                return `<div class="history-row"><span>${p.name}</span><b>${sVal}</b></div>`;
            }).join("");
            hHTML += `<div class="history-block"><span class="round-label">ROUND ${r}</span>${rows}</div>`;
        }
        document.getElementById('history-log-container').innerHTML = hHTML;
    }
    updateUI();
}

// --- PLAYER ACTIONS ---
window.submitRound = async () => {
    const snap = await get(ref(db, `games/${gameCode}`));
    const rNum = snap.val().roundNum;
    const score = busted ? 0 : (usedCards.reduce((a,b)=>a+b, 0) * mult) + bonuses.reduce((a,b)=>a+b, 0) + (usedCards.length === 7 ? 15 : 0);
    
    let h = (await get(ref(db, `games/${gameCode}/players/${myName}`))).val().history || [0];
    h[rNum] = { score, usedCards: [...usedCards], bonuses: [...bonuses], mult, busted };
    
    await update(ref(db, `games/${gameCode}/players/${myName}`), { history: h, submitted: true });
    
    // Clear local state for fresh feel, though syncApp will handle restoration if they hit "Edit"
    usedCards = []; bonuses = []; mult = 1; busted = false; updateUI();
};

window.editCurrentRound = async () => {
    // Universal "Un-submit" logic for Host and Players
    await update(ref(db, `games/${gameCode}/players/${myName}`), { submitted: false });
};

window.readyForNextRound = async () => {
    const snap = await get(ref(db, `games/${gameCode}`));
    const up = { [`games/${gameCode}/roundNum`]: snap.val().roundNum + 1 };
    for (let p in snap.val().players) up[`games/${gameCode}/players/${p}/submitted`] = false;
    await update(ref(db), up);
};

// --- CALCULATOR UI LOGIC ---
function updateUI() {
    const hasF7 = (usedCards.length === 7);
    if(hasF7 && !hasCelebrated && !busted) {
        document.getElementById('celebration-overlay').style.display = 'flex';
        hasCelebrated = true;
    }
    if(!hasF7) hasCelebrated = false;

    let sum = usedCards.reduce((a, b) => a + b, 0);
    let totalB = bonuses.reduce((a, b) => a + b, 0);
    let roundScore = busted ? 0 : (sum * mult) + totalB + (hasF7 ? 15 : 0);
    
    document.getElementById('round-display').innerText = busted ? "BUST" : roundScore;
    document.getElementById('grand-display').innerText = currentGrandTotal + roundScore;
    document.getElementById('bust-toggle-btn').className = busted ? "big-btn bust-btn bust-active" : "big-btn bust-btn";
    document.getElementById('flip7-banner').style.display = (hasF7 && !busted) ? 'block' : 'none';

    for(let i=0; i<=12; i++) {
        const b = document.getElementById('cardGrid').children[i];
        if(b) b.style.background = usedCards.includes(i) ? "var(--teal)" : "rgba(255,255,255,0.2)";
    }
    document.getElementById('btn-m2').className = (mult === 2) ? "mod-btn-active" : "";
    [2,4,6,8,10].forEach(v => {
        const b = document.getElementById('btn-p' + v);
        if(b) b.className = bonuses.includes(v) ? "mod-btn-active" : "";
    });
}

// --- GLOBAL MAPPINGS & INIT ---
window.showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    const target = document.getElementById(id); if (target) target.style.display = 'flex';
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
window.closeCelebration = () => document.getElementById('celebration-overlay').style.display = 'none';
window.openJoinPopup = () => { 
    let c = prompt("Enter 6-digit code:"); 
    if(c && myName) { gameCode = c; localStorage.setItem('f7_code', c); joinGame(c); } 
};
window.leaveGame = () => { if(confirm("Leave?")) { localStorage.removeItem('f7_code'); location.reload(); }};

document.addEventListener('DOMContentLoaded', () => {
    const nInput = document.getElementById('userNameInput');
    if(nInput) { 
        nInput.value = myName; 
        nInput.oninput = () => { myName = nInput.value; localStorage.setItem('f7_name', myName); }; 
    }
    const grid = document.getElementById('cardGrid');
    if (grid) {
        grid.innerHTML = "";
        for(let i=0; i<=12; i++){
            let btn = document.createElement('button'); btn.innerText = i;
            btn.onclick = () => { 
                if (busted) { busted = false; usedCards = [i]; } 
                else { usedCards.includes(i) ? usedCards = usedCards.filter(v=>v!==i) : (usedCards.length < 7 && usedCards.push(i)); }
                updateUI(); 
            };
            grid.appendChild(btn);
        }
    }
    checkActiveGame();
    document.getElementById('playerCountDisplay').innerText = targetPlayerCount;
});
