# Set 2: Aliens (Sci-Fi) – Vorbereitung

Das Aliens-Set nutzt dieselben 7 Accessoires und 7 Orte wie Wild West. Neu sind nur die **7 Charaktere**. Die Spiellogik bleibt gleich:
Ort = (Charakter + Accessoire) mod 7. Kartennummer = Charakter × 7 + Accessoire.

Orte (Zahl = Ergebnis der Rechnung): 0 Büro, 1 Vulkan, 2 Strand, 3 Berge, 4 Weltraum, 5 Unterwasserwelt, 6 Nachtclub.

## So gehst du vor (ChatGPT)

1. Pro Charakter einen eigenen Chat öffnen. Zuerst das **Charakter-Referenzbild** erzeugen lassen (Ganzkörper, vor schlichtem Hintergrund).
2. Danach die 7 Karten dieses Charakters nacheinander im selben Chat erzeugen. Dazu immer den Zusatz anhängen: „Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild.“
3. Die fertigen Karten als PNG hier einsenden, ich schneide sie zu und baue sie ein (`tools/process_cards.py`).

## Stil-Vorlage (am Anfang jedes Prompts)

> Gemaltes, hochwertiges Sammelkarten-Artwork im Stil von sehr detaillierter digitaler Malerei (realistisch, filmisch, satte Farben). Hochformat 2:3. Ganzkörperfigur in der Mitte, leicht von unten fotografiert, dazu ein dekorativer Rahmen wie bei einer alten Spielkarte (cremefarbenes Pergament, dunkle Zierecken mit Schnörkeln). Nichts anderes im Bild, kein Text, keine Zahlen, kein Logo.

## Charaktere

0. **Raumkapitänin Nova**: eine selbstbewusste Raumschiff-Kapitänin mit silbernem Fliegeranzug, Schulterpolstern, kurzem Haar und einer kleinen Laserpistole am Gürtel
1. **Roboter-Butler**: ein elegant gebauter Retro-Roboter aus gebürstetem Chrom mit Fliege, leuchtend blauen Augen und höflich verschränkten Händen
2. **Alien-Forscher**: ein dünner grauer Außerirdischer mit riesigen schwarzen Augen, weißem Laborkittel, Klemmbrett und neugierigem Blick
3. **Weltraum-Pirat**: ein verwegener Weltraum-Pirat mit Augenklappe, Cyborg-Arm, langem Ledermantel und Narbe im Gesicht
4. **Cyborg-Söldner**: ein massiger Cyborg-Söldner in dunkler Kampfrüstung mit glimmenden roten Gelenken und einem großen Blaster
5. **Mondblob**: ein rundes, freundliches grünes Blob-Alien mit zwei Fühlern, drei Augen und kurzen Stummelärmchen
6. **Sternen-Priesterin**: eine mystische Priesterin in fließenden, leuchtend violetten Roben mit Sternenmuster und schwebenden Lichtpunkten um die Hände

## Referenzbild-Prompt (pro Charakter)

> Ganzkörper-Charakterdesign von [CHARAKTER-BESCHREIBUNG], Frontalansicht, stehend, neutraler Hintergrund, gleiche Stil-Vorlage wie oben, ohne Hut und ohne Kopfschmuck.

## Alle 49 Karten

### Charakter 0: Raumkapitänin Nova

**Karte 0 – Raumkapitänin Nova · Sombrero · Büro**

> Raumkapitänin Nova: eine selbstbewusste Raumschiff-Kapitänin mit silbernem Fliegeranzug, Schulterpolstern, kurzem Haar und einer kleinen Laserpistole am Gürtel. Trägt einen großen bunten Sombrero. Hintergrund: ein modernes Büro mit großen Glasfenstern und Wolkenkratzer-Skyline. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 1 – Raumkapitänin Nova · Zylinder · Vulkan**

