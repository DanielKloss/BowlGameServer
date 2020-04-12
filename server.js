class Player {
    constructor(username, id) {
        this.username = username;
        this.socketId = id;
    }
}

class Turn {
    constructor(words, clueGiver, teamNumber, guessers, waiters) {
        this.words = words;
        this.clueGiver = clueGiver;
        this.teamNumber = teamNumber;
        this.waiters = waiters;
        this.guessers = guessers;
        this.guessedWords = [];
        this.time = 60;
    }
}

class Team {
    constructor(teamNumber) {
        this.teamNumber = teamNumber;
        this.score = 0;
        this.players = [];
        this.previousClueGiver = 0;
    }
}

class Room {
    constructor(roomNumber, numberOfTeams, words) {
        this.roomNumber = roomNumber;
        this.teams = [];
        this.words = words;
        this.roundWords = [];
        this.turn;

        for (var i = 0; i < numberOfTeams; i++) {
            this.teams.push(new Team(i + 1));
        }
    }
}

const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);

port = process.env.PORT || 5000;

rooms = [];
var timer;

http.listen(port, () => {
    console.log("started on port " + port);
});

function checkRoomNumber(roomNumber) {
    console.log("checking roomNumber: " + roomNumber);
    let room = rooms.find(r => r.roomNumber == roomNumber);
    if (room != null && room != undefined) {
        console.log("ROOM VALID");
        return true;
    } else {
        console.log("ROOM INVALID");
        return false;
    }
}

function checkUsername(username, roomNumber) {
    console.log("checking username: " + username);
    for (var i = 0; i < rooms.find(r => r.roomNumber == roomNumber).teams.length; i++) {
        if (rooms.find(r => r.roomNumber == roomNumber).teams[i].players.filter(p => p.username == username).length > 0) {
            console.log("USERNAME INVALID");
            return false;
        }
    }
    console.log("USERNAME VALID");
    return true;
}

function assignTeam(username, socketId, roomNumber) {
    let teams = []
    for (var i = 0; i < rooms.find(r => r.roomNumber == roomNumber).teams.length; i++) {
        let numberOfPlayers = rooms.find(r => r.roomNumber == roomNumber).teams[i].players.length;
        console.log("team " + i + " has: " + numberOfPlayers);
        teams.push(numberOfPlayers);
    }

    let teamToAddTo = Number(teams.indexOf(Math.min.apply(Math, teams)));
    console.log("team " + teamToAddTo + " has the fewst players");
    rooms.find(r => r.roomNumber == roomNumber).teams[teamToAddTo].players.push(new Player(username, socketId));
    console.log("added " + username + "to team " + teamToAddTo);
    return teamToAddTo + 1;
}

