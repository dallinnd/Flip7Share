import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, update, onValue, increment, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ... [Pasted Firebase Config from previous step] ...

const db = getDatabase(app);
let currentRunningTotal = 0;
let currentMultiplier = 1;
let currentBonus = 0;
let isBusted = false;

// 1. Calculator Logic
window.addValue = (val) => {
    if (isBusted) return;
    currentRunningTotal += val;
    renderDisplay();
};

window.setMultiplier = (m) => {
    currentMultiplier = m;
    renderDisplay();
};

window.addMod = (b) => {
    currentBonus += b;
    renderDisplay();
};

window.handleBust = () => {
    isBusted = true;
    currentRunningTotal = 0;
    currentMultiplier = 1;
    currentBonus = 0;
    renderDisplay();
};

function renderDisplay() {
    const total = (currentRunningTotal * currentMultiplier) + currentBonus;
    document.getElementById('calc-display').innerText = isBusted ? "BUSTED" : `Total: ${total}`;
}

// 2. Score Submission
window.submitScore = async () => {
    const name = document.getElementById('userNameInput').value;
    const roundPoints = isBusted ? 0 : (currentRunningTotal * currentMultiplier) + currentBonus;

    const playerRef = ref(db, `games/${gameCode}/players/${name}`);
    
    // Update local round score and atomically add to grand total
    await update(playerRef, {
        lastRound: roundPoints,
        grandTotal: increment(roundPoints)
    });

    // Reset Calculator for next round
    handleBust(); 
    isBusted = false; 
};

// 3. Name Editing
window.toggleNameEdit = () => {
    const input = document.getElementById('userNameInput');
    input.readOnly = !input.readOnly;
    if (!input.readOnly) input.focus();
};