> Raumkapitänin Nova: eine selbstbewusste Raumschiff-Kapitänin mit silbernem Fliegeranzug, Schulterpolstern, kurzem Haar und einer kleinen Laserpistole am Gürtel. Trägt einen schwarzen Zylinder mit rotem Band. Hintergrund: ein ausbrechender Vulkan mit Lava und Rauchwolken. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 2 – Raumkapitänin Nova · Partyhut · Strand**

> Raumkapitänin Nova: eine selbstbewusste Raumschiff-Kapitänin mit silbernem Fliegeranzug, Schulterpolstern, kurzem Haar und einer kleinen Laserpistole am Gürtel. Trägt einen bunten Partyhut mit Punkten und rotem Bommel. Hintergrund: ein tropischer Strand mit Palmen, türkisfarbenem Meer, Strohhütte und einem Segelschiff am Horizont. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 3 – Raumkapitänin Nova · Sonnenbrille · Berge**

> Raumkapitänin Nova: eine selbstbewusste Raumschiff-Kapitänin mit silbernem Fliegeranzug, Schulterpolstern, kurzem Haar und einer kleinen Laserpistole am Gürtel. Trägt eine coole dunkle Sonnenbrille. Hintergrund: verschneite Berggipfel mit Bergsee und Tannenwald. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 4 – Raumkapitänin Nova · Kopfhörer · Weltraum**

> Raumkapitänin Nova: eine selbstbewusste Raumschiff-Kapitänin mit silbernem Fliegeranzug, Schulterpolstern, kurzem Haar und einer kleinen Laserpistole am Gürtel. Trägt große Over-Ear-Kopfhörer. Hintergrund: eine felsige Mondoberfläche vor Sternenhimmel mit großem Ringplaneten. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 5 – Raumkapitänin Nova · Kochmütze · Unterwasserwelt**

> Raumkapitänin Nova: eine selbstbewusste Raumschiff-Kapitänin mit silbernem Fliegeranzug, Schulterpolstern, kurzem Haar und einer kleinen Laserpistole am Gürtel. Trägt eine weiße Kochmütze. Hintergrund: ein Korallenriff mit Schiffswrack und Fischschwärmen unter Wasser. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 6 – Raumkapitänin Nova · Krone · Nachtclub**

> Raumkapitänin Nova: eine selbstbewusste Raumschiff-Kapitänin mit silbernem Fliegeranzug, Schulterpolstern, kurzem Haar und einer kleinen Laserpistole am Gürtel. Trägt eine goldene Krone mit Edelsteinen. Hintergrund: ein Neon-Nachtclub in Pink und Violett mit Discokugel und Lichtstrahlen. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

### Charakter 1: Roboter-Butler

**Karte 7 – Roboter-Butler · Sombrero · Vulkan**

> Roboter-Butler: ein elegant gebauter Retro-Roboter aus gebürstetem Chrom mit Fliege, leuchtend blauen Augen und höflich verschränkten Händen. Trägt einen großen bunten Sombrero. Hintergrund: ein ausbrechender Vulkan mit Lava und Rauchwolken. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 8 – Roboter-Butler · Zylinder · Strand**

> Roboter-Butler: ein elegant gebauter Retro-Roboter aus gebürstetem Chrom mit Fliege, leuchtend blauen Augen und höflich verschränkten Händen. Trägt einen schwarzen Zylinder mit rotem Band. Hintergrund: ein tropischer Strand mit Palmen, türkisfarbenem Meer, Strohhütte und einem Segelschiff am Horizont. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 9 – Roboter-Butler · Partyhut · Berge**

> Roboter-Butler: ein elegant gebauter Retro-Roboter aus gebürstetem Chrom mit Fliege, leuchtend blauen Augen und höflich verschränkten Händen. Trägt einen bunten Partyhut mit Punkten und rotem Bommel. Hintergrund: verschneite Berggipfel mit Bergsee und Tannenwald. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 10 – Roboter-Butler · Sonnenbrille · Weltraum**