function setupNewTurn(roomNumber, newTurnReason) {
    let clueGiver;
    let teamNumber;
    let guessers = [];
    let waiters = [];

    let room = rooms.find(r => r.roomNumber == roomNumber);

    if (newTurnReason == "newGame") {
        room.roundWords = room.words.slice();
        teamNumber = 1;
        clueGiver = room.teams[teamNumber - 1].players[0];

        for (var i = 0; i < room.teams.length; i++) {
            if (room.teams[i].teamNumber != teamNumber) {
                for (var j = 0; j < room.teams[i].players.length; j++) {
                    waiters.push(room.teams[i].players[j]);
                }
            } else {
                for (var j = 0; j < room.teams[i].players.length; j++) {
                    if (room.teams[i].players[j] != clueGiver) {
                        guessers.push(room.teams[i].players[j]);
                    }
                }
            }
        }

        room.turn = new Turn(room.words.slice(), clueGiver, teamNumber, guessers, waiters);
        return room.turn;
    } else if (newTurnReason == "newRound") {
        console.log("new Round");
        room.teams[room.turn.teamNumber - 1].previousClueGiver = Number(room.teams[room.turn.teamNumber - 1].players.indexOf(room.turn.clueGiver));
        room.roundWords = room.words.slice();
        room.turn.words = room.roundWords.slice();
        room.turn.guessedWords = [];
        return room.turn;
    } else if (newTurnReason == "newTurn") {
        console.log("new turn");
        room.teams[room.turn.teamNumber - 1].previousClueGiver = Number(room.teams[room.turn.teamNumber - 1].players.indexOf(room.turn.clueGiver));
        room.turn.time = 60;
        room.turn.guessedWords = [];
        room.turn.waiters = [];
        room.turn.guessers = [];

        if (room.turn.teamNumber < room.teams.length) {
            room.turn.teamNumber++;
        } else {
            room.turn.teamNumber = 1;
        }

        console.log("previous clue giver " + room.teams[room.turn.teamNumber - 1].previousClueGiver + 1);
        console.log("team players  " + room.teams[room.turn.teamNumber - 1].players);
        console.log("new Clue giver should be " + room.teams[room.turn.teamNumber - 1].players[room.teams[room.turn.teamNumber - 1].previousClueGiver + 1]);

        if (room.teams[room.turn.teamNumber - 1].previousClueGiver + 1 == room.teams[room.turn.teamNumber - 1].players.length) {
            room.turn.clueGiver = room.teams[room.turn.teamNumber - 1].players[0];
        } else {
            room.turn.clueGiver = room.teams[room.turn.teamNumber - 1].players[room.teams[room.turn.teamNumber - 1].previousClueGiver + 1];
        }

        console.log("new clue giver is " + room.turn.clueGiver);

        for (var i = 0; i < room.teams.length; i++) {
            if (room.teams[i].teamNumber != room.turn.teamNumber) {
                for (var j = 0; j < room.teams[i].players.length; j++) {
                    room.turn.waiters.push(room.teams[i].players[j]);
                }
            } else {
                for (var j = 0; j < room.teams[i].players.length; j++) {
                    if (room.teams[i].players[j] != room.turn.clueGiver) {
                        room.turn.guessers.push(room.teams[i].players[j]);
                    }
                }
            }
        }
    }
}

function endTurn(roomNumber) {
    clearInterval(timer);
    let room = rooms.find(r => r.roomNumber == roomNumber);

    setupNewTurn(room.roomNumber, "newTurn");

    io.to(room.roomNumber).emit("lobby", JSON.stringify({ roundInstructions: "Guess the clues" }));
    io.to(room.turn.clueGiver.socketId).emit("startTurnButton");
}

function getPercentageWordsLeft(roomNumber) {
    let room = rooms.find(r => r.roomNumber == roomNumber);

    let percentage = (room.roundWords.length / room.words.length) * 100;

    console.log(room.roundWords.length + " / " + room.words.length + " * 100 = " + percentage);

    return Math.round(percentage);
}

