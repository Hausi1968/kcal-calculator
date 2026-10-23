# KalorienKompass

Persönlicher Kalorienrechner: wie viele kcal pro Tag zum **Gewicht halten** und zum **Abnehmen** (z. B. 1 oder 2 kg pro Monat) – mit **Eichung an echten Daten**, **Bonus-Kalorien** für Schritte und Sport und **Hinweisen** zu Erkrankungen und Medikamenten.

- **Website:** https://hausi1968.github.io/kcal-calculator/
- **Android-App:** https://github.com/Hausi1968/kcal-calculator/releases/latest/download/KalorienKompass.apk

## Was eingegeben werden kann
Geschlecht, Alter, Größe, Gewicht, Körperfett (optional), Start- und Zielgewicht, Grundaktivität, Erkrankungen (Diabetes, KHK/Bypass, Herzschwäche, Bluthochdruck, Nieren, Schilddrüse …), Medikamente (GLP-1/Ozempic, Insulin, Sulfonylharnstoffe, SGLT2, Metformin, Betablocker …), echte Werte zur Eichung, Schritte und Sport, eigene Ziele.
Alle Eingaben bleiben auf dem Gerät (localStorage). „Für den Arzt“ erstellt eine Zusammenfassung zum Drucken oder als PDF.

## Rechenweg
| Größe | Formel |
|---|---|
| Grundumsatz | Mifflin-St-Jeor, mit Körperfett Katch-McArdle |
| Erhalt | Grundumsatz × Aktivitätsfaktor (Bewegung zählt extra) |
| Defizit | kg pro Monat × 7.000 kcal ÷ 30,44 Tage |
| Eichung | Ø kcal − Gewichtsänderung × 7.000 ÷ Tage |
| Schritte | Schritte × kg × 0,0004 (netto) |
| Sport | (MET − 1) × kg × Stunden |
| Eiweiß | 1,2–1,5 g je kg angepasstem Bezugsgewicht |

Der Rechner ersetzt keine ärztliche Beratung.

## Aufbau & Updates „aus der Luft“
```
web/        Website (PWA, offlinefähig) → GitHub Pages
android/    Android-App: WebView-Hülle, lädt die Website
test/       Tests für den Rechenkern (node test/calc.test.js)
tools/      Logo- und Icon-Generator (python3 tools/make_icons.py)
```
- **Inhalte ändern** (Rechner, Texte, Design): Dateien in `web/` ändern und pushen. GitHub Pages veröffentlicht automatisch – die App lädt beim nächsten Öffnen die neue Version, **ohne neue APK**. In `web/sw.js` die `VERSION` erhöhen, damit offene Apps den Hinweis „Neue Version verfügbar“ zeigen.
- **App-Hülle ändern** (`android/`): Pushen startet den Build, die neue APK erscheint als GitHub-Release. Die installierte App findet das Release selbst und bietet das Update an.

### Einmalig einrichten
1. *Settings → Pages → Build and deployment → Source:* **GitHub Actions** wählen.
2. Unter *Actions* den Workflow „Website veröffentlichen“ einmal starten (oder etwas in `web/` pushen).

### Signaturschlüssel
Die APK wird mit `android/app/kalorienkompass.jks` signiert, damit Updates sich über die alte Version installieren lassen. Für private Nutzung reicht das. Wer die App weitergibt, legt besser einen eigenen Schlüssel als Secrets an (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`) – der Workflow nutzt ihn dann automatisch (Achtung: einmaliger Wechsel erfordert eine Neuinstallation).
