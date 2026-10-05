# UNKNOWN

Online-Deduktionsspiel für 2–4 Spieler (angelehnt an das Kartenspiel Deduckto).

## Starten
    npm install
    npm start          # http://localhost:10000
    npm test

Render: Docker-Deployment mit dem mitgelieferten Dockerfile.

## Aufbau
- `server.js`        HTTP + WebSocket, Räume, Wiederverbinden
- `lib/game.js`      komplette Spiellogik (keine Netzwerk-/Anzeige-Abhängigkeit)
- `public/`          App (index.html, css/, js/app.js)
- `public/data/sets.json`     Kartensets (7 Charaktere pro Set; Accessoires und Orte sind für alle Sets gleich)
- `public/data/avatars.json`  die 12 Avatare (Bilder optional unter `public/assets/avatars/<id>.png`)
- `test/`            automatische Tests

## Neues Kartenset hinzufügen
1. 7 Charakterbilder nach `public/assets/characters/` legen.
2. In `public/data/sets.json` unter `sets` einen Eintrag mit 7 Charakteren ergänzen.
Die 49 Karten entstehen automatisch: Ort = (Charakter + Accessoire) mod 7.

## Avatar-Bilder einbauen
`public/assets/avatars/<id>.png` (IDs siehe avatars.json). Fehlt ein Bild, wird das Emoji gezeigt.
