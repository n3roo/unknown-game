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

## Ranked, Gold & Hüte

- **Profil**: anonym, per Geräteschlüssel (localStorage, auch als „Wiederherstellungs-Code“ im Konto-Dialog). Gold, Hüte, Rang, Level.
- **Gold**: Sieg 40 / Teilnahme 10 (max. 6 Gold-Partien pro Tag), Ranked Sieg 120 / Teilnahme 30, erster Sieg des Tages +60.
- **Ranked**: Rating ab 1000 (Elo-Variante), Matchmaking 2–4 Spieler, Ligen Bronze → Meister mit einmaligen Belohnungen (Gold + Liga-Hut), Rangliste weltweit und pro Land.
- **Hüte**: 12 kaufbare + 5 Liga-Hüte (`public/js/hats.js`, `public/data/hats.json`), Ankerpunkte je Avatar in `avatars.json` (`hat`).
- **Speicher** (Umgebungsvariablen): `TURSO_URL` + `TURSO_TOKEN` (kostenlose Turso-DB, empfohlen für Render Free), oder `DATA_FILE=/pfad/profiles.json` (Datei, braucht persistenten Datenträger). Ohne beides: nur Arbeitsspeicher – Profile gehen beim Neustart verloren.

## Tagesbelohnung, Missionen, Tutorial, Aliens-Set

- **Tagesbelohnung**: 7-Tage-Serie (20/30/40/50/60/80/150 Gold), Tag = Kalendertag in Deutschland. Tägliche Missionen (3 pro Tag) in `lib/missions.js`.
- **Tutorial**: 3 Seiten beim ersten Spiel (`unknown.tutorial` in localStorage), später über „Spielregeln“.
- **Aliens-Set**: Vorbereitung und alle 49 ChatGPT-Prompts in `docs/aliens-set.md`.
- **Rechtliches**: `public/datenschutz.html` und `public/impressum.html` sind Entwürfe mit Platzhaltern in [eckigen Klammern].
- **Karten einbauen**: `python3 tools/process_cards.py <Nr>=<Datei> ...` aus dem Repo-Hauptordner (trägt die Karte auch in `sets.json` ein).

## Bots in Ranked
Ranked-Suche fällt nach 15 s auf Bots zurück (nur Anlaufphase). Abschalten: auf Render die Umgebungsvariable `RANKED_BOTS=off` setzen. Die Übungsrunde „Gegen Bots üben“ bleibt immer verfügbar.

## Partien überstehen Neustarts
Laufende Räume werden gebündelt (alle 0,8 s bei Änderungen) im Store gesichert (Turso-Tabelle `rooms`, sonst Datei/Speicher) und beim Start wiederhergestellt. Bei SIGTERM (Render-Update) wird vorher noch gesichert. Spieler verbinden sich automatisch wieder (Token im Browser).

## Freunde
Freundescode = erste 8 Zeichen der Profil-ID (`ABCD-1234`). Anfrage per Code oder Link `/?friend=ABCD1234`, annehmen/ablehnen/entfernen, Online-Status, Freunde in die eigene Lobby einladen (Popup beim Freund) und Lobby eines Freundes direkt beitreten. Logik in `lib/friends.js`.
