package fr.rembobine.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Locale;

/**
 * Rembobine en « lecteur seul » : un fichier ouvert depuis une autre appli (Fichiers, gestionnaire de téléchargements…)
 * avec « Ouvrir avec Rembobine » : vidéo, musique (plusieurs morceaux s'ils sont envoyés ensemble) ou jeu (émulateur
 * intégré). La même page que sur l'ordinateur (res/raw/rembobine_seul.html, copiée de app/lecteur/seul.html), servie à
 * https://rembobine.app/seul.html ; les fichiers ouverts à https://rembobine.app/seul/media/<n> (seulement eux).
 * Lecteur par défaut : c'est le choix « Toujours » d'Android (jamais imposé par l'appli).
 */
public class LecteurActivity extends Activity {
	private WebView web;
	private final ArrayList<Uri> fichiers = new ArrayList<>();
	private final ArrayList<String> noms = new ArrayList<>();
	private String genre = "";
	private static final String[] JEUX = { "nes", "fds", "sfc", "smc", "gba", "gb", "gbc", "md", "gen", "smd", "sms", "gg", "n64", "z64", "v64", "nds", "pce", "a26", "a78",
		"vb", "vboy", "ngp", "ngc", "ws", "wsc", "32x", "chd", "pbp", "d64", "t64", "prg", "crt", "tzx", "z80", "tap", "cdt", "dsk", "zip" };
	private static final String[] COEURS = { "nes", "nes", "snes", "snes", "gba", "gb", "gb", "segaMD", "segaMD", "segaMD", "segaMS", "segaGG", "n64", "n64", "n64", "nds", "pce", "atari2600", "atari7800",
		"vb", "vb", "ngp", "ngp", "ws", "ws", "sega32x", "psx", "psx", "c64", "c64", "c64", "c64", "fuse", "fuse", "fuse", "cap32", "cap32", "arcade" };
	// la même clé secrète que RembobineActivity : seul le cadre principal de la page la connaît
	private final String cle = nouvelleCle();
	private static String nouvelleCle() {
		byte[] b = new byte[24];
		new java.security.SecureRandom().nextBytes(b);
		StringBuilder h = new StringBuilder();
		for (byte x : b) h.append(String.format("%02x", x & 0xff));
		return h.toString();
	}
	private boolean ok(String k) { return k != null && java.security.MessageDigest.isEqual(cle.getBytes(StandardCharsets.UTF_8), k.getBytes(StandardCharsets.UTF_8)); }
	private static boolean ours(Uri u) { return u != null && "https".equals(u.getScheme()) && "rembobine.app".equals(u.getHost()) && "/seul.html".equals(u.getPath()); }

