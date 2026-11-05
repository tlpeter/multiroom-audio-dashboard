# Changelog

## 2.2.0-beta.5

- Show now-playing info with album art from Home Assistant (`entity_picture`) and a YouTube search link. When the main entity has no metadata (e.g. a group), use the configured speaker that is playing. (#25)
- Optional online track info, off by default and stored per browser: first release year and album from MusicBrainz, artist summary from Wikipedia via Wikidata (Dutch, English fallback) and a Cover Art Archive cover when HA has none. Rate limited, debounced, cached, time-limited and validated; attribution shown. No requests when off.

## 2.2.0-beta.4

- Save the current 15-band EQ setting of a board as a named profile under **Mijn profielen** and apply it later with one click, also on another board with the same 15 bands. Saving sends no device commands. (#23)
- Saved profiles use the same preflight as built-in profiles (all bands available, values within each entity's range/step, stop on first failure). Same name updates, built-in names are refused, at most 24 profiles of up to 40 characters, two-step delete without browser dialogs.
- Profiles are stored per Home Assistant user via the frontend user-data API; browser storage is only a fallback when that API is unavailable. Stored data is validated on load.

## 2.2.0-beta.3

- Add a prominent Speakers beheren button at the top of the card. Open the native HA card editor directly without entering dashboard edit mode or scrolling past the equalizer.
- Keep native Save/Cancel and permission handling; opening the editor sends no dashboard saves or device commands.
- Verify legacy/current panel and section paths, unambiguous card targeting, administrator access, read-only contexts and desktop/mobile visibility.

## 2.2.0-beta.2

- Add actual screenshots of all four styles and appearance settings to the README, using synthetic demo data.
- Explain where dashboard settings live, how to preserve an existing dashboard, and how HACS displays version-specific documentation and images.
- Add a visual card editor to search/select Home Assistant speakers and choose a main player without YAML. Preserve existing amplifier EQ, mixer and diagnostic mappings.
- Capture documentation screenshots and verify editor selection/persistence events without device commands. Audio and device-service dispatch behavior is unchanged.

## 2.2.0-beta.1

- Rename public project to Multiroom Audio Dashboard; retain legacy card type, resource filename and preferences.
- Accept one or more generic Home Assistant players. Show controls according to the actual HA capabilities, including native source/sound mode, seek, power, shuffle and repeat.
- Keep explicitly configured ESPHome EQ, mixer, trims and diagnostics optional.
- Mute only the configured main entity; never assume configured speakers are group members.
- Validate service/domain, entity, capability, values, step and choice lists before dispatch; strip unrelated payload fields.
- Add issue templates, charger-style labels, dev branch, beta releases, hardware tracking, CodeQL, dependency audit, secret scanning and Dependabot.
- Document naming research and the distinction between protocol tests and real speaker verification.

## 2.1.0

- Initial four styles, independent colors, EQ presets and Music Assistant waveform source meters with CI unit/browser tests. Prototype; not released to Home Assistant automatically.