> Roboter-Butler: ein elegant gebauter Retro-Roboter aus gebürstetem Chrom mit Fliege, leuchtend blauen Augen und höflich verschränkten Händen. Trägt eine coole dunkle Sonnenbrille. Hintergrund: eine felsige Mondoberfläche vor Sternenhimmel mit großem Ringplaneten. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 11 – Roboter-Butler · Kopfhörer · Unterwasserwelt**

> Roboter-Butler: ein elegant gebauter Retro-Roboter aus gebürstetem Chrom mit Fliege, leuchtend blauen Augen und höflich verschränkten Händen. Trägt große Over-Ear-Kopfhörer. Hintergrund: ein Korallenriff mit Schiffswrack und Fischschwärmen unter Wasser. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 12 – Roboter-Butler · Kochmütze · Nachtclub**

> Roboter-Butler: ein elegant gebauter Retro-Roboter aus gebürstetem Chrom mit Fliege, leuchtend blauen Augen und höflich verschränkten Händen. Trägt eine weiße Kochmütze. Hintergrund: ein Neon-Nachtclub in Pink und Violett mit Discokugel und Lichtstrahlen. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 13 – Roboter-Butler · Krone · Büro**

> Roboter-Butler: ein elegant gebauter Retro-Roboter aus gebürstetem Chrom mit Fliege, leuchtend blauen Augen und höflich verschränkten Händen. Trägt eine goldene Krone mit Edelsteinen. Hintergrund: ein modernes Büro mit großen Glasfenstern und Wolkenkratzer-Skyline. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

### Charakter 2: Alien-Forscher

**Karte 14 – Alien-Forscher · Sombrero · Strand**

> Alien-Forscher: ein dünner grauer Außerirdischer mit riesigen schwarzen Augen, weißem Laborkittel, Klemmbrett und neugierigem Blick. Trägt einen großen bunten Sombrero. Hintergrund: ein tropischer Strand mit Palmen, türkisfarbenem Meer, Strohhütte und einem Segelschiff am Horizont. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 15 – Alien-Forscher · Zylinder · Berge**

> Alien-Forscher: ein dünner grauer Außerirdischer mit riesigen schwarzen Augen, weißem Laborkittel, Klemmbrett und neugierigem Blick. Trägt einen schwarzen Zylinder mit rotem Band. Hintergrund: verschneite Berggipfel mit Bergsee und Tannenwald. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 16 – Alien-Forscher · Partyhut · Weltraum**

> Alien-Forscher: ein dünner grauer Außerirdischer mit riesigen schwarzen Augen, weißem Laborkittel, Klemmbrett und neugierigem Blick. Trägt einen bunten Partyhut mit Punkten und rotem Bommel. Hintergrund: eine felsige Mondoberfläche vor Sternenhimmel mit großem Ringplaneten. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 17 – Alien-Forscher · Sonnenbrille · Unterwasserwelt**

> Alien-Forscher: ein dünner grauer Außerirdischer mit riesigen schwarzen Augen, weißem Laborkittel, Klemmbrett und neugierigem Blick. Trägt eine coole dunkle Sonnenbrille. Hintergrund: ein Korallenriff mit Schiffswrack und Fischschwärmen unter Wasser. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 18 – Alien-Forscher · Kopfhörer · Nachtclub**

> Alien-Forscher: ein dünner grauer Außerirdischer mit riesigen schwarzen Augen, weißem Laborkittel, Klemmbrett und neugierigem Blick. Trägt große Over-Ear-Kopfhörer. Hintergrund: ein Neon-Nachtclub in Pink und Violett mit Discokugel und Lichtstrahlen. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 19 – Alien-Forscher · Kochmütze · Büro**

> Alien-Forscher: ein dünner grauer Außerirdischer mit riesigen schwarzen Augen, weißem Laborkittel, Klemmbrett und neugierigem Blick. Trägt eine weiße Kochmütze. Hintergrund: ein modernes Büro mit großen Glasfenstern und Wolkenkratzer-Skyline. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 20 – Alien-Forscher · Krone · Vulkan**

