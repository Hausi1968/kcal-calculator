package de.hausi.kalorienkompass;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Schlanke Hülle um die Website.
 * - Inhalte & Rechenlogik kommen live von der Website → Updates „aus der Luft“ ohne neue APK.
 * - Offline läuft die zuletzt geladene Version (Service Worker der Website).
 * - Ändert sich die App-Hülle selbst, prüft sie GitHub Releases und bietet die neue APK an.
 */
public class MainActivity extends Activity {

    private static final String PREFS = "kalorienkompass";
    private static final long CHECK_INTERVAL_MS = 12L * 60 * 60 * 1000; // höchstens alle 12 Stunden
    private static final String OFFLINE_PAGE = "file:///android_asset/offline.html";
    private static final Pattern TAG = Pattern.compile("^app-v(\\d+)$");
    private static final int REQ_OPEN = 1, REQ_SAVE = 2;

    private WebView web;
    private volatile boolean trustedPage = false;      // Brücke nur für die eigene Seite
    private boolean clearHistoryAfterLoad = false;
    private ValueCallback<Uri[]> fileCallback;
    private static final String PENDING_FILE = "pending-export.json";   // überlebt, falls Android die App beendet

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(getColor(R.color.brand));
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

        // Ab Android 15 zeichnen Apps randlos: Platz für Statusleiste, Navigationsleiste und Tastatur lassen
        if (Build.VERSION.SDK_INT >= 35) {
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime()
                        | WindowInsets.Type.displayCutout());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsets.CONSUMED;
            });
        }

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);       // localStorage → Eingaben bleiben gespeichert
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " KalorienKompassApp/" + BuildConfig.VERSION_CODE);

        web.addJavascriptInterface(new Bridge(), "AndroidApp");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (isOwnSite(u)) return false;
                openExternal(u.toString()); // fremde Links im Browser öffnen
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                trustedPage = url != null && (url.equals(OFFLINE_PAGE) || isOwnSite(Uri.parse(url)));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (clearHistoryAfterLoad && url != null && !url.equals(OFFLINE_PAGE)) {
                    view.clearHistory();
                    clearHistoryAfterLoad = false;
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) view.loadUrl(OFFLINE_PAGE);
            }
        });

        // Datei auswählen (für „Daten wiederherstellen“)
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try {
                    startActivityForResult(i, REQ_OPEN);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(BuildConfig.WEB_URL);

        checkForAppUpdate();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_OPEN && fileCallback != null) {
            Uri u = resultCode == RESULT_OK && data != null ? data.getData() : null;
            fileCallback.onReceiveValue(u != null ? new Uri[]{u} : null);
            fileCallback = null;
        } else if (requestCode == REQ_SAVE) {
            File pending = new File(getCacheDir(), PENDING_FILE);
            try {
                if (resultCode != RESULT_OK || data == null || data.getData() == null || !pending.exists()) return;
                try (OutputStream os = getContentResolver().openOutputStream(data.getData(), "wt");
                     InputStream in = new FileInputStream(pending)) {
                    if (os == null) throw new IllegalStateException();
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
                    Toast.makeText(this, "Sicherung gespeichert", Toast.LENGTH_SHORT).show();
                } catch (Exception e) {
                    Toast.makeText(this, "Speichern fehlgeschlagen", Toast.LENGTH_LONG).show();
                }
            } finally {
                //noinspection ResultOfMethodCallIgnored
                pending.delete();
            }
        }
    }

    /** Nur die eigene Domain (und die alte github.io-Adresse, die dorthin umleitet) bleibt in der App */
    private boolean isOwnSite(Uri u) {
        if (u == null || !"https".equalsIgnoreCase(u.getScheme()) || u.getHost() == null) return false;
        String host = u.getHost();
        String own = Uri.parse(BuildConfig.WEB_URL).getHost();
        if (host.equalsIgnoreCase(own)) return true;
        String path = u.getPath() == null ? "" : u.getPath();
        return host.equalsIgnoreCase("hausi1968.github.io") && path.startsWith("/kcal-calculator");
    }

    private void openExternal(String url) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) { }
    }

    /** Brücke für die Website. Jede Methode prüft, dass gerade die eigene Seite geladen ist. */
    private class Bridge {
        @JavascriptInterface
        public void print() {
            if (!trustedPage) return;
            runOnUiThread(() -> {
                PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                if (pm == null) return;
                pm.print("KalorienKompass", web.createPrintDocumentAdapter("KalorienKompass"),
                        new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
            });
        }

        @JavascriptInterface
        public void reload() {
            if (!trustedPage) return;
            runOnUiThread(() -> {
                clearHistoryAfterLoad = true;
                web.loadUrl(BuildConfig.WEB_URL);
            });
        }

        @JavascriptInterface
        public int versionCode() { return BuildConfig.VERSION_CODE; }

        /** Sicherung als Datei speichern – der Nutzer wählt den Ort (z. B. Downloads oder Google Drive) */
        @JavascriptInterface
        public void saveFile(String name, String text) {
            if (!trustedPage || text == null || text.length() > 20_000_000) return;
            runOnUiThread(() -> {
                try (OutputStream os = new FileOutputStream(new File(getCacheDir(), PENDING_FILE))) {
                    os.write(text.getBytes(StandardCharsets.UTF_8));
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Speichern fehlgeschlagen", Toast.LENGTH_LONG).show();
                    return;
                }
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("application/json");
                i.putExtra(Intent.EXTRA_TITLE, name == null ? "KalorienKompass.json" : name);
                try {
                    startActivityForResult(i, REQ_SAVE);
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Kein Speicherort verfügbar", Toast.LENGTH_LONG).show();
                }
            });
        }
    }

    /* ---------- Update der App-Hülle über GitHub Releases ---------- */
    private void checkForAppUpdate() {
        final SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
        long now = System.currentTimeMillis();
        if (now - p.getLong("lastCheck", 0) < CHECK_INTERVAL_MS) return;
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(BuildConfig.RELEASES_API).openConnection();
                c.setConnectTimeout(8000);
                c.setReadTimeout(8000);
                c.setRequestProperty("Accept", "application/vnd.github+json");
                c.setRequestProperty("User-Agent", "KalorienKompassApp");
                if (c.getResponseCode() != 200) return;
                StringBuilder sb = new StringBuilder();
                try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = r.readLine()) != null) sb.append(line);
                }
                JSONObject rel = new JSONObject(sb.toString());
                Matcher m = TAG.matcher(rel.optString("tag_name", ""));
                if (!m.matches()) return;                       // nur Tags der Form app-v123 auswerten
                int latest = Integer.parseInt(m.group(1));
                String apk = BuildConfig.APK_URL;
                JSONArray assets = rel.optJSONArray("assets");
                if (assets != null) for (int i = 0; i < assets.length(); i++) {
                    String url = assets.getJSONObject(i).optString("browser_download_url");
                    if (url.startsWith("https://github.com/") && url.endsWith(".apk")) { apk = url; break; }
                }
                p.edit().putLong("lastCheck", System.currentTimeMillis()).apply();
                if (latest > BuildConfig.VERSION_CODE && p.getInt("skip", 0) != latest) {
                    final String apkUrl = apk;
                    final int code = latest;
                    final String notes = rel.optString("body", "").trim();
                    runOnUiThread(() -> showUpdateDialog(code, apkUrl, notes));
                }
            } catch (Exception ignored) {
                // offline oder API nicht erreichbar → beim nächsten Start erneut versuchen
            }
        }).start();
    }

    private void showUpdateDialog(int code, String apkUrl, String notes) {
        if (isFinishing() || isDestroyed()) return;
        String msg = "Eine neue Version der App ist verfügbar (Build " + code + ").\n\n"
                + (notes.isEmpty() ? "" : notes + "\n\n")
                + "Nach dem Herunterladen die Datei öffnen und „Aktualisieren“ wählen. Deine Eingaben bleiben erhalten.";
        new AlertDialog.Builder(this)
                .setTitle("App-Update")
                .setMessage(msg)
                .setPositiveButton("Herunterladen", (d, w) -> openExternal(apkUrl))
                .setNeutralButton("Überspringen", (d, w) ->
                        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putInt("skip", code).apply())
                .setNegativeButton("Später", null)
                .show();
    }
}
