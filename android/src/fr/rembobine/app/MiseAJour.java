package fr.rembobine.app;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;

/**
 * Mises à jour de l'appli Android depuis l'appli (pastille « Nouvelle version détectée » de la page).
 * Même principe que l'application de bureau (app/serveur/maj.js) : la version publiée sur GitHub a un petit fichier
 * build.json (numéro de fabrication, taille et empreinte sha256 de chaque fichier). On compare son numéro au nôtre
 * (res/raw/rbb_build.json, écrit par ci/prepare_android.py, avec le dépôt où chercher), on télécharge Rembobine.apk,
 * on vérifie sa taille et son empreinte, puis que c'est bien Rembobine, signé par la même clé et pas plus ancien ;
 * seulement ensuite l'installateur d'Android s'ouvre (l'utilisateur confirme : Android l'exige).
 * Téléchargements seulement depuis GitHub, en https : api.github.com et github.com/&lt;dépôt&gt;/releases/download/, puis
 * ses serveurs de fichiers (objects.githubusercontent.com, release-assets.githubusercontent.com) après une
 * redirection de GitHub. Aucun jeton : un dépôt privé répond 404, et on le dit clairement (FERME).
 */
final class MiseAJour {
	static final String APK = "Rembobine.apk";
	static final String TAG = "v1.0.0";
	static final String DEPOT_DEFAUT = "grecdel/Rembobine";
	static final String API = "https://api.github.com";
	static final String UA = "Rembobine (mises a jour)";
	static final String FERME = "Les mises à jour automatiques ne sont pas encore ouvertes : il faut rendre publiques les versions de Rembobine — voir l'aide (Mises à jour).";
	static final String HORS_LIGNE = "Pas de connexion à internet (ou GitHub ne répond pas) : on réessaiera plus tard.";
	/** build.json absent ou introuvable (404) : la version publiée est en train d'être remplacée (ou recopiée) ; passager. */
	static final String REMPLACEE = "La version publiée est en train d'être remplacée : on réessaiera plus tard.";
	private static final String[] FICHIERS = { "objects.githubusercontent.com", "release-assets.githubusercontent.com" };

	private MiseAJour() {}

	/** Progression du téléchargement (étape : telechargement, verification ; pourcentage). */
	interface Progres { void etape(String etape, int pct); }

	/** Une erreur à montrer telle quelle ; ferme = dépôt privé ou rien de publié, reseau = réessayer plus tard. */
	static final class Erreur extends Exception {
		final boolean ferme, reseau;
		Erreur(String m, boolean ferme, boolean reseau) { super(m); this.ferme = ferme; this.reseau = reseau; }
	}

	// ---------- notre version ----------
	static JSONObject maVersion(Context c) {
		JSONObject o = new JSONObject();
		try {
			int id = c.getResources().getIdentifier("rbb_build", "raw", c.getPackageName());
			if (id != 0) {
				InputStream in = c.getResources().openRawResource(id);
				try { o = new JSONObject(lire(in, 65536)); } finally { in.close(); }
			}
		} catch (Exception ignored) {}
		try {
			if (!o.has("build")) o.put("build", 0);
			if (o.optString("label", "").isEmpty()) {
				String n = "1.0.0";
				try { n = c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName; } catch (Exception ignored) {}
				o.put("label", n == null ? "1.0.0" : n);
			}
			if (!depotOk(o.optString("depot", ""))) o.put("depot", DEPOT_DEFAUT);
		} catch (Exception ignored) {}
		return o;
	}

	static boolean depotOk(String d) {
		if (d == null || !d.matches("^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$")) return false;
		for (String x : d.split("/")) if (x.equals(".") || x.equals("..")) return false;
		return true;
	}

	// ---------- adresses permises ----------
	static boolean permis(String u, String depot, boolean redirige) {
		try {
			URL x = new URL(u);
			if (!"https".equals(x.getProtocol()) || x.getUserInfo() != null || (x.getPort() != -1 && x.getPort() != 443)) return false;
			String h = x.getHost().toLowerCase(Locale.ROOT), p = x.getPath().toLowerCase(Locale.ROOT), d = depot.toLowerCase(Locale.ROOT);
			if (p.contains("/../") || p.contains("%2e") || p.endsWith("/..")) return false;
			if (h.equals("api.github.com")) return p.startsWith("/repos/" + d + "/releases");
			if (h.equals("github.com")) return p.startsWith("/" + d + "/releases/download/");
			if (!redirige) return false;
			for (String f : FICHIERS) if (h.equals(f)) return true;
			return false;
		} catch (Exception e) {
			return false;
		}
	}