> Alien-Forscher: ein dünner grauer Außerirdischer mit riesigen schwarzen Augen, weißem Laborkittel, Klemmbrett und neugierigem Blick. Trägt eine goldene Krone mit Edelsteinen. Hintergrund: ein ausbrechender Vulkan mit Lava und Rauchwolken. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

### Charakter 3: Weltraum-Pirat

**Karte 21 – Weltraum-Pirat · Sombrero · Berge**

> Weltraum-Pirat: ein verwegener Weltraum-Pirat mit Augenklappe, Cyborg-Arm, langem Ledermantel und Narbe im Gesicht. Trägt einen großen bunten Sombrero. Hintergrund: verschneite Berggipfel mit Bergsee und Tannenwald. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 22 – Weltraum-Pirat · Zylinder · Weltraum**

> Weltraum-Pirat: ein verwegener Weltraum-Pirat mit Augenklappe, Cyborg-Arm, langem Ledermantel und Narbe im Gesicht. Trägt einen schwarzen Zylinder mit rotem Band. Hintergrund: eine felsige Mondoberfläche vor Sternenhimmel mit großem Ringplaneten. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 23 – Weltraum-Pirat · Partyhut · Unterwasserwelt**

> Weltraum-Pirat: ein verwegener Weltraum-Pirat mit Augenklappe, Cyborg-Arm, langem Ledermantel und Narbe im Gesicht. Trägt einen bunten Partyhut mit Punkten und rotem Bommel. Hintergrund: ein Korallenriff mit Schiffswrack und Fischschwärmen unter Wasser. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 24 – Weltraum-Pirat · Sonnenbrille · Nachtclub**

> Weltraum-Pirat: ein verwegener Weltraum-Pirat mit Augenklappe, Cyborg-Arm, langem Ledermantel und Narbe im Gesicht. Trägt eine coole dunkle Sonnenbrille. Hintergrund: ein Neon-Nachtclub in Pink und Violett mit Discokugel und Lichtstrahlen. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 25 – Weltraum-Pirat · Kopfhörer · Büro**

> Weltraum-Pirat: ein verwegener Weltraum-Pirat mit Augenklappe, Cyborg-Arm, langem Ledermantel und Narbe im Gesicht. Trägt große Over-Ear-Kopfhörer. Hintergrund: ein modernes Büro mit großen Glasfenstern und Wolkenkratzer-Skyline. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 26 – Weltraum-Pirat · Kochmütze · Vulkan**

> Weltraum-Pirat: ein verwegener Weltraum-Pirat mit Augenklappe, Cyborg-Arm, langem Ledermantel und Narbe im Gesicht. Trägt eine weiße Kochmütze. Hintergrund: ein ausbrechender Vulkan mit Lava und Rauchwolken. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 27 – Weltraum-Pirat · Krone · Strand**

> Weltraum-Pirat: ein verwegener Weltraum-Pirat mit Augenklappe, Cyborg-Arm, langem Ledermantel und Narbe im Gesicht. Trägt eine goldene Krone mit Edelsteinen. Hintergrund: ein tropischer Strand mit Palmen, türkisfarbenem Meer, Strohhütte und einem Segelschiff am Horizont. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

### Charakter 4: Cyborg-Söldner

**Karte 28 – Cyborg-Söldner · Sombrero · Weltraum**

> Cyborg-Söldner: ein massiger Cyborg-Söldner in dunkler Kampfrüstung mit glimmenden roten Gelenken und einem großen Blaster. Trägt einen großen bunten Sombrero. Hintergrund: eine felsige Mondoberfläche vor Sternenhimmel mit großem Ringplaneten. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 29 – Cyborg-Söldner · Zylinder · Unterwasserwelt**

