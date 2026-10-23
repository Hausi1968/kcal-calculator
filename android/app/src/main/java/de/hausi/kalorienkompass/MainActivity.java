package de.hausi.kalorienkompass;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Schlanke Hülle um die Website.
 * - Inhalte & Rechenlogik kommen live von GitHub Pages → Updates „aus der Luft“ ohne neue APK.
 * - Offline läuft die zuletzt geladene Version (Service Worker der Website).
 * - Ändert sich die App-Hülle selbst, prüft sie GitHub Releases und bietet die neue APK an.
 */
public class MainActivity extends Activity {

    private static final String PREFS = "kalorienkompass";
    private static final long CHECK_INTERVAL_MS = 12L * 60 * 60 * 1000; // höchstens alle 12 Stunden

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);       // localStorage → Eingaben bleiben gespeichert
        s.setDatabaseEnabled(true);
        s.setCacheMode(isOnline() ? WebSettings.LOAD_DEFAULT : WebSettings.LOAD_CACHE_ELSE_NETWORK);
        s.setUserAgentString(s.getUserAgentString() + " KalorienKompassApp/" + BuildConfig.VERSION_CODE);

        web.addJavascriptInterface(new Bridge(), "AndroidApp");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (u.toString().startsWith(BuildConfig.WEB_URL)) return false;
                openExternal(u.toString()); // fremde Links im Browser öffnen
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) view.loadUrl("file:///android_asset/offline.html");
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

    private boolean isOnline() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return true;
        NetworkCapabilities nc = cm.getNetworkCapabilities(cm.getActiveNetwork());
        return nc != null && nc.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    private void openExternal(String url) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) { }
    }

    /** Brücke für die Website: Drucken/PDF und erneutes Laden der Startseite */
    private class Bridge {
        @JavascriptInterface
        public void print() {
            runOnUiThread(() -> {
                PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                if (pm == null) return;
                pm.print("KalorienKompass", web.createPrintDocumentAdapter("KalorienKompass"),
                        new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
            });
        }

        @JavascriptInterface
        public void reload() {
            runOnUiThread(() -> web.loadUrl(BuildConfig.WEB_URL));
        }

        @JavascriptInterface
        public int versionCode() { return BuildConfig.VERSION_CODE; }
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
                int latest = Integer.parseInt(rel.optString("tag_name", "0").replaceAll("\\D", "").isEmpty()
                        ? "0" : rel.optString("tag_name").replaceAll("\\D", ""));
                String apk = BuildConfig.APK_URL;
                JSONArray assets = rel.optJSONArray("assets");
                if (assets != null) for (int i = 0; i < assets.length(); i++) {
                    String url = assets.getJSONObject(i).optString("browser_download_url");
                    if (url.endsWith(".apk")) { apk = url; break; }
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
        if (isFinishing() || (Build.VERSION.SDK_INT >= 17 && isDestroyed())) return;
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