io.on('connection', socket => {
    socket.on("createRoom", (data) => {
        roomNumber = socket.id.slice(0, 4).toUpperCase();
        socket.join(roomNumber);
        rooms.push(new Room(roomNumber, data.numberOfTeams, data.submissions));

        let team = assignTeam(data.username, socket.id, roomNumber);
        socket.emit("createdRoom", JSON.stringify({ roomNumber: roomNumber, team: team }));
        socket.emit("startTurnButton");

        console.log("Room " + roomNumber + " created successfully");
        console.log(data.submissions + " added to " + roomNumber);
    });

    socket.on("joinRoom", (data) => {
        if (!checkRoomNumber(data.roomNumber)) {
            socket.emit("err", "Invalid room number");
            return;
        }

        if (!checkUsername(data.username, data.roomNumber)) {
            socket.emit("err", "Invalid Username");
            return;
        }

        socket.join(data.roomNumber);

        for (var i = 0; i < data.submissions.length; i++) {
            rooms.find(r => r.roomNumber == data.roomNumber).words.push(data.submissions[i]);
        }

        let team = assignTeam(data.username, socket.id, data.roomNumber);

        socket.emit("joinedRoom", JSON.stringify({ roomNumber: data.roomNumber, team: team }));

        console.log(data.submissions + " added to " + data.roomNumber);

        let newPlayers = rooms.find(r => r.roomNumber == data.roomNumber).teams;
        io.to(data.roomNumber).emit('newPlayerJoined', newPlayers);
    });

    socket.on("startTurn", (data) => {
        let room = rooms.find(r => r.roomNumber == data.roomNumber);
        if (room.turn == undefined) {
            setupNewTurn(data.roomNumber, "newGame");
        }

        console.log("sending new turn details to players");

        let wordsLeft = room.roundWords.length;
        let percantageWordsGuessed = getPercentageWordsLeft(room.roomNumber);

        io.to(room.turn.clueGiver.socketId).emit("cluer", JSON.stringify({ word: room.turn.words[Math.floor(Math.random() * room.turn.words.length)], clueGiver: room.turn.clueGiver.username, teamNumber: room.turn.teamNumber, time: room.turn.time, wordsLeft: wordsLeft, percantageWordsGuessed: percantageWordsGuessed }));

        for (var i = 0; i < room.turn.guessers.length; i++) {
            io.to(room.turn.guessers[i].socketId).emit("guessing", JSON.stringify({ clueGiver: room.turn.clueGiver.username, teamNumber: room.turn.teamNumber, time: room.turn.time, wordsLeft: wordsLeft, percantageWordsGuessed: percantageWordsGuessed }));
        }

        for (var i = 0; i < room.turn.waiters.length; i++) {
            io.to(room.turn.waiters[i].socketId).emit("waiting", JSON.stringify({ clueGiver: room.turn.clueGiver.username, teamNumber: room.turn.teamNumber, time: room.turn.time, wordsLeft: wordsLeft, percantageWordsGuessed: percantageWordsGuessed }));
        }

        timer = setInterval(endTurn, room.turn.time * 1000, data.roomNumber);
    });

    socket.on("gotClue", (data) => {
        let room = rooms.find(r => r.roomNumber == data.roomNumber);
        let team = room.teams.find(t => t.teamNumber == room.turn.teamNumber);
        team.score++;
        console.log("added 1 to team " + team.teamNumber + " score: " + team.score);
        room.turn.guessedWords.push(data.gotClue);
        room.turn.words.splice(room.turn.words.indexOf(data.gotClue), 1);
        room.roundWords.splice(room.roundWords.indexOf(data.gotClue), 1);
        console.log("added " + data.gotClue + " to guessed words and removed from round words");

        let wordsLeft = room.roundWords.length;
        let percantageWordsGuessed = getPercentageWordsLeft(room.roomNumber);

        for (var i = 0; i < room.turn.guessers.length; i++) {
            console.log("sending to guesser: " + room.turn.guessers[i].username);
            io.to(room.turn.guessers[i].socketId).emit("newClueResult", JSON.stringify({ word: data.gotClue, wordsLeft: wordsLeft, percantageWordsGuessed: percantageWordsGuessed }));
        }

        for (var i = 0; i < room.turn.waiters.length; i++) {
            console.log("sending to waiter: " + room.turn.waiters[i].username);
            io.to(room.turn.waiters[i].socketId).emit("newClueResult", JSON.stringify({ word: data.gotClue, wordsLeft: wordsLeft, percantageWordsGuessed: percantageWordsGuessed }));
        }

        console.log("sent clue result to players");

        if (room.turn.words.length == 0) {
            console.log("end of round - all words guessed");
            let turn = setupNewTurn(room.roomNumber, "newRound");

            console.log("sent all players to lobby");
            io.to(room.roomNumber).emit("lobby", JSON.stringify({ roundInstructions: "Guess the clues" }));
            io.to(turn.clueGiver.socketId).emit("startTurnButton");
        } else {
            console.log("sent new clue");
            io.to(room.turn.clueGiver.socketId).emit("newClue", JSON.stringify({ word: room.turn.words[Math.floor(Math.random() * room.turn.words.length)], wordsLeft: wordsLeft, percantageWordsGuessed: percantageWordsGuessed  }));
        }
    });
});