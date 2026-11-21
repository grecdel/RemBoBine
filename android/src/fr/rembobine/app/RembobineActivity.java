package fr.rembobine.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.nfc.NdefMessage;
import android.nfc.NdefRecord;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.tech.Ndef;
import android.nfc.tech.NdefFormatable;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.nio.charset.StandardCharsets;

import java.util.ArrayList;
import java.util.HashMap;

/**
 * Rembobine sur Android : affiche le logiciel Rembobine (page HTML embarquée),
 * et ouvre le module 3D facultatif (Godot, dans son propre processus) quand la page le demande.
 */
public class RembobineActivity extends Activity {
	private static final int PICK_FILES = 4242;
	private static final int VOICE = 4244;
	// mise à jour de l'appli : l'installateur d'Android (résultat : annulé ou refusé)
	private static final int MAJ = 4246;
	// télécommande ouverte : les boutons de volume du téléphone règlent la TV (et seulement à ce moment-là)
	private volatile boolean volKeys = false;
	private WebView web;
	private ValueCallback<Uri[]> pending;
	private boolean in3d = false;
	// Cartouches NFC : le téléphone n'écoute les puces que quand la page le demande
	// (télécommande ouverte, ou écran « Écrire une cartouche »), jamais dans le salon.
	private static final String CARTOUCHE_MIME = "application/vnd.rembobine.cartouche";
	private NfcAdapter nfc;
	private volatile boolean nfcOn = false;
	private volatile String nfcToWrite = null;