	@Override
	protected void onCreate(Bundle state) {
		super.onCreate(state);
		getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
		lire(getIntent());
		web = new WebView(this);
		WebSettings s = web.getSettings();
		s.setJavaScriptEnabled(true);
		s.setDomStorageEnabled(true);
		s.setMediaPlaybackRequiresUserGesture(false);
		s.setAllowFileAccess(false);
		web.setBackgroundColor(0xff08090c);
		web.addJavascriptInterface(new Pont(), "RbbSeulAndroid");
		web.setWebChromeClient(new WebChromeClient());
		web.setWebViewClient(new WebViewClient() {
			@Override
			public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) { return !ours(req.getUrl()); }
			@Override
			public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
				Uri u = req.getUrl();
				if (!"rembobine.app".equals(u.getHost()) || u.getPath() == null || u.getPath().contains("..")) return null;
				String p = u.getPath();
				HashMap<String, String> h = new HashMap<>();
				h.put("Access-Control-Allow-Origin", "*");
				try {
					if ("/seul.html".equals(p)) {
						int id = getResources().getIdentifier("rembobine_seul", "raw", getPackageName());
						return new WebResourceResponse("text/html", "utf-8", 200, "OK", h, getResources().openRawResource(id));
					}
					if (p.startsWith("/seul/media/")) {
						int n = Integer.parseInt(u.getLastPathSegment());
						return media(fichiers.get(n), req.getRequestHeaders(), h);
					}
					if (p.startsWith("/ejs/")) {
						String a = p.substring(1);
						String mime = a.endsWith(".js") ? "text/javascript" : a.endsWith(".css") ? "text/css" : a.endsWith(".json") ? "application/json" : a.endsWith(".wasm") ? "application/wasm" : "application/octet-stream";
						return new WebResourceResponse(mime, null, 200, "OK", h, getAssets().open(a));
					}
				} catch (Exception e) {
					return new WebResourceResponse("text/plain", "utf-8", 404, "Absent", h, new java.io.ByteArrayInputStream(new byte[0]));
				}
				return null;
			}
			@Override
			public void onPageFinished(WebView v, String url) {
				if (!ours(url == null ? null : Uri.parse(url))) return;
				v.evaluateJavascript("(function (K) { var A = RbbSeulAndroid; window.rbbSeul = {" +
					" info: function () { try { return Promise.resolve(JSON.parse(A.info(K))); } catch (e) { return Promise.resolve(null); } }," +
					" video: function () { return Promise.resolve({ ok: false }); }, console: function () { return Promise.resolve({ ok: false }); }," +
					" pos: function (p, d) { A.pos(K, Number(p) || 0, Number(d) || 0); return Promise.resolve(true); }," +
					" fin: function () { A.fin(K); return Promise.resolve(true); }, complet: function () { A.complet(K); return Promise.resolve(true); } };" +
					" })(" + JSONObject.quote(cle) + ");", null);
				// la page attend le pont : on la relance une fois qu'il est posé
				v.evaluateJavascript("if (!window.__rbbSeulParti) { window.__rbbSeulParti = 1; document.dispatchEvent(new Event('rbbseul')); }", null);
			}
		});
		setContentView(web);
		immersive();
		web.loadUrl("https://rembobine.app/seul.html");
	}

	@Override
	protected void onNewIntent(Intent i) {
		super.onNewIntent(i);
		setIntent(i);
		lire(i);
		if (web != null) web.loadUrl("https://rembobine.app/seul.html");
	}

	// le fichier (ou les fichiers, s'ils sont envoyés ensemble) donnés par l'autre appli
	private void lire(Intent i) {
		fichiers.clear(); noms.clear(); genre = "";
		if (i == null) return;
		Uri d = i.getData();
		if (d != null) fichiers.add(d);
		ClipData c = i.getClipData();
		if (c != null) for (int k = 0; k < c.getItemCount() && fichiers.size() < 200; k++) { Uri u = c.getItemAt(k).getUri(); if (u != null && !fichiers.contains(u)) fichiers.add(u); }
		for (Uri u : fichiers) noms.add(nom(u));
		String t = i.getType() == null && d != null ? getContentResolver().getType(d) : i.getType();
		String e = noms.isEmpty() ? "" : ext(noms.get(0));
		if (t != null && t.startsWith("video/")) genre = "video";
		else if (t != null && t.startsWith("audio/")) genre = "musique";
		else if (indexJeu(e) >= 0) genre = "jeu";
		else if (e.matches("mkv|mp4|m4v|avi|mov|webm|ts|mpg|mpeg|wmv|flv|3gp")) genre = "video";
		else if (e.matches("mp3|flac|ogg|oga|opus|m4a|aac|wav")) genre = "musique";
	}
	private String nom(Uri u) {
		String n = null;
		try (Cursor c = getContentResolver().query(u, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
			if (c != null && c.moveToFirst()) n = c.getString(0);
		} catch (Exception ignored) {}
		if (n == null) n = u.getLastPathSegment();
		return n == null ? "" : n;
	}
	private static String ext(String n) { int p = n.lastIndexOf('.'); return p < 0 ? "" : n.substring(p + 1).toLowerCase(Locale.ROOT); }
	private static int indexJeu(String e) { for (int k = 0; k < JEUX.length; k++) if (JEUX[k].equals(e)) return k; return -1; }
	private static String titre(String n) {
		String t = n.replaceAll("\\.[A-Za-z0-9]{2,4}$", "").replaceAll("[._]+", " ").replaceAll("\\s*\\[[^\\]]*\\]", "").trim();
		return t.isEmpty() ? n : t;
	}
	private SharedPreferences prefs() { return getSharedPreferences("lecteur_seul", MODE_PRIVATE); }

	// un fichier ouvert, par morceaux (en-tête Range) pour avancer librement
	private WebResourceResponse media(Uri u, java.util.Map<String, String> headers, HashMap<String, String> h) throws Exception {
		String mime = getContentResolver().getType(u);
		if (mime == null) mime = "application/octet-stream";
		long size = -1;
		try (Cursor c = getContentResolver().query(u, new String[] { OpenableColumns.SIZE }, null, null, null)) { if (c != null && c.moveToFirst() && !c.isNull(0)) size = c.getLong(0); } catch (Exception ignored) {}
		InputStream in = getContentResolver().openInputStream(u);
		h.put("Accept-Ranges", "bytes");
		String range = null;
		if (headers != null) for (java.util.Map.Entry<String, String> e : headers.entrySet()) if ("range".equalsIgnoreCase(e.getKey())) range = e.getValue();
		java.util.regex.Matcher m = range == null ? null : java.util.regex.Pattern.compile("bytes=(\\d*)-(\\d*)").matcher(range);
		if (size > 0 && m != null && m.find() && !m.group(1).isEmpty()) {
			long a = Long.parseLong(m.group(1)), z = m.group(2).isEmpty() ? size - 1 : Math.min(size - 1, Long.parseLong(m.group(2)));
			long sk = 0; while (sk < a) { long r = in.skip(a - sk); if (r <= 0) break; sk += r; }
			h.put("Content-Range", "bytes " + a + "-" + z + "/" + size);
			h.put("Content-Length", String.valueOf(z - a + 1));
			final long left0 = z - a + 1;
			InputStream part = new java.io.FilterInputStream(in) {
				long left = left0;
				@Override public int read() throws java.io.IOException { if (left <= 0) return -1; int r = super.read(); if (r >= 0) left--; return r; }
				@Override public int read(byte[] b, int off, int len) throws java.io.IOException { if (left <= 0) return -1; int r = super.read(b, off, (int) Math.min(len, left)); if (r > 0) left -= r; return r; }
			};
			return new WebResourceResponse(mime, null, 206, "Partial Content", h, part);
		}
		if (size > 0) h.put("Content-Length", String.valueOf(size));
		return new WebResourceResponse(mime, null, 200, "OK", h, in);
	}

	private class Pont {
		@JavascriptInterface
		public String info(String k) {
			JSONObject o = new JSONObject();
			if (!ok(k)) return o.toString();
			try {
				String n = noms.isEmpty() ? "" : noms.get(0);
				o.put("genre", genre); o.put("titre", titre(n)); o.put("android", true); o.put("mpv", false); o.put("demander", false);
				if (fichiers.isEmpty()) return o.toString();
				o.put("media", "https://rembobine.app/seul/media/0");
				if ("video".equals(genre)) {
					String id = fichiers.get(0).toString();
					float pos = prefs().getFloat("pos:" + id, 0), dur = prefs().getFloat("dur:" + id, 0);
					if (pos >= 15 && (dur <= 0 || (pos < dur - 30 && pos / dur < 0.95f))) { JSONObject r = new JSONObject(); r.put("pos", pos); r.put("dur", dur); o.put("reprise", r); }
				} else if ("musique".equals(genre)) {
					JSONArray p = new JSONArray();
					for (int i = 0; i < fichiers.size(); i++) { JSONObject t = new JSONObject(); t.put("titre", titre(noms.get(i)).replaceFirst("^\\d{1,3}\\s*[-.)]?\\s*", "")); t.put("url", "https://rembobine.app/seul/media/" + i); p.put(t); }
					o.put("pistes", p); o.put("index", 0);
				} else if ("jeu".equals(genre)) {
					int j = indexJeu(ext(n));
					JSONObject e = new JSONObject();
					if (j >= 0) { e.put("type", "integre"); e.put("core", COEURS[j]); }
					else { e.put("type", "aucun"); e.put("err", "Ce jeu demande une console récente : il se joue avec Rembobine sur un PC."); }
					o.put("emu", e); o.put("ejs", "https://rembobine.app/ejs/data/"); o.put("ejsLocal", true);
				}
			} catch (Exception ignored) {}
			return o.toString();
		}
		@JavascriptInterface
		public void pos(String k, double pos, double dur) {
			if (!ok(k) || fichiers.isEmpty()) return;
			String c = fichiers.get(0).toString();
			prefs().edit().putFloat("pos:" + c, (float) pos).putFloat("dur:" + c, (float) dur).apply();
		}
		@JavascriptInterface
		public void fin(String k) { if (ok(k)) runOnUiThread(new Runnable() { public void run() { finish(); } }); }
		@JavascriptInterface
		public void complet(String k) {
			if (!ok(k)) return;
			runOnUiThread(new Runnable() { public void run() { startActivity(new Intent(LecteurActivity.this, RembobineActivity.class)); finish(); } });
		}
	}

	@Override
	public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) immersive(); }
	private void immersive() {
		if (Build.VERSION.SDK_INT >= 30) {
			WindowInsetsController c = getWindow().getInsetsController();
			if (c != null) { c.hide(WindowInsets.Type.systemBars()); c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE); }
		} else {
			getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
				| View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
		}
	}
	@Override
	protected void onDestroy() { if (web != null) { web.destroy(); web = null; } super.onDestroy(); }
}
