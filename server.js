import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

import {
  createGame,
  startGame,
  related,
  publicState
} from "./game.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 10000;

const game = createGame();

function send(ws, data) {
  ws.send(JSON.stringify(data));
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

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  let playerIndex = -1;

  send(ws, {
    type: "connected"
  });

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === "create") {
        if (game.players.length >= 4) {
          send(ws, {
            type: "error",
            message: "Das Spiel ist bereits voll."
          });
          return;
        }

        const player = {
          id: crypto.randomUUID(),
          name: msg.name || `Spieler ${game.players.length + 1}`,
          ws,
          connected: true,
          secret: null,
          hand: [],
          related: [],
          notRelated: [],
          flipped: null
        };

        game.players.push(player);
        playerIndex = game.players.length - 1;

        send(ws, {
          type: "room",
          room: "UNKNOWN"
        });

        broadcast();
        return;
      }

      if (msg.type === "join") {
        if (game.players.length >= 4) {
          send(ws, {
            type: "error",
            message: "Das Spiel ist bereits voll."
          });
          return;
        }

        const player = {
          id: crypto.randomUUID(),
          name: msg.name || `Spieler ${game.players.length + 1}`,
          ws,
          connected: true,
          secret: null,
          hand: [],
          related: [],
          notRelated: [],
          flipped: null
        };

        game.players.push(player);
        playerIndex = game.players.length - 1;

        send(ws, {
          type: "room",
          room: "UNKNOWN"
        });

        broadcast();
        return;
      }

      if (msg.type === "start") {
        if (game.players.length < 2) {
          send(ws, {
            type: "error",
            message: "Mindestens 2 Spieler werden benötigt."
          });
          return;
        }

        if (game.phase !== "lobby") {
          return;
        }

        startGame(game);
        broadcast();
        return;
      }

      if (msg.type === "play") {
        if (game.phase !== "playing") return;
        if (playerIndex !== game.current) return;

        const player = game.players[playerIndex];
        const cardIndex = Number(msg.cardIndex);

        if (
          !Number.isInteger(cardIndex) ||
          cardIndex < 0 ||
          cardIndex >= player.hand.length
        ) {
          return;
        }

        const card = player.hand.splice(cardIndex, 1)[0];

        const isRelated = related(card, player.secret);

        if (isRelated) {
          player.related.push(card);
        } else {
          player.notRelated.push(card);
        }

        if (game.deck.length > 0) {
          player.hand.push(game.deck.pop());
        }

        game.current =
          (game.current + 1) % game.players.length;

        broadcast();
        return;
      }

      if (msg.type === "guess") {
        if (game.phase !== "playing") return;
        if (playerIndex !== game.current) return;

        const player = game.players[playerIndex];

        const guess = msg.guess;

        const correct =
          guess &&
          guess.c === player.secret.c &&
          guess.a === player.secret.a &&
          guess.l === player.secret.l;

        if (correct) {
          game.phase = "finished";
          game.winner = player.id;
          broadcast();
          return;
        }

        game.pending = {
          player: playerIndex
        };

        broadcast();
        return;
      }

      if (msg.type === "flip") {
        if (!game.pending) return;
        if (game.pending.player !== playerIndex) return;

        const player = game.players[playerIndex];

        if (msg.pile === "related") {
          player.flipped = "related";
        }

        if (msg.pile === "notRelated") {
          player.flipped = "notRelated";
        }

        game.pending = null;

        game.current =
          (game.current + 1) % game.players.length;

        broadcast();
        return;
      }
    } catch (error) {
      console.error("Message error:", error);
    }
  });

  ws.on("close", () => {
    if (playerIndex >= 0 && game.players[playerIndex]) {
      game.players[playerIndex].connected = false;
      game.players[playerIndex].ws = null;
      broadcast();
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`UNKNOWN server listening on port ${PORT}`);
});
