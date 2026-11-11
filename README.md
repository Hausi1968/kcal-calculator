# KalorienKompass

Persönlicher Kalorienrechner: **Wie viel darf ich heute essen?** – mit Essen-, Gewichts- und Bewegungstagebuch, **echtem Bedarf aus den eigenen Daten**, Bonus für Bewegung über dem Üblichen und **Hinweisen** zu Erkrankungen und Medikamenten.

- **Website:** https://kcal.hausmann-mail.de/
- **Android-App:** https://github.com/Hausi1968/kcal-calculator/releases/latest/download/KalorienKompass.apk

## Bereiche
- **Heute:** eine Zahl „Heute essen“ (inkl. Bewegungsbonus), Essen eintragen mit „noch X kcal übrig“, Gewicht, Schritte und Sport. Mit ‹ › lassen sich vergangene Tage nachtragen.
- **Verlauf:** Gewichtsdiagramm mit 7-Tage-Schnitt, echter Bedarf aus dem Tagebuch, Tabelle der letzten 14 Tage.
- **Profil:** Körperdaten, Bauchumfang, Ziel, ärztliche Begleitung, Alltag, Erkrankungen und Medikamente, Eichung, Zusammenfassung für den Arzt, Daten sichern/wiederherstellen.
- **Info:** Rechenweg.

Alle Daten bleiben auf dem Gerät (localStorage, Schlüssel `kalorienkompass.v2`). Vor einem Handywechsel unter *Profil → Daten sichern* exportieren.

## Rechenweg
| Größe | Formel |
|---|---|
| Grundumsatz | Mifflin-St-Jeor, mit genau gemessenem Körperfett Katch-McArdle |
| Bedarf zum Halten | Grundumsatz × Alltagsfaktor 1,2 / 1,4 / 1,6 |
| Echter Bedarf (Tagebuch) | Ø kcal der vollständigen Tage (≥ 800 kcal) − Steigung der Gewichts-Regressionsgeraden × 7.000; letzte 28 Tage, mind. 14 Essenstage, 6 Wiegungen über 21 Tage |
| Echter Bedarf (manuell) | Ø kcal − Gewichtsänderung × 7.000 ÷ Tage, ab 3 Wochen |
| Ziel | Bedarf − kg pro Monat × 7.000 ÷ 30,44; ohne ärztliche Begleitung nie unter 1.500 (Frauen 1.200) kcal |
| Bonus | (Bewegung heute − übliche Bewegung) × Anteil zurückessen; Schritte × kg × 0,0004, Sport (MET − 1) × kg × h |
| Eiweiß | 1,2–1,5 g je kg angepasstem Bezugsgewicht |

Der Rechner ersetzt keine ärztliche Beratung.

## Aufbau & Updates „aus der Luft“
```
web/        Website (PWA, offlinefähig) → GitHub Pages
android/    Android-App: WebView-Hülle, lädt die Website
test/       Tests für den Rechenkern (node test/calc.test.js)
tools/      Logo- und Icon-Generator (python3 tools/make_icons.py)
```
- **Inhalte ändern** (Rechner, Texte, Design): Dateien in `web/` ändern und pushen. GitHub Pages veröffentlicht automatisch – die App lädt beim nächsten Öffnen die neue Version, **ohne neue APK**. In `web/version.js` die Versionsnummer erhöhen, damit offene Apps den Hinweis „Neue Version verfügbar“ zeigen.
- **App-Hülle ändern** (`android/`): Pushen startet den Build, die neue APK erscheint als GitHub-Release. Die installierte App findet das Release selbst und bietet das Update an.

### Einmalig einrichten
1. *Settings → Pages → Build and deployment → Source:* **GitHub Actions** wählen.
2. Unter *Actions* den Workflow „Website veröffentlichen“ einmal starten (oder etwas in `web/` pushen).

### Eigene Domain
Die Website läuft unter kcal.hausmann-mail.de (Settings → Pages → Custom domain). Die Adresse steht in `android/app/build.gradle` (`WEB_URL`); wird die Domain geändert, braucht es einmalig eine neue APK.

### Signaturschlüssel
Die APK wird mit `android/app/kalorienkompass.jks` signiert, damit Updates sich über die alte Version installieren lassen. Für private Nutzung reicht das. Wer die App weitergibt, legt besser einen eigenen Schlüssel als Secrets an (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`) – der Workflow nutzt ihn dann automatisch (Achtung: einmaliger Wechsel erfordert eine Neuinstallation).