> Cyborg-Söldner: ein massiger Cyborg-Söldner in dunkler Kampfrüstung mit glimmenden roten Gelenken und einem großen Blaster. Trägt einen schwarzen Zylinder mit rotem Band. Hintergrund: ein Korallenriff mit Schiffswrack und Fischschwärmen unter Wasser. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 30 – Cyborg-Söldner · Partyhut · Nachtclub**

> Cyborg-Söldner: ein massiger Cyborg-Söldner in dunkler Kampfrüstung mit glimmenden roten Gelenken und einem großen Blaster. Trägt einen bunten Partyhut mit Punkten und rotem Bommel. Hintergrund: ein Neon-Nachtclub in Pink und Violett mit Discokugel und Lichtstrahlen. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 31 – Cyborg-Söldner · Sonnenbrille · Büro**

> Cyborg-Söldner: ein massiger Cyborg-Söldner in dunkler Kampfrüstung mit glimmenden roten Gelenken und einem großen Blaster. Trägt eine coole dunkle Sonnenbrille. Hintergrund: ein modernes Büro mit großen Glasfenstern und Wolkenkratzer-Skyline. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 32 – Cyborg-Söldner · Kopfhörer · Vulkan**

> Cyborg-Söldner: ein massiger Cyborg-Söldner in dunkler Kampfrüstung mit glimmenden roten Gelenken und einem großen Blaster. Trägt große Over-Ear-Kopfhörer. Hintergrund: ein ausbrechender Vulkan mit Lava und Rauchwolken. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 33 – Cyborg-Söldner · Kochmütze · Strand**

> Cyborg-Söldner: ein massiger Cyborg-Söldner in dunkler Kampfrüstung mit glimmenden roten Gelenken und einem großen Blaster. Trägt eine weiße Kochmütze. Hintergrund: ein tropischer Strand mit Palmen, türkisfarbenem Meer, Strohhütte und einem Segelschiff am Horizont. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 34 – Cyborg-Söldner · Krone · Berge**

> Cyborg-Söldner: ein massiger Cyborg-Söldner in dunkler Kampfrüstung mit glimmenden roten Gelenken und einem großen Blaster. Trägt eine goldene Krone mit Edelsteinen. Hintergrund: verschneite Berggipfel mit Bergsee und Tannenwald. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

### Charakter 5: Mondblob

**Karte 35 – Mondblob · Sombrero · Unterwasserwelt**

> Mondblob: ein rundes, freundliches grünes Blob-Alien mit zwei Fühlern, drei Augen und kurzen Stummelärmchen. Trägt einen großen bunten Sombrero. Hintergrund: ein Korallenriff mit Schiffswrack und Fischschwärmen unter Wasser. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 36 – Mondblob · Zylinder · Nachtclub**

> Mondblob: ein rundes, freundliches grünes Blob-Alien mit zwei Fühlern, drei Augen und kurzen Stummelärmchen. Trägt einen schwarzen Zylinder mit rotem Band. Hintergrund: ein Neon-Nachtclub in Pink und Violett mit Discokugel und Lichtstrahlen. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 37 – Mondblob · Partyhut · Büro**

> Mondblob: ein rundes, freundliches grünes Blob-Alien mit zwei Fühlern, drei Augen und kurzen Stummelärmchen. Trägt einen bunten Partyhut mit Punkten und rotem Bommel. Hintergrund: ein modernes Büro mit großen Glasfenstern und Wolkenkratzer-Skyline. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 38 – Mondblob · Sonnenbrille · Vulkan**

> Mondblob: ein rundes, freundliches grünes Blob-Alien mit zwei Fühlern, drei Augen und kurzen Stummelärmchen. Trägt eine coole dunkle Sonnenbrille. Hintergrund: ein ausbrechender Vulkan mit Lava und Rauchwolken. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 39 – Mondblob · Kopfhörer · Strand**