	// une connexion qui suit elle-même les redirections, en vérifiant chaque adresse
	static HttpURLConnection ouvrir(String url, String depot, String accept) throws IOException, Erreur {
		String u = url;
		for (int hop = 0; hop < 6; hop++) {
			if (!permis(u, depot, hop > 0)) throw new Erreur("Adresse de téléchargement refusée (ce n'est pas la page des versions de Rembobine) : rien n'est installé.", false, false);
			HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
			c.setInstanceFollowRedirects(false);
			c.setConnectTimeout(15000);
			c.setReadTimeout(60000);
			c.setRequestProperty("User-Agent", UA);
			if (accept != null) c.setRequestProperty("Accept", accept);
			int code = c.getResponseCode();
			if (code >= 300 && code < 400) {
				String loc = c.getHeaderField("Location");
				c.disconnect();
				if (loc == null) throw new IOException("redirection sans adresse");
				u = new URL(new URL(u), loc).toString();
				continue;
			}
			return c;
		}
		throw new IOException("trop de redirections");
	}

	static JSONObject json(String url, String depot) throws Erreur { return json(url, depot, false); }

	// fichier : un fichier de la version (build.json) plutôt que la liste des versions. Un 404 sur la liste veut dire
	// « dépôt privé ou rien de publié » (FERME) ; sur un fichier, la version est en train d'être remplacée (on réessaiera).
	static JSONObject json(String url, String depot, boolean fichier) throws Erreur {
		HttpURLConnection c = null;
		try {
			c = ouvrir(url, depot, "application/vnd.github+json");
			int code = c.getResponseCode();
			if (code == 404 && fichier) throw new Erreur(REMPLACEE, false, true);
			if (code == 404) throw new Erreur(FERME, true, false);
			if (code == 403 || code == 429) throw new Erreur("GitHub limite les vérifications pour l'instant : on réessaiera plus tard.", false, true);
			if (code != 200) throw new Erreur("GitHub répond " + code + " : on réessaiera plus tard.", false, true);
			InputStream in = c.getInputStream();
			try { return new JSONObject(lire(in, 4 * 1024 * 1024)); } finally { in.close(); }
		} catch (Erreur e) {
			throw e;
		} catch (Exception e) {
			throw new Erreur(HORS_LIGNE, false, true);
		} finally {
			if (c != null) c.disconnect();
		}
	}

	static JSONObject asset(JSONObject rel, String name) {
		JSONArray a = rel == null ? null : rel.optJSONArray("assets");
		if (a == null) return null;
		for (int i = 0; i < a.length(); i++) {
			JSONObject x = a.optJSONObject(i);
			if (x != null && name.equals(x.optString("name"))) return x;
		}
		return null;
	}

	// la version publiée : la plus récente du dépôt, sinon l'étiquette v1.0.0 (404 aux deux : dépôt privé ou rien de publié)
	static JSONObject publication(String depot) throws Erreur {
		JSONObject rel = null;
		try { rel = json(API + "/repos/" + depot + "/releases/latest", depot); } catch (Erreur e) { if (!e.ferme) throw e; }
		if (rel != null && asset(rel, "build.json") != null) return rel;
		try {
			return json(API + "/repos/" + depot + "/releases/tags/" + TAG, depot);
		} catch (Erreur e) {
			if (e.ferme && rel != null) return rel;
			throw e;
		}
	}

	private static String coupe(String s, int n) { return s == null ? "" : s.length() > n ? s.substring(0, n) : s; }