	@Override
	protected void onCreate(Bundle state) {
		super.onCreate(state);
		getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
		web = new WebView(this);
		WebSettings s = web.getSettings();
		s.setJavaScriptEnabled(true);
		s.setDomStorageEnabled(true);
		s.setDatabaseEnabled(true);
		s.setAllowFileAccess(true);
		s.setMediaPlaybackRequiresUserGesture(false);
		s.setLoadWithOverviewMode(true);
		s.setUseWideViewPort(true);
		web.setBackgroundColor(0xff0d0e12);
		web.addJavascriptInterface(new Bridge(), "GbxAndroid");
		nfc = NfcAdapter.getDefaultAdapter(this);
		// (la réponse gardée a pu être écrite par la version d'avant la mise à jour : recalculée pour celle-ci)
		try { String d = Maison.prefs(this).getString("majDerniere", ""); if (!d.isEmpty()) majLast = MiseAJour.pourCetteVersion(new JSONObject(d), MiseAJour.maVersion(this).optInt("build", 0)); } catch (Exception ignored) {}
		majAuDemarrage();
		web.setWebViewClient(new WebViewClient() {
			// La fenêtre reste sur la page Rembobine (fichier de l'appli) : un lien vers internet s'ouvre dans le navigateur.
			// Sinon une page d'internet ouverte ici aurait accès au pont « GbxAndroid » (clé de la TV, téléchargements…).
			@Override
			public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) { return leave(req.getUrl()); }

			@Override
			@SuppressWarnings("deprecation")
			public boolean shouldOverrideUrlLoading(WebView v, String url) { return leave(Uri.parse(url)); }

			@Override
			public void onPageStarted(WebView v, String url, android.graphics.Bitmap icon) {
				pageOk = ours(url == null ? null : Uri.parse(url));
				super.onPageStarted(v, url, icon);
			}

			// L'émulateur intégré est embarqué dans l'appli (dossier assets/ejs) : la page le charge depuis
			// https://rembobine.app/ejs/…, adresse servie ici, sans internet (de même pour le lecteur de PDF : /pdfjs/).
			@Override
			public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
				Uri u = req.getUrl();
				// la page de l'appli elle-même : toujours annoncée comme une page web (sinon certains téléphones
				// devinent « texte » d'après son contenu et affichent son code au lieu du salon)
				if (ours(u) && u.getPath().endsWith("/rembobine.html")) {
					try {
						int id = getResources().getIdentifier("rembobine", "raw", getPackageName());
						if (id != 0) return new WebResourceResponse("text/html", "utf-8", getResources().openRawResource(id));
					} catch (Exception ignored) {}
				}
				// films emportés hors de la maison : https://rembobine.app/horsligne/<fichier>.mp4 (lecture par morceaux)
				if ("rembobine.app".equals(u.getHost()) && u.getPath() != null && u.getPath().startsWith("/horsligne/")) return offlineResponse(u.getLastPathSegment(), req.getRequestHeaders());
				// le lecteur de manuels PDF (pdf.js, dossier assets/pdfjs) : https://rembobine.app/pdfjs/…, sans internet lui aussi
				if (!"rembobine.app".equals(u.getHost()) || u.getPath() == null || !(u.getPath().startsWith("/ejs/") || u.getPath().startsWith("/pdfjs/")) || u.getPath().contains("..")) return null;
				String p = u.getPath().substring(1);
				String mime = p.endsWith(".js") ? "text/javascript" : p.endsWith(".css") ? "text/css" : p.endsWith(".json") ? "application/json" : p.endsWith(".wasm") ? "application/wasm" : "application/octet-stream";
				HashMap<String, String> h = new HashMap<>();
				h.put("Access-Control-Allow-Origin", "*");
				h.put("Cache-Control", "max-age=604800");
				try {
					return new WebResourceResponse(mime, null, 200, "OK", h, getAssets().open(p));
				} catch (Exception e) {
					return new WebResourceResponse("text/plain", "utf-8", 404, "Absent", h, new java.io.ByteArrayInputStream(new byte[0]));
				}
			}

			@Override
			public void onPageFinished(WebView v, String url) {
				// le pont n'est jamais donné à une autre page que celle de l'appli ; la clé reste enfermée dans les
				// fonctions de window.gamebox (jamais posée sur window : un cadre d'un autre site ne la voit pas)
				if (!ours(url == null ? null : Uri.parse(url))) return;
				// le même « pont » que l'application de bureau : window.gamebox
				v.evaluateJavascript(
					"(function (K) { window.gamebox = { app: true, android: true," +
					" info: function () { var b = {}; try { b = JSON.parse(GbxAndroid.majEtat(K)) || {}; } catch (e) {} return Promise.resolve({ platform: 'android', build: b.current || '' }); }," +
					// mises à jour de l'appli depuis l'appli (MiseAJour.java) : etat() → version, dernière vérification,
					// progression ; verifier() ; installer() (télécharge, vérifie, ouvre l'installateur d'Android). Les
					// résultats arrivent par window.rbbMajAndroid({ type: 'check', last } | { type: 'prog', prog })
					" maj: { etat: function () { try { return JSON.parse(GbxAndroid.majEtat(K)); } catch (e) { return null; } }," +
					"  verifier: function () { GbxAndroid.majVerifier(K); }, installer: function () { GbxAndroid.majInstaller(K); } }," +
					" launch3D: function (a, m) { return new Promise(function (r) { window.__gbx3dDone = r; GbxAndroid.launch3D(K, JSON.stringify(a || []), m ? JSON.stringify(m) : ''); }); }," +
					" playExternal: function () { return Promise.resolve({ ok: false, err: 'android' }); }," +
					// NFC du téléphone : nfc() → 'absent' | 'off' | 'ok' ; nfcWatch(true/false) ; nfcWrite(texte) arme l'écriture de la prochaine puce.
					// Chaque puce touchée appelle window.rbbPhoneTag({ uid, data, written, err }).
					" nfc: function () { return GbxAndroid.nfcState(K); }," +
					" nfcWatch: function (on) { GbxAndroid.nfcWatch(K, !!on); }," +
					" nfcWrite: function (t) { GbxAndroid.nfcWrite(K, t == null ? '' : String(t)); }," +
					" nfcSettings: function () { GbxAndroid.nfcSettings(K); }," +
					// télécommande : raccourci sur l'écran d'accueil, écran en portrait pendant qu'elle est ouverte
					" pinRemote: function () { GbxAndroid.pinRemote(K); }," +
					// films hors-ligne : list() → JSON, save(adresse, fichier, infos) télécharge (progression : window.rbbOfflineProgress), del(fichier)
					" offline: { list: function () { try { return JSON.parse(GbxAndroid.offlineList(K)); } catch (e) { return []; } }," +
					"  save: function (u, f, m) { GbxAndroid.offlineSave(K, String(u), String(f), JSON.stringify(m || {})); }, del: function (f) { GbxAndroid.offlineDelete(K, String(f)); } }," +
					" orient: function (o) { GbxAndroid.orient(K, String(o || '')); }," +
					// téléphone ↔ TV sans la page : widget, écran verrouillé, volume (voir Maison.java)
					" remember: function (b, t, n) { GbxAndroid.remember(K, String(b || ''), String(t || ''), String(n || '')); }," +
					" nowPlaying: function (o) { GbxAndroid.nowPlaying(K, JSON.stringify(o || {})); }," +
					" lockControls: function (on) { GbxAndroid.lockControls(K, !!on); }," +
					" volKeys: function (on) { GbxAndroid.volKeys(K, !!on); }," +
					" pinWidget: function () { return GbxAndroid.pinWidget(K); }," +
					// les Rembobine de la maison (réponse UDP), puis window.rbbFound([{ name, url }])
					" discover: function () { GbxAndroid.discover(K); }," +
					// commande vocale : le service de reconnaissance d'Android, puis window.rbbVoice(texte)
					" voice: function () { return GbxAndroid.voice(K); }," +
					// « Lecteur par défaut » (Paramètres) : les réglages d'Android des applis par défaut
					" defaultApps: function () { GbxAndroid.defaultApps(K); } }; })(" + JSONObject.quote(cle) + ");", null);
				if (openRemote) { openRemote = false; v.evaluateJavascript("setTimeout(function () { window.rbbRemoteOpen && window.rbbRemoteOpen(); }, 900);", null); }
			}
		});
		web.setWebChromeClient(new WebChromeClient() {
			@Override
			public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
				if (pending != null) pending.onReceiveValue(null);
				pending = cb;
				Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
				i.addCategory(Intent.CATEGORY_OPENABLE);
				i.setType("*/*");
				i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
				try {
					startActivityForResult(i, PICK_FILES);
				} catch (Exception e) {
					pending = null;
					return false;
				}
				return true;
			}
		});
		setContentView(web);
		immersive();
		if (state != null) {
			web.restoreState(state);
		} else {
			Intent start = getIntent();
			if (start != null && start.getBooleanExtra(EXTRA_REMOTE, false)) {
				openRemote = true;
				setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT);
			}
			web.loadUrl("file:///android_res/raw/rembobine.html");
		}
	}

	// la page affichée est-elle celle de l'appli ? (le pont GbxAndroid ne répond qu'à elle)
	private volatile boolean pageOk = true;
	// Android donne le pont « GbxAndroid » à TOUS les cadres de la page, y compris ceux des bandes-annonces
	// (YouTube, Dailymotion, Vimeo et leurs publicités). Chaque appel doit donc porter cette clé secrète, tirée au
	// hasard à chaque ouverture de l'appli et placée seulement dans la page de l'appli (cadre principal, voir
	// onPageFinished) : un cadre d'un autre site ne peut pas la lire, ses appels sont ignorés.
	private final String cle = nouvelleCle();
	private static String nouvelleCle() {
		byte[] b = new byte[24];
		new java.security.SecureRandom().nextBytes(b);
		StringBuilder h = new StringBuilder();
		for (byte x : b) h.append(String.format("%02x", x & 0xff));
		return h.toString();
	}
	private boolean ok(String k) {
		return pageOk && k != null && java.security.MessageDigest.isEqual(cle.getBytes(StandardCharsets.UTF_8), k.getBytes(StandardCharsets.UTF_8));
	}
	private static boolean ours(Uri u) {
		return u != null && "file".equals(u.getScheme()) && u.getPath() != null && u.getPath().startsWith("/android_res/raw/") && !u.getPath().contains("..");
	}
	// true = la WebView ne va PAS à cette adresse
	private boolean leave(Uri u) {
		if (ours(u)) return false;
		if (u != null && ("http".equals(u.getScheme()) || "https".equals(u.getScheme()))) {
			try { startActivity(new Intent(Intent.ACTION_VIEW, u).addCategory(Intent.CATEGORY_BROWSABLE)); } catch (Exception ignored) {}
		}
		return true;
	}

	// ouverte par le raccourci « Télécommande » : la page ouvre directement la télécommande
	private boolean openRemote = false;
	private static final String EXTRA_REMOTE = "rbb_telecommande";

	@Override
	protected void onNewIntent(Intent i) {
		super.onNewIntent(i);
		setIntent(i);
		// le module rend la main sans se fermer (« Retour au logiciel ») : il reste en mémoire pour la prochaine fois
		if (i != null && i.getData() != null && RETOUR_3D.equals(i.getData().getScheme())) {
			// « Quitter Rembobine » depuis le module : tout se ferme (le module et le logiciel)
			if ("quitter".equals(i.getData().getHost())) { finishAffinity(); return; }
			alive3d = true;
			back3dIntent = true;
			overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
			return;
		}
		if (i != null && i.getBooleanExtra(EXTRA_REMOTE, false) && web != null) {
			setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT);
			web.evaluateJavascript("window.rbbRemoteOpen && window.rbbRemoteOpen();", null);
		}
	}

	// ---------- films hors-ligne (version légère préparée par le serveur de la maison) ----------
	private static final String OFFLINE_NAME = "^[\\w .\\-()]{1,120}\\.mp4$";
	private java.io.File offlineDir() {
		java.io.File base = getExternalFilesDir(null);
		if (base == null) base = getFilesDir();
		java.io.File d = new java.io.File(base, "HorsLigne");
		if (!d.exists()) d.mkdirs();
		return d;
	}
	private void offlineJs(final String js) {
		runOnUiThread(new Runnable() { public void run() { if (web != null) web.evaluateJavascript(js, null); } });
	}
	// un morceau du fichier (en-tête Range), pour avancer librement dans le film
	private WebResourceResponse offlineResponse(String name, java.util.Map<String, String> headers) {
		HashMap<String, String> h = new HashMap<>();
		h.put("Access-Control-Allow-Origin", "*");
		h.put("Accept-Ranges", "bytes");
		try {
			if (name == null || !name.matches(OFFLINE_NAME)) throw new java.io.FileNotFoundException();
			java.io.File f = new java.io.File(offlineDir(), name);
			long size = f.length(), a = 0, z = size - 1;
			String range = null;
			if (headers != null) for (java.util.Map.Entry<String, String> e : headers.entrySet()) if ("range".equalsIgnoreCase(e.getKey())) range = e.getValue();
			java.util.regex.Matcher m = range == null ? null : java.util.regex.Pattern.compile("bytes=(\\d*)-(\\d*)").matcher(range);
			java.io.FileInputStream in = new java.io.FileInputStream(f);
			if (m != null && m.find() && !m.group(1).isEmpty()) {
				a = Long.parseLong(m.group(1));
				if (!m.group(2).isEmpty()) z = Math.min(size - 1, Long.parseLong(m.group(2)));
				long skipped = 0; while (skipped < a) { long s = in.skip(a - skipped); if (s <= 0) break; skipped += s; }
				h.put("Content-Range", "bytes " + a + "-" + z + "/" + size);
				h.put("Content-Length", String.valueOf(z - a + 1));
				final long left0 = z - a + 1;
				java.io.InputStream part = new java.io.FilterInputStream(in) {
					long left = left0;
					@Override public int read() throws java.io.IOException { if (left <= 0) return -1; int r = super.read(); if (r >= 0) left--; return r; }
					@Override public int read(byte[] b, int off, int len) throws java.io.IOException { if (left <= 0) return -1; int r = super.read(b, off, (int) Math.min(len, left)); if (r > 0) left -= r; return r; }
				};
				return new WebResourceResponse("video/mp4", null, 206, "Partial Content", h, part);
			}
			h.put("Content-Length", String.valueOf(size));
			return new WebResourceResponse("video/mp4", null, 200, "OK", h, in);
		} catch (Exception e) {
			return new WebResourceResponse("text/plain", "utf-8", 404, "Absent", h, new java.io.ByteArrayInputStream(new byte[0]));
		}
	}

	private class Bridge {
		@JavascriptInterface
		public String offlineList(String k) {
			JSONArray out = new JSONArray();
			if (!ok(k)) return out.toString();
			java.io.File[] l = offlineDir().listFiles();
			if (l != null) for (java.io.File f : l) {
				if (!f.getName().matches(OFFLINE_NAME)) continue;
				try {
					JSONObject o = new JSONObject();
					o.put("file", f.getName());
					o.put("size", f.length());
					o.put("at", f.lastModified());
					java.io.File meta = new java.io.File(offlineDir(), f.getName() + ".json");
					if (meta.exists()) {
						byte[] b = new byte[(int) Math.min(meta.length(), 65536)];
						java.io.FileInputStream in = new java.io.FileInputStream(meta);
						int n = in.read(b); in.close();
						o.put("meta", new JSONObject(new String(b, 0, Math.max(0, n), StandardCharsets.UTF_8)));
					}
					out.put(o);
				} catch (Exception ignored) {}
			}
			return out.toString();
		}

		@JavascriptInterface
		public void offlineDelete(String k, String name) {
			if (!ok(k) || name == null || !name.matches(OFFLINE_NAME)) return;
			new java.io.File(offlineDir(), name).delete();
			new java.io.File(offlineDir(), name + ".json").delete();
		}

		// téléchargement en arrière-plan ; la page suit la progression (window.rbbOfflineProgress)
		@JavascriptInterface
		public void offlineSave(String k, final String url, final String name, final String meta) {
			if (!ok(k) || name == null || !name.matches(OFFLINE_NAME) || url == null || !url.matches("^https?://.*")) return;
			new Thread(new Runnable() {
				public void run() {
					java.io.File part = new java.io.File(offlineDir(), name + ".part"), dest = new java.io.File(offlineDir(), name);
					long done = 0, total = -1;
					String err = null;
					try {
						java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
						c.setConnectTimeout(15000);
						c.setReadTimeout(60000);
						if (c.getResponseCode() != 200) throw new java.io.IOException("http " + c.getResponseCode());
						total = c.getContentLength();
						java.io.InputStream in = c.getInputStream();
						java.io.FileOutputStream out = new java.io.FileOutputStream(part);
						byte[] buf = new byte[256 * 1024];
						long last = 0;
						int n;
						while ((n = in.read(buf)) > 0) {
							out.write(buf, 0, n);
							done += n;
							if (System.currentTimeMillis() - last > 1000) {
								last = System.currentTimeMillis();
								offlineJs("window.rbbOfflineProgress && window.rbbOfflineProgress({ file: " + JSONObject.quote(name) + ", done: " + done + ", total: " + total + " });");
							}
						}
						out.close();
						in.close();
						if (!part.renameTo(dest)) throw new java.io.IOException("rename");
						java.io.FileOutputStream mo = new java.io.FileOutputStream(new java.io.File(offlineDir(), name + ".json"));
						mo.write(meta == null ? "{}".getBytes(StandardCharsets.UTF_8) : meta.getBytes(StandardCharsets.UTF_8));
						mo.close();
					} catch (Exception e) {
						err = String.valueOf(e.getMessage());
						part.delete();
					}
					offlineJs("window.rbbOfflineProgress && window.rbbOfflineProgress({ file: " + JSONObject.quote(name) + ", done: " + done + ", total: " + total + ", end: true, ok: " + (err == null) + (err != null ? ", err: " + JSONObject.quote(err) : "") + " });");
				}
			}).start();
		}

		@JavascriptInterface
		public void orient(String k, final String o) {
			if (!ok(k)) return;
			runOnUiThread(new Runnable() {
				public void run() {
					// « portrait » (télécommande), « landscape » (manette) ; sinon l'écran tourne librement (réglage du téléphone respecté)
					setRequestedOrientation("portrait".equals(o) ? android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT : "landscape".equals(o) ? android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE : android.content.pm.ActivityInfo.SCREEN_ORIENTATION_FULL_USER);
				}
			});
		}

		@JavascriptInterface
		public void pinRemote(String k) {
			if (!ok(k) || android.os.Build.VERSION.SDK_INT < 26) return;
			runOnUiThread(new Runnable() {
				public void run() {
					try {
						android.content.pm.ShortcutManager sm = getSystemService(android.content.pm.ShortcutManager.class);
						if (sm == null || !sm.isRequestPinShortcutSupported()) return;
						Intent i = new Intent(RembobineActivity.this, RembobineActivity.class);
						i.setAction(Intent.ACTION_VIEW);
						i.putExtra(EXTRA_REMOTE, true);
						android.content.pm.ShortcutInfo si = new android.content.pm.ShortcutInfo.Builder(RembobineActivity.this, "telecommande")
							.setShortLabel("Télécommande")
							.setLongLabel("Télécommande Rembobine")
							.setIcon(android.graphics.drawable.Icon.createWithResource(RembobineActivity.this, getApplicationInfo().icon))
							.setIntent(i)
							.build();
						sm.requestPinShortcut(si, null);
					} catch (Exception ignored) {}
				}
			});
		}

		@JavascriptInterface
		public void remember(String k, String base, String tok, String name) {
			if (!ok(k) || base == null || !(base.isEmpty() || base.matches("^https?://\\S{3,200}$"))) return;
			Maison.remember(RembobineActivity.this, base, tok, name);
		}

		@JavascriptInterface
		public void nowPlaying(String k, String json) {
			if (!ok(k)) return;
			try {
				JSONObject o = new JSONObject(json);
				final String title = o.optString("title", ""), kind = o.optString("kind", "");
				final boolean paused = o.optBoolean("paused");
				if (!title.isEmpty()) askNotifications();
				// la session média et la notification se manipulent sur le fil principal
				runOnUiThread(new Runnable() { public void run() { Maison.nowPlaying(RembobineActivity.this, title, paused, kind); } });
			} catch (Exception ignored) {}
		}

		@JavascriptInterface
		public void lockControls(String k, boolean on) { if (ok(k)) Maison.setLock(RembobineActivity.this, on); }

		@JavascriptInterface
		public void volKeys(String k, boolean on) { volKeys = on && ok(k); }

		@JavascriptInterface
		public String pinWidget(String k) {
			if (!ok(k)) return "non";
			if (Build.VERSION.SDK_INT < 26) return "ancien";
			try {
				android.appwidget.AppWidgetManager m = android.appwidget.AppWidgetManager.getInstance(RembobineActivity.this);
				if (!m.isRequestPinAppWidgetSupported()) return "non";
				m.requestPinAppWidget(new android.content.ComponentName(RembobineActivity.this, RembobineWidget.class), null, null);
				return "ok";
			} catch (Exception e) {
				return "non";
			}
		}

		@JavascriptInterface
		public void discover(String k) {
			if (!ok(k)) return;
			new Thread(new Runnable() {
				public void run() {
					JSONArray found = new JSONArray();
					java.net.DatagramSocket ds = null;
					try {
						ds = new java.net.DatagramSocket();
						ds.setBroadcast(true);
						ds.setSoTimeout(400);
						byte[] q = "{\"rbb\":1,\"q\":1}".getBytes(StandardCharsets.UTF_8);
						ds.send(new java.net.DatagramPacket(q, q.length, java.net.InetAddress.getByName("255.255.255.255"), 41380));
						java.util.HashSet<String> seen = new java.util.HashSet<>();
						long end = System.currentTimeMillis() + 1800;
						byte[] buf = new byte[2048];
						while (System.currentTimeMillis() < end) {
							java.net.DatagramPacket pk = new java.net.DatagramPacket(buf, buf.length);
							try { ds.receive(pk); } catch (java.net.SocketTimeoutException t) { continue; }
							try {
								JSONObject o = new JSONObject(new String(pk.getData(), 0, pk.getLength(), StandardCharsets.UTF_8));
								int port = o.optInt("port", 0);
								if (o.optInt("rbb", 0) != 1 || port <= 0 || port > 65535) continue;
								String url = "http://" + pk.getAddress().getHostAddress() + ":" + port;
								if (!seen.add(url)) continue;
								JSONObject r = new JSONObject();
								r.put("url", url);
								r.put("name", o.optString("name", "Rembobine"));
								found.put(r);
							} catch (Exception ignored) {}
						}
					} catch (Exception ignored) {
					} finally {
						if (ds != null) ds.close();
					}
					final String js = "window.rbbFound && window.rbbFound(" + found.toString() + ");";
					runOnUiThread(new Runnable() { public void run() { web.evaluateJavascript(js, null); } });
				}
			}).start();
		}

		@JavascriptInterface
		public String voice(String k) {
			if (!ok(k)) return "absent";
			try {
				Intent i = new Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
				i.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL, android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
				i.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE, "fr-FR");
				i.putExtra(android.speech.RecognizerIntent.EXTRA_PROMPT, "Dis une commande pour la TV");
				i.putExtra(android.speech.RecognizerIntent.EXTRA_MAX_RESULTS, 1);
				startActivityForResult(i, VOICE);
				return "ok";
			} catch (Exception e) {
				return "absent";
			}
		}

		// « Lecteur par défaut » : Android choisit lui-même (« Toujours » quand on ouvre un fichier) ; on ouvre seulement
		// ses réglages d'applis par défaut (sinon la fiche de Rembobine, rubrique « Ouvrir par défaut »)
		@JavascriptInterface
		public void defaultApps(String k) {
			if (!ok(k)) return;
			runOnUiThread(new Runnable() {
				public void run() {
					try { startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS)); }
					catch (Exception e) {
						try { startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))); } catch (Exception ignored) {}
					}
				}
			});
		}

		@JavascriptInterface
		public String nfcState(String k) {
			if (!ok(k)) return "absent";
			if (nfc == null) return "absent";
			return nfc.isEnabled() ? "ok" : "off";
		}

		@JavascriptInterface
		public void nfcWatch(String k, final boolean on) {
			if (!ok(k)) return;
			runOnUiThread(new Runnable() {
				public void run() {
					nfcOn = on;
					if (!on) nfcToWrite = null;
					nfcApply();
				}
			});
		}

		@JavascriptInterface
		public void nfcWrite(String k, String text) {
			if (!ok(k)) return;
			nfcToWrite = (text == null || text.isEmpty()) ? null : text;
		}

		@JavascriptInterface
		public void nfcSettings(String k) {
			if (!ok(k)) return;
			runOnUiThread(new Runnable() {
				public void run() {
					try {
						startActivity(new Intent(android.provider.Settings.ACTION_NFC_SETTINGS));
					} catch (Exception e) {
						startActivity(new Intent(android.provider.Settings.ACTION_WIRELESS_SETTINGS));
					}
				}
			});
		}

		// ---------- mises à jour de l'appli (voir MiseAJour.java) ----------
		@JavascriptInterface
		public String majEtat(String k) {
			if (!ok(k)) return "{}";
			try {
				JSONObject v = MiseAJour.maVersion(RembobineActivity.this), o = new JSONObject();
				o.put("current", v.optString("label", ""));
				o.put("build", v.optInt("build", 0));
				o.put("depot", v.optString("depot", ""));
				o.put("mode", "android");
				if (majLast != null) o.put("last", majLast);
				o.put("prog", majProgres);
				o.put("busy", majBusy ? "mise à jour" : "");
				return o.toString();
			} catch (Exception e) {
				return "{}";
			}
		}

		@JavascriptInterface
		public void majVerifier(String k) {
			if (!ok(k)) return;
			new Thread(new Runnable() {
				public void run() {
					majVerifierMaintenant();
					JSONObject l = majLast;
					majJs("window.rbbMajAndroid && window.rbbMajAndroid({ type: 'check', last: " + (l == null ? "null" : l.toString()) + " });");
				}
			}).start();
		}

		@JavascriptInterface
		public void majInstaller(String k) {
			if (!ok(k) || majBusy) return;
			majBusy = true;
			new Thread(new Runnable() {
				public void run() {
					try {
						majEtape("telechargement", 0, null);
						majVerifierMaintenant();
						JSONObject r = majLast;
						if (r == null || !r.optBoolean("available")) {
							String err = r == null ? MiseAJour.HORS_LIGNE : r.optString("err", r.optString("errNet", ""));
							if (err.isEmpty()) majEtape("fini", 100, "Rembobine est déjà à jour.");
							else majEtape("echec", 0, err);
							majBusy = false;
							return;
						}
						JSONObject v = MiseAJour.maVersion(RembobineActivity.this);
						final File apk = MiseAJour.telecharger(RembobineActivity.this, r, v.optString("depot", MiseAJour.DEPOT_DEFAUT), new MiseAJour.Progres() {
							public void etape(String e, int pct) { majEtape(e, pct, null); }
						});
						majEtape("verification", 100, null);
						String pb = MiseAJour.controler(RembobineActivity.this, apk);
						if (pb != null) { apk.delete(); majEtape("echec", 0, pb); majBusy = false; return; }
						runOnUiThread(new Runnable() { public void run() { majLancerInstallation(apk); } });
					} catch (MiseAJour.Erreur e) {
						majEtape("echec", 0, e.getMessage());
						majBusy = false;
					} catch (Exception e) {
						majEtape("echec", 0, "La mise à jour n'a pas pu se faire : rien n'a changé.");
						majBusy = false;
					}
				}
			}).start();
		}

		@JavascriptInterface
		public void launch3D(String k, final String json, final String maison) {
			if (!ok(k)) return;
			// la progression du module gardée par le serveur de la maison : il prend la plus récente
			// (le module lit et écrit dans le dossier de l'appli, son « user:// »)
			if (maison != null && maison.startsWith("{") && maison.length() < 1500000) {
				try (java.io.FileOutputStream o = new java.io.FileOutputStream(new java.io.File(getFilesDir(), "monde3d_maison.json"))) {
					o.write(maison.getBytes(StandardCharsets.UTF_8));
				} catch (Exception ignored) {
				}
			}
			runOnUiThread(new Runnable() {
				public void run() {
					start3D(json, Maison.prefs(RembobineActivity.this).getBoolean("monde3dCompat", false), false);
				}
			});
		}
	}

	// ---------- mises à jour de l'appli ----------
	// dernière vérification (gardée entre deux ouvertures), progression montrée par la page, APK en attente d'autorisation
	private volatile JSONObject majLast = null;
	private volatile JSONObject majProgres = new JSONObject();
	private volatile boolean majBusy = false;
	private File majEnAttente = null;
	private boolean majAutorisationDemandee = false;

	private void majJs(final String js) {
		runOnUiThread(new Runnable() { public void run() { if (web != null) web.evaluateJavascript(js, null); } });
	}

	private void majEtape(String etape, int pct, String msg) {
		try {
			JSONObject p = new JSONObject();
			p.put("etape", etape);
			p.put("pct", Math.max(0, Math.min(100, pct)));
			p.put("t", System.currentTimeMillis());
			JSONObject l = majLast;
			if (l != null) p.put("version", l.optString("latest", ""));
			if (msg != null && !msg.isEmpty()) p.put("echec".equals(etape) ? "err" : "msg", msg);
			majProgres = p;
		} catch (Exception ignored) {}
		majJs("window.rbbMajAndroid && window.rbbMajAndroid({ type: 'prog', prog: " + majProgres.toString() + " });");
	}

	// vérifie et garde la réponse ; sans réseau, on garde ce qu'on savait déjà (la pastille reste)
	private void majVerifierMaintenant() {
		JSONObject v = MiseAJour.maVersion(this);
		String depot = v.optString("depot", MiseAJour.DEPOT_DEFAUT);
		JSONObject r;
		try {
			r = MiseAJour.verifier(depot, v.optInt("build", 0));
		} catch (MiseAJour.Erreur e) {
			try {
				JSONObject l = majLast;
				if (e.reseau && l != null && l.has("latest")) {
					r = new JSONObject(l.toString());
					r.put("errNet", e.getMessage());
					r.put("tErr", System.currentTimeMillis());
				} else {
					r = new JSONObject();
					r.put("t", System.currentTimeMillis());
					r.put("depot", depot);
					r.put("err", e.getMessage());
					r.put("closed", e.ferme);
					r.put("available", false);
				}
			} catch (Exception x) {
				r = new JSONObject();
			}
		}
		majLast = r;
		try { Maison.prefs(this).edit().putString("majDerniere", r.toString()).apply(); } catch (Exception ignored) {}
	}

	// l'installateur d'Android (l'utilisateur confirme) ; Android 8 et plus : il faut d'abord autoriser Rembobine à
	// installer des applis (réglage ouvert ici, l'installation continue toute seule au retour dans l'appli)
	@SuppressWarnings("deprecation")
	private void majLancerInstallation(File apk) {
		if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
			majEnAttente = apk;
			majAutorisationDemandee = true;
			// Android 11 et plus arrête l'appli quand on accorde l'autorisation : une marque gardée (empreinte du fichier
			// téléchargé) permet de reprendre l'installation au redémarrage (majAuDemarrage), sans retélécharger
			try {
				JSONObject l = majLast, a = l == null ? null : l.optJSONObject("asset");
				Maison.prefs(this).edit().putString("majReprendre", a == null ? "" : a.optString("sha256", "")).apply();
			} catch (Exception ignored) {}
			majEtape("installation", 0, "Autorise Rembobine à installer des applis, puis reviens dans Rembobine : l'installation continue toute seule.");
			try {
				startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
			} catch (Exception e) {
				majEnAttente = null;
				majAutorisationDemandee = false;
				majBusy = false;
				majEtape("echec", 0, "Android ne laisse pas Rembobine installer sa mise à jour : autorise « Installer des applis inconnues » pour Rembobine dans les réglages du téléphone.");
			}
			return;
		}
		majEnAttente = null;
		try {
			Uri u = androidx.core.content.FileProvider.getUriForFile(this, getPackageName() + ".maj", apk);
			Intent i = new Intent(Intent.ACTION_INSTALL_PACKAGE);
			i.setDataAndType(u, "application/vnd.android.package-archive");
			i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
			i.putExtra(Intent.EXTRA_RETURN_RESULT, true);
			i.putExtra(Intent.EXTRA_INSTALLER_PACKAGE_NAME, getPackageName());
			majEtape("installation", 50, "Android te demande de confirmer l'installation.");
			startActivityForResult(i, MAJ);
		} catch (Exception e) {
			majBusy = false;
			majEtape("echec", 0, "L'installateur d'Android n'a pas pu s'ouvrir : rien n'a changé.");
		}
	}

	// Au démarrage : reprendre une installation interrompue par Android (autorisation accordée, appli redémarrée), sinon
	// effacer l'APK téléchargé s'il n'est pas plus récent que l'appli installée (plus de 100 Mo laissés dans le cache).
	@SuppressWarnings("deprecation")
	private void majAuDemarrage() {
		final android.content.SharedPreferences pr = Maison.prefs(this);
		final String reprendre = pr.getString("majReprendre", "");
		if (!reprendre.isEmpty()) pr.edit().remove("majReprendre").apply();
		new Thread(new Runnable() {
			public void run() {
				try {
					File dir = new File(getCacheDir(), "maj"), apk = new File(dir, MiseAJour.APK);
					if (!apk.isFile()) return;
					boolean permis = Build.VERSION.SDK_INT < 26 || getPackageManager().canRequestPackageInstalls();
					if (reprendre.matches("^[0-9a-f]{64}$") && permis && reprendre.equals(MiseAJour.sha256(apk)) && MiseAJour.controler(RembobineActivity.this, apk) == null && plusRecent(apk)) {
						majBusy = true;
						// (après un court instant : la page a le temps de s'ouvrir et de montrer la progression)
						web.postDelayed(new Runnable() { public void run() { majLancerInstallation(apk); } }, 2500);
						return;
					}
					if (!plusRecent(apk)) { File[] l = dir.listFiles(); if (l != null) for (File f : l) f.delete(); }
				} catch (Exception ignored) {}
			}
		}).start();
	}

	@SuppressWarnings("deprecation")
	private boolean plusRecent(File apk) {
		try {
			android.content.pm.PackageManager pm = getPackageManager();
			android.content.pm.PackageInfo neuf = pm.getPackageArchiveInfo(apk.getAbsolutePath(), 0), moi = pm.getPackageInfo(getPackageName(), 0);
			if (neuf == null) return false;
			long a = Build.VERSION.SDK_INT >= 28 ? neuf.getLongVersionCode() : neuf.versionCode, b = Build.VERSION.SDK_INT >= 28 ? moi.getLongVersionCode() : moi.versionCode;
			return a > b;
		} catch (Exception e) {
			return true;   // (dans le doute, on garde le fichier : il sera revérifié avant d'installer)
		}
	}

	// Ouvre le module 3D (Godot, dans son propre processus). compat : mode graphique simplifié (OpenGL),
	// essayé tout seul si la 3D se ferme aussitôt (carte graphique trop ancienne pour Vulkan) puis retenu.
	// « --veille=android » : au « Retour au logiciel », le jeu ne se ferme pas ; il fond au noir, se met
	// en pause et nous rend la main par le lien rembobine-retour://monde3d. La fois suivante, on le ramène simplement
	// devant (même activité, encore en mémoire) : il reprend là où on était, par un fondu, sans rien recharger.
	// Si Android l'a fermé entre-temps (mémoire), il redémarre normalement avec les mêmes arguments.
	private static final String RETOUR_3D = "rembobine-retour";
	private String json3d = "[]";
	private boolean compat3d = false, retry3d = false, alive3d = false, back3dIntent = false;
	private long t3d = 0;

	private void start3D(String json, boolean compat, boolean retry) {
		json3d = json;
		compat3d = compat;
		retry3d = retry;
		ArrayList<String> args = new ArrayList<>();
		if (compat) {
			args.add("--rendering-driver");
			args.add("opengl3");
			args.add("--rendering-method");
			args.add("gl_compatibility");
		}
		args.add("--");
		args.add("--embarque");
		args.add("--veille=android");
		JSONObject chaud = new JSONObject();
		try {
			JSONArray a = new JSONArray(json);
			for (int k = 0; k < a.length(); k++) {
				String x = a.optString(k, "");
				if (x.length() <= 400 && x.matches("^--[a-z]+=[\\p{L}\\p{N}_:,' \\-]*$") && !x.startsWith("--veille=")) {
					args.add(x);
					// réglages appliqués à chaud si le module est encore en mémoire
					if (x.startsWith("--meteo=")) chaud.put("meteo", x.substring(8));
					if (x.startsWith("--ville=")) chaud.put("ville", x.substring(8));
				}
			}
		} catch (Exception ignored) {
		}
		if (compat) args.add("--simplifie=1");
		if (alive3d) {
			for (java.io.File d : new java.io.File[] { getFilesDir(), getExternalFilesDir(null) }) {
				if (d == null) continue;
				try (java.io.FileOutputStream o = new java.io.FileOutputStream(new java.io.File(d, "monde3d_montre.json"))) {
					o.write(chaud.toString().getBytes(StandardCharsets.UTF_8));
				} catch (Exception ignored) {
				}
			}
		} else {
			for (java.io.File f : ok3dFiles()) f.delete();
		}
		Intent i = new Intent();
		i.setClassName(getPackageName(), "com.godot.game.GodotApp");
		i.putExtra("command_line_params", args.toArray(new String[0]));
		// (le jeu a sa propre tâche : s'il est encore en mémoire, il revient simplement devant)
		i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
		in3d = true;
		back3dIntent = false;
		t3d = System.currentTimeMillis();
		startActivity(i);
		overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
	}

	// le module écrit « monde3d_ok » (dans user://) dès qu'il a affiché ses premières images
	private java.io.File[] ok3dFiles() {
		ArrayList<java.io.File> l = new ArrayList<>();
		l.add(new java.io.File(getFilesDir(), "monde3d_ok"));
		java.io.File ext = getExternalFilesDir(null);
		if (ext != null) l.add(new java.io.File(ext, "monde3d_ok"));
		return l.toArray(new java.io.File[0]);
	}

	private boolean ok3d() {
		for (java.io.File f : ok3dFiles()) if (f.exists()) return true;
		return false;
	}

	// retour du module : s'il s'est refermé aussitôt sans rien afficher, on réessaie en mode simplifié
	private void back3D() {
		// rendu par « Retour au logiciel » : le jeu reste en mémoire ; sinon il s'est fermé (ou a planté)
		boolean viaRetour = back3dIntent;
		back3dIntent = false;
		if (!viaRetour) alive3d = false;
		boolean quick = !viaRetour && System.currentTimeMillis() - t3d < 8000 && !ok3d();
		if (quick && !compat3d) {
			Maison.prefs(this).edit().putBoolean("monde3dCompat", true).apply();
			start3D(json3d, true, true);
			return;
		}
		// au retour : la progression du module (succès pour le bilan de l'année, copie pour le serveur de la maison)
		String m3 = quick ? "" : read3d();
		String mj = "monde3d: (function () { try { return JSON.parse(" + JSONObject.quote(m3) + "); } catch (e) { return null; } })()";
		String r = quick ? "{ ok: false, err: 'gpu' }" : (retry3d ? "{ ok: true, compat1: true, " + mj + " }" : "{ ok: true, " + mj + " }");
		web.evaluateJavascript("window.__gbx3dDone && window.__gbx3dDone(" + r + ");", null);
	}

	// lecture des puces seulement quand la page l'a demandé et que l'appli est au premier plan
	private void nfcApply() {
		if (nfc == null) return;
		try {
			if (nfcOn) {
				Bundle opts = new Bundle();
				opts.putInt(NfcAdapter.EXTRA_READER_PRESENCE_CHECK_DELAY, 250);
				nfc.enableReaderMode(this, new NfcAdapter.ReaderCallback() {
					public void onTagDiscovered(Tag tag) {
						onTag(tag);
					}
				}, NfcAdapter.FLAG_READER_NFC_A | NfcAdapter.FLAG_READER_NFC_B | NfcAdapter.FLAG_READER_NFC_F | NfcAdapter.FLAG_READER_NFC_V, opts);
			} else {
				nfc.disableReaderMode(this);
			}
		} catch (Exception ignored) {
		}
	}

	// une puce touchée : son numéro, ce qu'elle contient déjà, et l'écriture si elle était demandée
	private void onTag(Tag tag) {
		JSONObject o = new JSONObject();
		try {
			StringBuilder hex = new StringBuilder();
			for (byte b : tag.getId()) hex.append(String.format("%02X", b));
			o.put("uid", hex.toString());
			Ndef ndef = Ndef.get(tag);
			if (ndef != null) {
				try {
					ndef.connect();
					NdefMessage m = ndef.getNdefMessage();
					if (m == null) m = ndef.getCachedNdefMessage();
					if (m != null) for (NdefRecord r : m.getRecords()) {
						if (r.getTnf() == NdefRecord.TNF_MIME_MEDIA && CARTOUCHE_MIME.equals(new String(r.getType(), StandardCharsets.US_ASCII))) {
							o.put("data", new String(r.getPayload(), StandardCharsets.UTF_8));
						}
					}
				} catch (Exception ignored) {
				} finally {
					try { ndef.close(); } catch (Exception ignored) {}
				}
			}
			String w = nfcToWrite;
			if (w != null) {
				nfcToWrite = null;
				NdefMessage msg = new NdefMessage(new NdefRecord[] { NdefRecord.createMime(CARTOUCHE_MIME, w.getBytes(StandardCharsets.UTF_8)) });
				String err = null;
				try {
					if (ndef != null) {
						ndef.connect();
						if (!ndef.isWritable()) err = "verrou";
						else if (ndef.getMaxSize() < msg.toByteArray().length) err = "petite";
						else ndef.writeNdefMessage(msg);
						ndef.close();
					} else {
						NdefFormatable f = NdefFormatable.get(tag);
						if (f == null) err = "format";
						else { f.connect(); f.format(msg); f.close(); }
					}
				} catch (Exception e) {
					err = "ecriture";
				}
				o.put("written", err == null);
				if (err != null) o.put("err", err);
				else o.put("data", w);
			}
		} catch (Exception ignored) {
		}
		final String js = "window.rbbPhoneTag && window.rbbPhoneTag(" + o.toString() + ");";
		runOnUiThread(new Runnable() {
			public void run() {
				web.evaluateJavascript(js, null);
			}
		});
	}

	@Override
	protected void onPause() {
		super.onPause();
		volKeys = false;
		if (nfc != null) try { nfc.disableReaderMode(this); } catch (Exception ignored) {}
	}

	@Override
	protected void onResume() {
		super.onResume();
		immersive();
		nfcApply();
		if (majEnAttente != null && majAutorisationDemandee) {
			majAutorisationDemandee = false;
			try { Maison.prefs(this).edit().remove("majReprendre").apply(); } catch (Exception ignored) {}
			final File apk = majEnAttente;
			if (Build.VERSION.SDK_INT < 26 || getPackageManager().canRequestPackageInstalls()) majLancerInstallation(apk);
			else { majEnAttente = null; majBusy = false; majEtape("echec", 0, "Sans l'autorisation d'installer des applis, Android ne peut pas mettre Rembobine à jour. Tu peux réessayer quand tu veux."); }
		}
		if (in3d) {
			in3d = false;
			back3D();
		}
	}

	private String read3d() {
		java.io.File f = new java.io.File(getFilesDir(), "monde3d.json");
		if (!f.isFile() || f.length() > 2000000) return "";
		try (java.io.FileInputStream in = new java.io.FileInputStream(f)) {
			byte[] b = new byte[(int) f.length()];
			int n = 0;
			while (n < b.length) { int k = in.read(b, n, b.length - n); if (k < 0) break; n += k; }
			return new String(b, 0, n, StandardCharsets.UTF_8);
		} catch (Exception e) {
			return "";
		}
	}

	// la notification « en cours sur la TV » demande l'autorisation sur Android 13 et plus (une seule fois)
	private void askNotifications() {
		if (Build.VERSION.SDK_INT < 33) return;
		runOnUiThread(new Runnable() {
			public void run() {
				try {
					if (checkSelfPermission("android.permission.POST_NOTIFICATIONS") == android.content.pm.PackageManager.PERMISSION_GRANTED) return;
					android.content.SharedPreferences p = Maison.prefs(RembobineActivity.this);
					if (p.getBoolean("askedNotif", false)) return;
					p.edit().putBoolean("askedNotif", true).apply();
					requestPermissions(new String[] { "android.permission.POST_NOTIFICATIONS" }, 4245);
				} catch (Exception ignored) {}
			}
		});
	}

	// boutons de volume : à la TV seulement quand la télécommande est ouverte (sinon, le volume du téléphone)
	@Override
	public boolean dispatchKeyEvent(KeyEvent e) {
		int k = e.getKeyCode();
		if (volKeys && (k == KeyEvent.KEYCODE_VOLUME_UP || k == KeyEvent.KEYCODE_VOLUME_DOWN)) {
			if (e.getAction() == KeyEvent.ACTION_DOWN) {
				web.evaluateJavascript("window.rbbVolKey && window.rbbVolKey('" + (k == KeyEvent.KEYCODE_VOLUME_UP ? "up" : "down") + "');", null);
			}
			return true;
		}
		return super.dispatchKeyEvent(e);
	}

	@Override
	protected void onActivityResult(int req, int res, Intent data) {
		super.onActivityResult(req, res, data);
		if (req == MAJ) {
			// (une installation réussie remplace l'appli : on n'arrive en général pas jusqu'ici)
			majBusy = false;
			if (res == RESULT_OK) majEtape("redemarrage", 100, null);
			else if (res == RESULT_CANCELED) majEtape("echec", 0, "Installation annulée : rien n'a changé, tu peux réessayer quand tu veux.");
			else {
				int code = data == null ? 0 : data.getIntExtra("android.intent.extra.INSTALL_RESULT", 0);
				majEtape("echec", 0, "Android a refusé l'installation" + (code != 0 ? " (code " + code + ")" : "") + " : rien n'a changé.");
			}
			return;
		}
		if (req == VOICE) {
			String said = "";
			if (res == RESULT_OK && data != null) {
				ArrayList<String> r = data.getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS);
				if (r != null && !r.isEmpty()) said = r.get(0);
			}
			web.evaluateJavascript("window.rbbVoice && window.rbbVoice(" + JSONObject.quote(said) + ");", null);
			return;
		}
		if (req != PICK_FILES || pending == null) return;
		Uri[] out = null;
		if (res == RESULT_OK && data != null) {
			if (data.getClipData() != null) {
				int n = data.getClipData().getItemCount();
				out = new Uri[n];
				for (int k = 0; k < n; k++) out[k] = data.getClipData().getItemAt(k).getUri();
			} else if (data.getData() != null) {
				out = new Uri[] { data.getData() };
			}
		}
		pending.onReceiveValue(out);
		pending = null;
	}

	@Override
	public void onBackPressed() {
		// le bouton retour ferme les fenêtres du logiciel (comme Échap) au lieu de quitter
		web.evaluateJavascript("(function(){var e=new KeyboardEvent('keydown',{key:'Escape',bubbles:true});document.dispatchEvent(e);return document.querySelector('.scrim:not([hidden])')?1:0;})()", null);
	}

	@Override
	protected void onSaveInstanceState(Bundle out) {
		super.onSaveInstanceState(out);
		web.saveState(out);
	}

	private void immersive() {
		if (Build.VERSION.SDK_INT >= 30) {
			WindowInsetsController c = getWindow().getInsetsController();
			if (c != null) {
				c.hide(WindowInsets.Type.systemBars());
				c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
			}
		} else {
			getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
				| View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
				| View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
		}
	}
}