> Mondblob: ein rundes, freundliches grünes Blob-Alien mit zwei Fühlern, drei Augen und kurzen Stummelärmchen. Trägt große Over-Ear-Kopfhörer. Hintergrund: ein tropischer Strand mit Palmen, türkisfarbenem Meer, Strohhütte und einem Segelschiff am Horizont. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 40 – Mondblob · Kochmütze · Berge**

> Mondblob: ein rundes, freundliches grünes Blob-Alien mit zwei Fühlern, drei Augen und kurzen Stummelärmchen. Trägt eine weiße Kochmütze. Hintergrund: verschneite Berggipfel mit Bergsee und Tannenwald. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 41 – Mondblob · Krone · Weltraum**

> Mondblob: ein rundes, freundliches grünes Blob-Alien mit zwei Fühlern, drei Augen und kurzen Stummelärmchen. Trägt eine goldene Krone mit Edelsteinen. Hintergrund: eine felsige Mondoberfläche vor Sternenhimmel mit großem Ringplaneten. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

### Charakter 6: Sternen-Priesterin

**Karte 42 – Sternen-Priesterin · Sombrero · Nachtclub**

> Sternen-Priesterin: eine mystische Priesterin in fließenden, leuchtend violetten Roben mit Sternenmuster und schwebenden Lichtpunkten um die Hände. Trägt einen großen bunten Sombrero. Hintergrund: ein Neon-Nachtclub in Pink und Violett mit Discokugel und Lichtstrahlen. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 43 – Sternen-Priesterin · Zylinder · Büro**

> Sternen-Priesterin: eine mystische Priesterin in fließenden, leuchtend violetten Roben mit Sternenmuster und schwebenden Lichtpunkten um die Hände. Trägt einen schwarzen Zylinder mit rotem Band. Hintergrund: ein modernes Büro mit großen Glasfenstern und Wolkenkratzer-Skyline. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 44 – Sternen-Priesterin · Partyhut · Vulkan**

> Sternen-Priesterin: eine mystische Priesterin in fließenden, leuchtend violetten Roben mit Sternenmuster und schwebenden Lichtpunkten um die Hände. Trägt einen bunten Partyhut mit Punkten und rotem Bommel. Hintergrund: ein ausbrechender Vulkan mit Lava und Rauchwolken. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 45 – Sternen-Priesterin · Sonnenbrille · Strand**

> Sternen-Priesterin: eine mystische Priesterin in fließenden, leuchtend violetten Roben mit Sternenmuster und schwebenden Lichtpunkten um die Hände. Trägt eine coole dunkle Sonnenbrille. Hintergrund: ein tropischer Strand mit Palmen, türkisfarbenem Meer, Strohhütte und einem Segelschiff am Horizont. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 46 – Sternen-Priesterin · Kopfhörer · Berge**

> Sternen-Priesterin: eine mystische Priesterin in fließenden, leuchtend violetten Roben mit Sternenmuster und schwebenden Lichtpunkten um die Hände. Trägt große Over-Ear-Kopfhörer. Hintergrund: verschneite Berggipfel mit Bergsee und Tannenwald. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 47 – Sternen-Priesterin · Kochmütze · Weltraum**

> Sternen-Priesterin: eine mystische Priesterin in fließenden, leuchtend violetten Roben mit Sternenmuster und schwebenden Lichtpunkten um die Hände. Trägt eine weiße Kochmütze. Hintergrund: eine felsige Mondoberfläche vor Sternenhimmel mit großem Ringplaneten. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.

**Karte 48 – Sternen-Priesterin · Krone · Unterwasserwelt**

> Sternen-Priesterin: eine mystische Priesterin in fließenden, leuchtend violetten Roben mit Sternenmuster und schwebenden Lichtpunkten um die Hände. Trägt eine goldene Krone mit Edelsteinen. Hintergrund: ein Korallenriff mit Schiffswrack und Fischschwärmen unter Wasser. Gleiche Figur, gleiches Gesicht, gleiche Kleidung wie im Referenzbild. Stil-Vorlage wie oben.