	/**
	 * Ce que la page affiche : version publiée, date, nouveautés, et le fichier pour Android (Rembobine.apk) avec sa
	 * taille et son empreinte (lues dans build.json). « available » : plus récente que la nôtre, avec une empreinte.
	 */
	static JSONObject choisir(JSONObject rel, JSONObject info, int monBuild, String depot, long t) throws Exception {
		JSONObject out = new JSONObject();
		int b = info.optInt("build", 0);
		String label = coupe(info.optString("label", info.optString("version", "1.0.0") + "+" + b), 40);
		out.put("t", t);
		out.put("depot", depot);
		out.put("latest", label);
		out.put("build", b);
		out.put("date", coupe(info.optString("date", ""), 40));
		out.put("notes", coupe(rel.optString("body", ""), 4000));
		JSONObject a = asset(rel, APK), f = null;
		JSONArray files = info.optJSONArray("files");
		if (files != null) for (int i = 0; i < files.length(); i++) {
			JSONObject x = files.optJSONObject(i);
			if (x != null && APK.equals(x.optString("name"))) f = x;
		}
		String sha = f == null ? "" : f.optString("sha256", "");
		if (!sha.matches("^[0-9a-f]{64}$")) sha = "";
		String url = a == null ? "" : a.optString("browser_download_url", "");
		if (a != null && !url.isEmpty()) {
			JSONObject as = new JSONObject();
			as.put("name", APK);
			as.put("size", a.optLong("size", 0));
			as.put("url", url);
			as.put("sha256", sha);
			as.put("fsize", f == null ? 0 : f.optLong("size", 0));
			out.put("asset", as);
		}
		boolean neuve = b > monBuild;
		out.put("available", neuve && !url.isEmpty() && !sha.isEmpty());
		if (neuve && url.isEmpty()) out.put("err", "La version " + label + " n'a pas encore de fichier pour Android.");
		else if (neuve && sha.isEmpty()) out.put("err", "La version " + label + " n'a pas d'empreinte (sha256) pour ce fichier : par sécurité, elle n'est pas proposée.");
		return out;
	}

	/**
	 * La dernière réponse gardée (préférences « majDerniere ») a pu être écrite par la version d'AVANT la mise à jour
	 * (« 1.0.0+62 disponible ») : relue par la 62 elle-même, elle ne propose plus rien.
	 */
	static JSONObject pourCetteVersion(JSONObject l, int monBuild) {
		if (l == null) return null;
		try {
			if (l.has("latest") && l.optInt("build", 0) <= monBuild) {
				l.put("available", false);
				l.remove("err");
			}
		} catch (Exception ignored) {}
		return l;
	}

	static JSONObject verifier(String depot, int monBuild) throws Erreur {
		JSONObject rel = publication(depot), bj = asset(rel, "build.json");
		if (bj == null) throw new Erreur(REMPLACEE, false, true);
		JSONObject info = json(bj.optString("browser_download_url", ""), depot, true);
		try {
			return choisir(rel, info, monBuild, depot, System.currentTimeMillis());
		} catch (Exception e) {
			throw new Erreur("Réponse de GitHub illisible : on réessaiera plus tard.", false, true);
		}
	}

	// ---------- télécharger (cache/maj/Rembobine.apk), taille et empreinte vérifiées ----------
	static File telecharger(Context c, JSONObject last, String depot, Progres p) throws Erreur {
		JSONObject a = last.optJSONObject("asset");
		if (a == null) throw new Erreur("Pas de fichier pour Android dans la version publiée.", false, false);
		String sha = a.optString("sha256", "");
		long want = a.optLong("fsize", 0) > 0 ? a.optLong("fsize", 0) : a.optLong("size", 0);
		if (!sha.matches("^[0-9a-f]{64}$")) throw new Erreur("La version publiée n'a pas d'empreinte (sha256) pour ce fichier : par sécurité, rien n'est installé.", false, false);
		File dir = new File(c.getCacheDir(), "maj");
		if (!dir.isDirectory() && !dir.mkdirs()) throw new Erreur("Impossible de préparer le téléchargement sur le téléphone.", false, false);
		File dest = new File(dir, APK), part = new File(dir, APK + ".part");
		try {
			if (dest.isFile() && (want <= 0 || dest.length() == want) && sha.equals(sha256(dest))) { p.etape("telechargement", 100); return dest; }
		} catch (IOException ignored) {}
		if (want > 0 && dir.getUsableSpace() < want + 50L * 1024 * 1024) throw new Erreur("Pas assez de place sur le téléphone pour télécharger la mise à jour (il faut " + (want / 1048576 + 51) + " Mo).", false, false);
		HttpURLConnection conn = null;
		long got = 0;
		try {
			p.etape("telechargement", 0);
			conn = ouvrir(a.optString("url", ""), depot, null);
			int code = conn.getResponseCode();
			if (code != 200) throw new Erreur("Téléchargement refusé (" + code + ") : on réessaiera plus tard.", false, true);
			InputStream in = conn.getInputStream();
			FileOutputStream out = new FileOutputStream(part);
			try {
				byte[] buf = new byte[256 * 1024];
				int n, dernier = -1;
				while ((n = in.read(buf)) > 0) {
					got += n;
					if (want > 0 && got > want) throw new Erreur("Le fichier téléchargé est abîmé (plus gros que prévu) : rien n'est installé, on réessaiera.", false, false);
					out.write(buf, 0, n);
					int pct = want > 0 ? (int) (got * 100 / want) : 0;
					if (pct != dernier) { dernier = pct; p.etape("telechargement", pct); }
				}
			} finally {
				out.close();
				in.close();
			}
		} catch (Erreur e) {
			part.delete();
			throw e;
		} catch (Exception e) {
			part.delete();
			throw new Erreur("Le téléchargement s'est arrêté (connexion coupée ?) : rien n'est installé, on réessaiera.", false, true);
		} finally {
			if (conn != null) conn.disconnect();
		}
		p.etape("verification", 0);
		boolean bon;
		try { bon = (want <= 0 || part.length() == want) && sha.equals(sha256(part)); } catch (IOException e) { bon = false; }
		if (!bon) {
			part.delete();
			throw new Erreur("Le fichier téléchargé est abîmé (taille ou empreinte incorrecte) : rien n'est installé, on réessaiera.", false, false);
		}
		dest.delete();
		if (!part.renameTo(dest)) { part.delete(); throw new Erreur("Impossible de ranger la mise à jour sur le téléphone : rien n'est installé.", false, false); }
		return dest;
	}

