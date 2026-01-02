import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = { /* ... your config ... */ };
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let gameCode = localStorage.getItem('f7_code');
let myName = localStorage.getItem('f7_name') || "Player";
let usedCards = JSON.parse(localStorage.getItem('f7_used') || "[]");
let multipliers = 1, bonus = 0, isBusted = false;

document.getElementById('userNameInput').value = myName;
if(gameCode) document.getElementById('resume-btn').style.display = 'block';

// Navigation & Persistence
window.showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'block';
};

window.activateNameEdit = () => {
    const input = document.getElementById('userNameInput');
    input.readOnly = false; input.focus();
    input.onblur = () => { input.readOnly = true; myName = input.value; localStorage.setItem('f7_name', myName); };
};

// --- Calculator Logic ---
const grid = document.getElementById('cardGrid');
for(let i=1; i<=12; i++){
    let btn = document.createElement('button');
    btn.id = 'card-'+i; btn.innerText = i;
    btn.onclick = () => toggleCard(i);
    grid.appendChild(btn);
}

function toggleCard(val) {
    if(usedCards.includes(val)) usedCards = usedCards.filter(v => v !== val);
    else usedCards.push(val);
    updateUI();
}

window.toggleMod = (id, val, mult) => {
    if(id === 'm2') multipliers = (multipliers === 2) ? 1 : 2;
    else bonus = (bonus === val) ? 0 : val;
    updateUI();
};

function updateUI() {
    let sum = usedCards.reduce((a, b) => a + b, 0);
    let total = isBusted ? 0 : (sum * multipliers) + bonus;
    document.getElementById('calc-display').innerText = isBusted ? "BUST!" : "Total: " + total;
    
    // Color Cards: Teal if used, Transparent if not
    for(let i=1; i<=12; i++) {
        document.getElementById('card-'+i).style.background = usedCards.includes(i) ? "var(--teal)" : "rgba(255,255,255,0.2)";
    }
    localStorage.setItem('f7_used', JSON.stringify(usedCards));
}

// --- Firebase Flow ---
window.hostGame = async () => {
    gameCode = Math.floor(100000 + Math.random() * 900000);
    localStorage.setItem('f7_code', gameCode);
    await set(ref(db, 'games/' + gameCode), { host: myName, round: 1, players: {} });
    joinGame(gameCode);
};

window.openJoinPopup = () => {
    let c = prompt("Enter 6-digit Code:");
    if(c) { gameCode = c; localStorage.setItem('f7_code', c); joinGame(c); }
};

window.resumeGame = () => joinGame(gameCode);

async function joinGame(code) {
    await update(ref(db, `games/${code}/players/${myName}`), { name: myName, grandTotal: 0, submitted: false });
    onValue(ref(db, `games/${code}`), syncGame);
    showScreen('game-screen');
}

window.submitRound = async () => {
    let sum = usedCards.reduce((a, b) => a + b, 0);
    let total = isBusted ? 0 : (sum * multipliers) + bonus;
    
    await update(ref(db, `games/${gameCode}/players/${myName}`), { 
        lastScore: total, 
        grandTotal: increment(total),
        submitted: true 
    });
    
    document.getElementById('calc-view').style.display = 'none';
    document.getElementById('waiting-view').style.display = 'block';
};

function syncGame(snap) {
    const data = snap.val();
    if(!data) return;
    
    const players = Object.values(data.players);
    const allSubmitted = players.every(p => p.submitted === true);
    
    // Update Leaderboard
    let lb = document.getElementById('leaderboard');
    lb.innerHTML = "";
    players.sort((a,b) => b.grandTotal - a.grandTotal).forEach(p => {
        lb.innerHTML += `<div class="p-row"><span>${p.name}</span><span>${p.grandTotal}</span></div>`;
    });

    // Show Orange Button if everyone is done
    document.getElementById('nextRoundBtn').style.display = allSubmitted ? 'block' : 'none';
    
    // If round has reset (Host triggered), go back to calculator
    if(players.every(p => p.submitted === false)) {
        resetLocalRound();
    }
}

function resetLocalRound() {
    usedCards = []; multipliers = 1; bonus = 0; isBusted = false;
    localStorage.setItem('f7_used', "[]");
    updateUI();
    document.getElementById('calc-view').style.display = 'block';
    document.getElementById('waiting-view').style.display = 'none';
}

window.readyForNextRound = async () => {
    // Each player resets their own 'submitted' status to false to clear the leaderboard lock
    await update(ref(db, `games/${gameCode}/players/${myName}`), { submitted: false });
};
