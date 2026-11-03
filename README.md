# Multiroom Audio Dashboard

Home Assistant-audiobediening met vier instelbare stijlen, spectrum of analoge bronmeters, eigen kleuren en optionele equalizerbediening. Voorheen Louder Studio Card.

**Status: 2.2.0-beta.4.** Automatisch getest met fictieve HA-statussen en PCM-audio. Praktijktests per speaker/integratie staan nog open. GitHub kan geen apparaten bij jou thuis testen. Deze repository installeert niets automatisch in Home Assistant.

Snel naar: [Kleuren en stijl](#waar-stel-ik-dit-in) · [Andere speakers kiezen](#andere-slimme-speakers-toevoegen) · [Installeren via HACS](#installeren-via-hacs).

## Zo ziet het eruit

De beelden hieronder zijn screenshots van de werkende kaart met fictieve spelers en demo-audio. Ze tonen het uiterlijk; de bewegende meters zie je in Home Assistant. Iedere stijl kan een spectrum of analoge meters gebruiken en heeft eigen instelbare kleuren.

### Modern spectrum

![Modern spectrum: afgeronde panelen, groen spectrum en afzonderlijke speakerbediening](https://raw.githubusercontent.com/tlpeter/multiroom-audio-dashboard/main/docs/images/modern-desktop.png)

### Vintage hifi

![Vintage hifi: lichte versterkerstijl met analoge bronmeters en ronde volumeknop](https://raw.githubusercontent.com/tlpeter/multiroom-audio-dashboard/main/docs/images/vintage-desktop.png)

### Midnight studio

![Midnight studio: donkere stijl met warme koperkleur en spectrum](https://raw.githubusercontent.com/tlpeter/multiroom-audio-dashboard/main/docs/images/midnight-desktop.png)

### Retro spectrum

![Retro spectrum: klassieke spectrumstijl met groene en oranje accenten](https://raw.githubusercontent.com/tlpeter/multiroom-audio-dashboard/main/docs/images/retro-desktop.png)

## Waar stel ik dit in?

**De instellingen zitten in de dashboardkaart zelf. HACS gebruik je om de kaart te installeren en bij te werken.**

1. Open je bestaande Home Assistant-dashboard met deze kaart.
2. Klap **Kleuren & uiterlijk** uit, direct onder de titel.
3. Kies de **Stijl**, **Visualisatie** (spectrum of analoge VU-meters) en **Databron** (Live Music Assistant of Demo).
4. Stel **Accentkleur**, **Spectrumtop / naald**, **Achtergrond** en **Meterverlichting** in, of kies een kleurcombinatie.

![Kleuren en uiterlijk: stijl, visualisatie, databron, vier kleurvelden en kleurcombinaties](https://raw.githubusercontent.com/tlpeter/multiroom-audio-dashboard/main/docs/images/appearance-settings.png)

De voorkeuren worden direct in deze browser bewaard; iedere stijl onthoudt zijn eigen kleuren. Je hoeft hiervoor geen YAML aan te passen. EQ-profielen en schuiven staan verder naar beneden en verschijnen alleen bij een daarvoor geconfigureerde versterker.

### Eigen equalizerprofielen opslaan

Vanaf **2.2.0-beta.4** kun je een eigen EQ-instelling bewaren onder een naam:

1. Kies in de equalizer het board (bijvoorbeeld **Links**) en zet de schuiven zoals je wilt.
2. Typ onder **Mijn profielen** een naam, bijvoorbeeld *Avond*, en klik op **Huidige instelling opslaan** (of druk op Enter).
3. Je profiel verschijnt als knop. Klik erop om het later weer toe te passen, op hetzelfde of een ander board met 15 banden.

- Opslaan leest alleen de huidige stand; er wordt niets naar de speaker gestuurd.
- Dezelfde naam nog eens opslaan werkt het profiel bij. Namen van standaardprofielen (Bas, Disco, …) zijn niet toegestaan. Maximaal 24 profielen, namen tot 40 tekens.
- Verwijderen: klik op **×** en daarna binnen 5 seconden op **Verwijderen?**.
- De profielen worden bewaard in je **Home Assistant-gebruikersaccount**, dus ze zijn er ook op je telefoon of tablet als je met dezelfde HA-gebruiker inlogt. Een andere HA-gebruiker (bijvoorbeeld een wandtablet met een eigen account) ziet ze niet.

### Andere slimme speakers toevoegen

HACS zoekt geen speakers op je netwerk. Voeg een speaker eerst via zijn passende integratie toe aan Home Assistant, zodat hij daar als `media_player` beschikbaar is.

Vanaf **2.2.0-beta.3** kun je zonder YAML spelers kiezen:

![Bovenaan de kaart: een opvallende knop Speakers beheren naast Home en Speler openen](https://raw.githubusercontent.com/tlpeter/multiroom-audio-dashboard/main/docs/images/speaker-toolbar.png)

1. Klik bovenaan de audiokaart op de opvallende knop **⚙ Speakers beheren**. Dashboard-bewerkmodus is niet nodig.
2. De Home Assistant-kaarteditor opent. Je ziet de beschikbare HA-spelers, inclusief bestaande spelers die tijdelijk niet beschikbaar zijn. Zoek op naam en vink de gewenste speakers aan.
3. Kies de **Hoofdspeler** of bestaande groep voor het bovenste afspeelpaneel.
4. Klik op **Opslaan** in de Home Assistant-kaarteditor. Met Annuleren blijft de selectie ongewijzigd.

De knop is beschikbaar voor een HA-beheerder. Hij opent alleen de editor: er worden geen dashboardgegevens of apparaatopdrachten verstuurd totdat je zelf een wijziging opslaat of een apparaat bedient. Bij oudere/afwijkende dashboardlayouts blijft de standaardroute beschikbaar: Dashboard bewerken → **Edit / Bewerken onder de hele kaart**. In een schermvullende panelweergave staat die standaardknop helemaal onderaan, voorbij de equalizer.

![Visuele kaarteditor: kies een hoofdspeler, zoek in Home Assistant-spelers en vink speakers aan](https://raw.githubusercontent.com/tlpeter/multiroom-audio-dashboard/main/docs/images/speaker-editor.png)

Je bestaande EQ-, mixer- en sensorkoppelingen blijven behouden bij geselecteerde versterkers. Een nieuwe speaker krijgt de bediening die zijn HA-integratie aanbiedt; er worden geen luidsprekers automatisch gegroepeerd. Voor optionele hardwarekoppelingen zoals losse EQ-entiteiten blijft de uitgebreide kaartconfiguratie beschikbaar.

Zie je **Kleuren & uiterlijk** niet? Controleer of het dashboard de nieuwe HACS-resource laadt en herlaad de browser volledig. Volg hieronder de stappen voor een bestaande installatie; je hoeft je dashboard niet opnieuw te maken.

### Plaatjes bekijken in HACS

Open in HACS de detailpagina van **Multiroom Audio Dashboard**. De repository gebruikt `render_readme: true`, zodat de README daar wordt weergegeven. HACS haalt de documentatie op voor de geïnstalleerde of geselecteerde versie: kies **2.2.0-beta.3 of nieuwer** voor deze geïllustreerde uitleg. De afbeeldingen hebben volledige HTTPS-adressen en vereisen geen GitHub-login. Als oude informatie blijft staan, kies **Update information / Informatie bijwerken** in het repositorymenu en open de detailpagina opnieuw. Voor het laden van de plaatjes moet je browser GitHub Raw kunnen bereiken. Zie de [HACS-documentatie](https://www.hacs.dev/docs/publish/start/) en [versiekeuze in de HACS-broncode](https://github.com/hacs/integration/blob/main/custom_components/hacs/repositories/base.py).

## Installeren via HACS

1. Open HACS → menu → **Aangepaste repositories**.
2. Voeg `https://github.com/tlpeter/multiroom-audio-dashboard` toe als type **Dashboard**.
3. Download Multiroom Audio Dashboard. Kies bij versie-selectie beta's als je deze prerelease wilt gebruiken.
4. Controleer de dashboardresource: `/hacsfiles/multiroom-audio-dashboard/louder-amplifier-card.js`, type JavaScript-module. Herlaad de browser volledig.
5. Voeg een handmatige kaart toe met je eigen entiteiten:

```yaml
type: custom:multiroom-audio-dashboard
entity: media_player.woonkamer
players:
  - player: media_player.woonkamer
    name: Woonkamer
  - player: media_player.keuken
    name: Keuken
```

`entity` is de expliciete hoofdspeler of bestaande groep. `players` bevat 1–32 individuele spelers. Zonder `players` toont de kaart alleen de hoofdspeler. De kaart maakt zelf geen groep en verandert geen volume of afspeelstatus bij openen.

Bij een bestaande installatie: vervang de oude inline/lokale resource eenmalig door bovenstaande HACS-resource. Laad maar **één versie** van het JavaScript. Je oude `custom:louder-amplifier-card`-type, `boards`-configuratie en stijlvoorkeuren blijven werken. De oude bestandsnaam is behouden voor compatibiliteit. Gebruik voor nieuwe HACS-installaties het nieuwe GitHub-adres.

Zonder HACS: plaats het releasebestand `louder-amplifier-card.js` in `/config/www/multiroom-audio-dashboard/`, registreer `/local/multiroom-audio-dashboard/louder-amplifier-card.js?v=2.2.0-beta.4` als module en herlaad. Een HA-herstart is niet nodig voor deze frontendresource.

## Uiterlijk en bediening

- Modern spectrum, Retro spectrum, Vintage hifi en Midnight studio; analoge meters of spectrum onafhankelijk van de stijl.
- Accent, spectrumtop/naald, achtergrond en meterverlichting. Iedere stijl onthoudt zijn eigen kleurkeuze per browser.
- Afspelen/pauze/stop, vorige/volgende, volume, mute, volumestappen, aan/uit, bron, native geluidsprofiel, positie, shuffle en herhalen, uitsluitend wanneer de HA-speler de functie aanbiedt.
- **Speler ↗** opent de native HA-bediening voor overige functies en groepering, voor zover de integratie die aanbiedt.
- Optionele ESPHome-instellingen: mixer, uitgangstrims, sensoren en 15-bands EQ. Profielen: Vlak, Bas, Disco, Rock, Pop, Jazz, Klassiek, Zang en Nacht, plus je eigen profielen met een naam (zie hieronder). [Voorbeeldconfiguratie](examples/card.json).

Een speaker met een bassregelaar heeft niet automatisch een 15-bands EQ. Zie de [ondersteunings- en testmatrix](docs/SPEAKER_SUPPORT.md) voor alle speakerfamilies en openstaande praktijktests.

## Echte bronmeters en demo

**Live Music Assistant** leest waveformdata via MilkDrop en de bestaande, same-origin HA-ingressverbinding. Er zijn geen ingebouwde toegangstokens. De browser speelt zelf geen audio af.

De meters tonen RMS van het gemengde **mono-bronsignaal**, vóór speaker-DSP. Beide naalden tonen dezelfde bron. Het zijn geen afzonderlijke metingen van fysieke linker/rechter uitgangen. De schaal is dBFS met 300 ms niveaudemping en gedempte naaldbeweging. Het spectrum gebruikt FFT met relatieve frequenties, omdat het relayprotocol geen samplefrequentie meestuurt.

Bij ontbrekende of verouderde data stoppen de meters. Er is geen automatische demo-fallback. **Demo-animatie** is expliciet te kiezen en wordt als demo aangeduid. Een gewone HA-speaker zonder MA-waveformbron heeft wel bediening, maar geen echte bronmeters.

Live verwacht een `music_assistant`-media_player, de Music Assistant-app (`d5369777_music_assistant`) en de MilkDrop Visualizer-plugin. Andere installatieroutes zijn nog niet gevalideerd. Geen token in de configuratie plakken.

## Ontwikkeling, testen en beveiliging

`dev` bevat testversies; `main` de versie voor release. Issues hebben dezelfde labels als Smart Charging Planner, met formulieren voor bugs, functies en echte hardwaretests. Releases verschijnen alleen na een geslaagde Tests-workflow op hetzelfde main-commit. Beta's blijven herkenbaar als prerelease.

```sh
npm ci --ignore-scripts
npm test
npx playwright install chromium
npm run test:browser
```

GitHub Actions controleert Node 22/24, Chromium desktop/mobiel, EQ, kleuren, live bronmeters en generieke capabilities. CodeQL, npm audit en Gitleaks draaien mee als releasevoorwaarde. Dependabot controleert npm en Actions. Geheimmeldingen, pushbeveiliging en automatische beveiligingsupdates zijn op GitHub ingeschakeld. Zie [testplan](tests/TESTPLAN.md), [beveiliging](SECURITY.md) en [changelog](CHANGELOG.md).

Lokaal voorbeeld: `npm run preview`, daarna `http://127.0.0.1:18905`. Het voorbeeld gebruikt fictieve gegevens en stuurt geen opdrachten naar apparaten. De previewserver luistert uitsluitend lokaal.

## Naam en bronnen

De neutrale naam beschrijft het project. Dit is geen officieel product van een speakerfabrikant. [Naamonderzoek en beperkingen](docs/NAME_REVIEW.md): bestaand Louder-gebruik is gevonden; volledige juridische merkenvrijgave is niet uitgevoerd.

- [HA media-playercontract](https://developers.home-assistant.io/docs/core/entity/media-player/)
- [Music Assistant MilkDrop](https://www.music-assistant.io/plugins/milkdrop-visualizer/)
- [Relayprotocol MA 2.10.8](https://github.com/music-assistant/server/blob/2.10.8/music_assistant/providers/milkdrop_visualizer/relay.py)
- [Audioverwerking](https://github.com/music-assistant/server/blob/2.10.8/music_assistant/providers/milkdrop_visualizer/tap.py)
- [HA-ingress](https://github.com/home-assistant/frontend/blob/20260930.5/src/data/hassio/ingress.ts)
- [HACS custom repositories](https://www.hacs.dev/docs/faq/custom_repositories/)
