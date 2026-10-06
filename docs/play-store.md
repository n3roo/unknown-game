# UNKNOWN im Google Play Store

Die App ist eine PWA; für den Store wird sie als „Trusted Web Activity" (TWA) verpackt – dieselbe Seite, kein zweiter Code.

## 1. Paket erzeugen (ohne Android Studio)
1. https://www.pwabuilder.com öffnen, `https://unknown-game-g5ew.onrender.com/` eingeben.
2. „Package for stores" → Android → Paketname z. B. `de.unknown.game`, Name „UNKNOWN".
3. „Signing key": neu erzeugen lassen lassen und die **.keystore + Passwörter sicher aufbewahren** (ohne sie keine Updates!).
4. Download: `.aab` (Play Store) und die angezeigte **SHA-256-Fingerprint**.

## 2. Domain mit der App verknüpfen
In Render → Environment:
- `ANDROID_PACKAGE` = Paketname (z. B. `de.unknown.game`)
- `ANDROID_SHA256` = Fingerprint (bei Play App Signing: den Fingerprint aus der Play Console → Setup → App-Signatur nehmen, ggf. beide mit Komma)
Danach liefert `/.well-known/assetlinks.json` automatisch die Verknüpfung (ohne sie zeigt die App eine Adressleiste).

## 3. Play Console (einmalig 25 $)
- Entwicklerkonto anlegen, App „UNKNOWN" (Spiel, kostenlos), .aab hochladen.
- Datenschutzerklärung: `https://unknown-game-g5ew.onrender.com/datenschutz.html` (Platzhalter vorher ausfüllen!)
- Datensicherheit: Name/E-Mail (Konto), Spielstand; keine Weitergabe.
- Altersfreigabe-Fragebogen: Spiel, leichte Fantasy-Waffen („Revolver" in Karten-Optik), keine Gewalt gegen Menschen dargestellt, Chat nur Kurz-Reaktionen.
- Screenshots: `public/assets/store/screen-1..3.png` (824×1648), Feature-Grafik 1024×500 noch zu erstellen.
- Neue private Entwicklerkonten: 12 Tester müssen 14 Tage testen, bevor die Veröffentlichung freigegeben wird.

## 4. Store-Texte
Kurz (80): Wer ist UNKNOWN? Spiele Karten, rate mit Freunden die geheime Karte.
Lang: Online-Deduktionsspiel für 2–4 Spieler. Jeder hält eine geheime Karte, die nur die anderen sehen. Spiele Karten aus, sammle Hinweise ("passt" / "passt nicht") und errate Charakter, Accessoire und Ort deiner eigenen Karte. Mit Freunden per Code, Ranked mit Ligen, Avatare, Hüte und Shop.

## 5. Noch offen für „Echtgeld" und „Werbung"
Play Billing (Käufe) und AdMob brauchen eine native Hülle (Capacitor) statt der reinen TWA; die Server-Seite (Kauf-Ledger, Belohnungs-Prüfung) ist vorbereitet bzw. folgt.
