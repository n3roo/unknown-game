import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

import {
  createGame,
  startGame,
  related,
  sameCard,
  publicState
} from "./game.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 10000;

const game = createGame();

function send(ws, data) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast() {
  game.players.forEach((player, index) => {
    if (player.ws && player.connected) {
      send(player.ws, {
        type: "state",
        state: publicState(game, index)
      });
    }
  });
}

function nextTurn() {
  game.current =
    (game.current + 1) % game.players.length;
}

function finishPlay() {

  const pending = game.pending;

  if (!pending || pending.type !== "play") {
    return;
  }

  const player = game.players[pending.player];

  const relatedVotes =
    pending.votes.filter(v => v.choice === "related").length;

  const notRelatedVotes =
    pending.votes.filter(v => v.choice === "notRelated").length;

  const isRelated =
    relatedVotes >= notRelatedVotes;

  if (isRelated) {
    player.related.push(pending.card);
  } else {
    player.notRelated.push(pending.card);
  }

  if (game.deck.length > 0) {
    player.hand.push(game.deck.pop());
  }

  game.pending = null;

  nextTurn();

  broadcast();
}

const server = http.createServer((req, res) => {

  if (req.url === "/" || req.url === "/index.html") {

    const html = fs.readFileSync(
      path.join(__dirname, "index.html"),
      "utf8"
    );

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8"
    });

    res.end(html);

    return;
  }

  if (req.url === "/health") {

    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8"
    });

    res.end("UNKNOWN server online");

    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

const wss = new WebSocketServer({
  server
});

wss.on("connection", ws => {

  let playerIndex = -1;

  send(ws, {
    type: "connected"
  });

  ws.on("message", raw => {

    try {

      const msg = JSON.parse(raw.toString());

      // -------------------------
      // LOBBY ERSTELLEN
      // -------------------------

      if (msg.type === "create") {

        if (game.phase !== "lobby") {
          send(ws, {
            type: "error",
            message: "Das Spiel läuft bereits."
          });
          return;
        }

        if (game.players.length >= 4) {
          send(ws, {
            type: "error",
            message: "Das Spiel ist bereits voll."
          });
          return;
        }

        const player = {

          id: crypto.randomUUID(),

          name:
            msg.name ||
            `Spieler ${game.players.length + 1}`,

          ws,

          connected:true,

          secret:null,

          hand:[],

          related:[],

          notRelated:[],

          relatedFlipped:false,

          notRelatedFlipped:false

        };

        game.players.push(player);

        playerIndex =
          game.players.length - 1;

        send(ws, {
          type:"room",
          room:"UNKNOWN"
        });

        broadcast();

        return;
      }

      // -------------------------
      // LOBBY BEITRETEN
      // -------------------------

      if (msg.type === "join") {

        if (game.phase !== "lobby") {

          send(ws, {
            type:"error",
            message:"Das Spiel läuft bereits."
          });

          return;
        }

        if (game.players.length >= 4) {

          send(ws, {
            type:"error",
            message:"Das Spiel ist bereits voll."
          });

          return;
        }

        const player = {

          id:crypto.randomUUID(),

          name:
            msg.name ||
            `Spieler ${game.players.length + 1}`,

          ws,

          connected:true,

          secret:null,

          hand:[],

          related:[],

          notRelated:[],

          relatedFlipped:false,

          notRelatedFlipped:false

        };

        game.players.push(player);

        playerIndex =
          game.players.length - 1;

        send(ws, {
          type:"room",
          room:"UNKNOWN"
        });

        broadcast();

        return;
      }

      // -------------------------
      // SPIEL STARTEN
      // -------------------------

      if (msg.type === "start") {

        if (game.phase !== "lobby") {
          return;
        }

        if (game.players.length < 2) {

          send(ws, {
            type:"error",
            message:"Mindestens 2 Spieler werden benötigt."
          });

          return;
        }

        startGame(game);

        broadcast();

        return;
      }

      // -------------------------
      // KARTE SPIELEN
      // -------------------------

      if (msg.type === "play") {

        if (game.phase !== "playing") {
          return;
        }

        if (game.pending) {
          return;
        }

        if (playerIndex !== game.current) {
          return;
        }

        const player =
          game.players[playerIndex];

        const cardIndex =
          Number(msg.cardIndex);

        if (
          !Number.isInteger(cardIndex) ||
          cardIndex < 0 ||
          cardIndex >= player.hand.length
        ) {
          return;
        }

        const card =
          player.hand.splice(
            cardIndex,
            1
          )[0];

        game.pending = {

          type:"play",

          player:playerIndex,

          card,

          votes:[]

        };

        broadcast();

        return;
      }

      // -------------------------
      // RELATED / NOT RELATED
      // -------------------------

      if (msg.type === "vote") {

        if (
          game.phase !== "playing" ||
          !game.pending ||
          game.pending.type !== "play"
        ) {
          return;
        }

        const voter = playerIndex;

        // Der aktive Spieler darf nicht abstimmen.
        if (voter === game.pending.player) {
          return;
        }

        // Jeder Spieler darf nur einmal abstimmen.
        if (
          game.pending.votes.some(
            v => v.player === voter
          )
        ) {
          return;
        }

        if (
          msg.choice !== "related" &&
          msg.choice !== "notRelated"
        ) {
          return;
        }

        game.pending.votes.push({
          player:voter,
          choice:msg.choice
        });

        const required =
          game.players.length - 1;

        if (
          game.pending.votes.length >= required
        ) {
          finishPlay();
        } else {
          broadcast();
        }

        return;
      }

      // -------------------------
      // IDENTITÄT RATEN
      // -------------------------

      if (msg.type === "guess") {

        if (game.phase !== "playing") {
          return;
        }

        if (game.pending) {
          return;
        }

        if (playerIndex !== game.current) {
          return;
        }

        const player =
          game.players[playerIndex];

        if (
          sameCard(
            player.secret,
            msg.guess
          )
        ) {

          game.phase = "finished";

          game.winner = player.id;

          broadcast();

          return;
        }

        game.pending = {

          type:"guess",

          player:playerIndex,

          guess:msg.guess

        };

        broadcast();

        return;
      }

      // -------------------------
      // STAPEL NACH FALSCHEM TIPP
      // -------------------------

      if (msg.type === "flip") {

        if (
          !game.pending ||
          game.pending.type !== "guess"
        ) {
          return;
        }

        if (
          game.pending.player !== playerIndex
        ) {
          return;
        }

        const player =
          game.players[playerIndex];

        if (msg.pile === "related") {

          player.relatedFlipped = true;

        } else if (
          msg.pile === "notRelated"
        ) {

          player.notRelatedFlipped = true;

        } else {

          return;

        }

        game.pending = null;

        nextTurn();

        broadcast();

        return;
      }

    } catch (error) {

      console.error(
        "Message error:",
        error
      );

    }

  });

  ws.on("close", () => {

    if (
      playerIndex >= 0 &&
      game.players[playerIndex]
    ) {

      game.players[playerIndex].connected = false;

      game.players[playerIndex].ws = null;

      broadcast();

    }

  });

});

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `UNKNOWN server listening on port ${PORT}`
    );

  }
);
