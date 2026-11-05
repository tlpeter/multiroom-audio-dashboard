# Speakerondersteuning

De kaart stuurt Home Assistant `media_player`-entiteiten aan. Een merknaam activeert geen speciale opdrachten. Het **feitelijk gerapporteerde `supported_features`**, de toestand en beschikbare keuzelijsten bepalen welke bediening verschijnt. Niet iedere functie is via iedere integratie beschikbaar.

## Direct in de kaart

Afspelen/pauze/stop, vorige/volgende, volume, volumestappen, mute, aan/uit, bronkeuze, geluidsprofiel, positie zoeken, shuffle en herhalen, uitsluitend als aangeboden. De hoofdspeler bedient de expliciet ingestelde entiteit; de lijst speakers wordt niet automatisch gegroepeerd of gezamenlijk gedempt. Groepering, mediabibliotheek en overige integratiefuncties openen via **Speler ↗** in de eigen HA-bediening, voor zover HA die aanbiedt.

De 15-bands EQ-profielen vereisen number/select-entiteiten met de bekende frequenties en de juiste grenzen. Vanaf 2.2.0-beta.6 worden die bij Sonocotta TAS58xx ESPHome-firmware automatisch gevonden via het HA-apparaat van de gekozen speaker; expliciet gekoppelde entiteiten gaan voor zolang ze bestaan. Een Sonos-bassregelaar of een HEOS-geluidsmodus wordt niet behandeld als een 15-bands equalizer. Native geluidsmodi staan apart bij Geluidsprofiel.

Live bronmeters vereisen een Music Assistant-speler met MilkDrop. Een rechtstreekse Cast-/Sonos-/andere HA-entiteit biedt niet vanzelf PCM-audiodata. Zonder brondata blijven de meters stil; Demo is een expliciete keuze.

## Testmatrix

Alle onderstaande families zijn **testdoelen**. Er is nog geen fysieke merkcertificering van deze beta. CI test het HA-bedieningsprotocol met synthetische capabilities, geen virtuele kopie van elk merk. Een geslaagde protocoltest is niet hetzelfde als een geslaagde test op een apparaat.

| Familie / HA-route | Automatische dekking | Praktijktest |
| --- | --- | --- |
| Sonocotta Louder ESP32 Pro / ESPHome + Music Assistant | EQ-curves, ranges, foutafhandeling; HA-bediening; PCM-timing | Beta nog te controleren |
| Sonos / IKEA SYMFONISK via Sonos | Gemeenschappelijke HA-capabilities | Open |
| Google/Nest, Chromecast en Cast-speakers | Gemeenschappelijke HA-capabilities | Open |
| Apple HomePod / AirPlay via MA of geschikte HA-integratie | Gemeenschappelijke HA-capabilities | Open |
| Denon/Marantz via HEOS | Gemeenschappelijke HA-capabilities | Open |
| Bluesound/NAD via BluOS | Gemeenschappelijke HA-capabilities | Open |
| Bose SoundTouch | Gemeenschappelijke HA-capabilities | Open |
| Yamaha via MusicCast | Gemeenschappelijke HA-capabilities | Open |
| WiiM/LinkPlay via passende HA-integratie of MA | Gemeenschappelijke HA-capabilities | Open |
| Logitech/Squeezebox en SlimProto | Gemeenschappelijke HA-capabilities | Open |
| DLNA/UPnP-renderers (o.a. sommige Samsung/LG/JBL-modellen) | Gemeenschappelijke HA-capabilities | Open |
| Amazon Echo/Alexa via beschikbare HA-/MA-route | Gemeenschappelijke HA-capabilities; route vereist | Open |
| Overige ESPHome-, Android TV-, Roku- en netwerkspelers | Gemeenschappelijke HA-capabilities; route vereist | Open |

Dit is geen toezegging dat alle modellen via HA toegankelijk zijn. Voor elk merk/model worden de integratieroute, firmwareversie en daadwerkelijk aangeboden functies vastgelegd in een hardware-issue. Merkspecifieke functies komen pas als ondersteund in de matrix na implementatie én testbewijs.

Gebruik het **Real hardware test report**-formulier. Controleer per functie pass/fail/not exposed/not tested, plus reconnect, pauze, stilte, verborgen browsertab en minstens 30 minuten afspelen. Bij MA: bronniveau en timing; bij ESPHome: alle EQ-banden, mixer en trims. Noteer of audiostop ook zonder open dashboard optreedt.

Bron van het bedieningscontract: [HA media-playerdocumentatie](https://developers.home-assistant.io/docs/core/entity/media-player/) en [HA Core 2026.10.4 featuredefinities](https://github.com/home-assistant/core/blob/2026.10.4/homeassistant/components/media_player/const.py). [HA-integratiecatalogus](https://www.home-assistant.io/integrations/) en [Music Assistant providers](https://www.music-assistant.io/player-support/) bepalen de beschikbare routes; deze kaart implementeert zelf geen speakerprotocol.