	// ---------- le fichier est-il bien Rembobine, signé par la même clé, et pas plus ancien ? (null = oui) ----------
	@SuppressWarnings("deprecation")
	static String controler(Context c, File apk) {
		try {
			PackageManager pm = c.getPackageManager();
			int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
			PackageInfo neuf = pm.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
			if (neuf == null) return "Ce fichier n'est pas une appli Android lisible : rien n'est installé.";
			if (!c.getPackageName().equals(neuf.packageName)) return "Ce fichier n'est pas Rembobine : rien n'est installé.";
			PackageInfo moi = pm.getPackageInfo(c.getPackageName(), flags);
			long vNeuf = Build.VERSION.SDK_INT >= 28 ? neuf.getLongVersionCode() : neuf.versionCode;
			long vMoi = Build.VERSION.SDK_INT >= 28 ? moi.getLongVersionCode() : moi.versionCode;
			if (vNeuf < vMoi) return "Cette version est plus ancienne que celle installée : rien n'est installé.";
			Signature[] a = signatures(neuf), b = signatures(moi);
			if (a != null && a.length > 0 && b != null && b.length > 0 && !memes(a, b))
				return "Cette version n'est pas signée par la même clé que ton appli (version d'essai ?) : Android refuserait la mise à jour. Désinstalle Rembobine, puis installe le nouvel APK à la main.";
			return null;
		} catch (Exception e) {
			return null;   // (Android vérifie de toute façon la signature au moment d'installer)
		}
	}

	@SuppressWarnings("deprecation")
	private static Signature[] signatures(PackageInfo i) {
		if (Build.VERSION.SDK_INT >= 28) {
			if (i.signingInfo == null) return null;
			return i.signingInfo.hasMultipleSigners() ? i.signingInfo.getApkContentsSigners() : i.signingInfo.getSigningCertificateHistory();
		}
		return i.signatures;
	}

	private static boolean memes(Signature[] a, Signature[] b) {
		for (Signature x : a) for (Signature y : b) if (x != null && x.equals(y)) return true;
		return false;
	}

	static String sha256(File f) throws IOException {
		try {
			MessageDigest md = MessageDigest.getInstance("SHA-256");
			InputStream in = new FileInputStream(f);
			try {
				byte[] buf = new byte[1 << 16];
				int n;
				while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
			} finally {
				in.close();
			}
			StringBuilder sb = new StringBuilder();
			for (byte x : md.digest()) sb.append(String.format(Locale.ROOT, "%02x", x));
			return sb.toString();
		} catch (java.security.NoSuchAlgorithmException e) {
			throw new IOException(e);
		}
	}

	static String lire(InputStream in, int max) throws IOException {
		ByteArrayOutputStream b = new ByteArrayOutputStream();
		byte[] buf = new byte[8192];
		int n;
		while ((n = in.read(buf)) > 0) {
			if (b.size() + n > max) throw new IOException("réponse trop grosse");
			b.write(buf, 0, n);
		}
		return new String(b.toByteArray(), StandardCharsets.UTF_8);
	}
}
