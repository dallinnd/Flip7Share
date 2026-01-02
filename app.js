import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// 1. Setup Firebase
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
let currentGameCode = null;
let myName = "";

// 2. Global Navigation
window.showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'block';
};

// 3. Host Logic
document.getElementById('hostBtn').onclick = async () => {
    myName = prompt("Enter your Name:") || "Host";
    currentGameCode = Math.floor(100000 + Math.random() * 900000);
    
    await set(ref(db, 'games/' + currentGameCode), {
        host: myName,
        players: { [myName]: { score: 0 } }
    });

    document.getElementById('endGameBtn').style.display = 'block';
    startTracking();
};

// 4. Join Logic
document.getElementById('joinBtn').onclick = () => {
    currentGameCode = prompt("Enter 6-digit code:");
    myName = prompt("Enter your Name:");
    
    update(ref(db, `games/${currentGameCode}/players/${myName}`), {
        score: 0
    });
    startTracking();
};

// 5. Real-time Updates
function startTracking() {
    document.getElementById('roomCodeDisplay').innerText = `Code: ${currentGameCode}`;
    showScreen('game-screen');

    onValue(ref(db, `games/${currentGameCode}/players`), (snapshot) => {
        const players = snapshot.val();
        const list = document.getElementById('leaderboard');
        list.innerHTML = "<h3>Leaderboard</h3>";
        
        for (let name in players) {
            list.innerHTML += `<p><strong>${name}:</strong> ${players[name].score}</p>`;
        }
    });
}

// 6. Submit Score
document.getElementById('submitScoreBtn').onclick = () => {
    const pts = parseInt(document.getElementById('pointsInput').value) || 0;
    const scoreRef = ref(db, `games/${currentGameCode}/players/${myName}/score`);
    
    // Simple update logic (could be improved to add to existing score)
    update(ref(db, `games/${currentGameCode}/players/${myName}`), {
        score: pts
    });
};
