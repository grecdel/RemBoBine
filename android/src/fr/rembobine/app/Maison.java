package fr.rembobine.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.MediaMetadata;
import android.media.VolumeProvider;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Le téléphone parle au serveur de la maison (Rembobine sur la TV) sans passer par la page :
 * widget de l'écran d'accueil, commandes sur l'écran verrouillé (MediaSession + notification média),
 * boutons de volume du téléphone quand l'écran est verrouillé.
 * L'adresse du serveur et la clé d'appairage sont confiées par la page (gamebox.remember) quand la télécommande est reliée.
 */
public final class Maison {
	private Maison() {}

	static final String PREFS = "rbb_maison";
	static final String ACTION = "fr.rembobine.app.TELECOMMANDE";
	private static final String CHANNEL = "rbb_tv";
	private static final int NOTIF = 4343;
	private static MediaSession session;
	private static final Handler ui = new Handler(Looper.getMainLooper());

	static SharedPreferences prefs(Context c) { return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

	static void remember(Context c, String base, String tok, String name) {
		prefs(c).edit().putString("base", base == null ? "" : base).putString("tok", tok == null ? "" : tok).putString("name", name == null ? "" : name).apply();
		RembobineWidget.updateAll(c);
	}

	interface Done { void done(JSONObject r); }

	/** Envoie une demande au serveur (dans un fil à part) ; « done » est appelé sur le fil principal (null si échec). */
	static void call(final Context c, final String path, final JSONObject body, final Done done) {
		final SharedPreferences p = prefs(c);
		final String base = p.getString("base", ""), tok = p.getString("tok", "");
		if (base.isEmpty() || tok.isEmpty()) { if (done != null) ui.post(new Runnable() { public void run() { done.done(null); } }); return; }
		new Thread(new Runnable() {
			public void run() {
				JSONObject out = null;
				HttpURLConnection h = null;
				try {
					h = (HttpURLConnection) new URL(base + path).openConnection();
					h.setConnectTimeout(4000);
					h.setReadTimeout(6000);
					h.setRequestProperty("Authorization", "Bearer " + tok);
					if (body != null) {
						h.setRequestMethod("POST");
						h.setDoOutput(true);
						h.setRequestProperty("Content-Type", "application/json");
						OutputStream os = h.getOutputStream();
						os.write(body.toString().getBytes(StandardCharsets.UTF_8));
						os.close();
					}
					InputStream in = h.getInputStream();
					ByteArrayOutputStream b = new ByteArrayOutputStream();
					byte[] buf = new byte[4096];
					int n;
					while ((n = in.read(buf)) > 0 && b.size() < 200000) b.write(buf, 0, n);
					in.close();
					out = new JSONObject(new String(b.toByteArray(), StandardCharsets.UTF_8));
				} catch (Exception ignored) {
				} finally {
					if (h != null) h.disconnect();
				}
				final JSONObject r = out;
				if (done != null) ui.post(new Runnable() { public void run() { done.done(r); } });
			}
		}).start();
	}

	/** Une commande de la télécommande : toggle, volup, voldown, mute, back10, fwd10, next, stop. */
	static void command(final Context c, String cmd, final Runnable after) {
		JSONObject b = new JSONObject();
		String path = "/api/play/cmd";
		try {
			if ("volup".equals(cmd) || "voldown".equals(cmd) || "mute".equals(cmd)) {
				path = "/api/tel/volume";
				b.put("dir", "volup".equals(cmd) ? "up" : "voldown".equals(cmd) ? "down" : "mute");
			} else if ("back10".equals(cmd) || "fwd10".equals(cmd)) {
				b.put("cmd", "seek");
				b.put("sec", "back10".equals(cmd) ? -10 : 10);
			} else {
				b.put("cmd", cmd);
			}
		} catch (Exception ignored) {}
		call(c, path, b, new Done() {
			public void done(JSONObject r) {
				if (after != null) after.run();
				ui.postDelayed(new Runnable() { public void run() { refresh(c); } }, 500);
			}
		});
	}

	/** Relit ce qui passe sur la TV (widget, notification). */
	static void refresh(final Context c) {
		call(c, "/api/now", null, new Done() {
			public void done(JSONObject r) {
				if (r == null) { RembobineWidget.updateAll(c); return; }
				if (r.optBoolean("playing")) nowPlaying(c, r.optString("title", ""), r.optBoolean("paused"), r.optString("kind", ""));
				else nowPlaying(c, "", false, "");
			}
		});
	}

	/** Ce qui passe sur la TV : met à jour le widget, et la notification média si l'option est active. */
	static void nowPlaying(Context c, String title, boolean paused, String kind) {
		SharedPreferences.Editor e = prefs(c).edit();
		e.putString("title", title == null ? "" : title).putBoolean("paused", paused).putString("kind", kind == null ? "" : kind).apply();
		RembobineWidget.updateAll(c);
		if (title == null || title.isEmpty() || !prefs(c).getBoolean("lock", true)) hide(c);
		else show(c, title, paused);
	}

	static void setLock(Context c, boolean on) {
		prefs(c).edit().putBoolean("lock", on).apply();
		if (!on) hide(c);
	}

	static PendingIntent action(Context c, String cmd, int code) {
		Intent i = new Intent(c, RemoteReceiver.class);
		i.setAction(ACTION);
		i.putExtra("cmd", cmd);
		int fl = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
		return PendingIntent.getBroadcast(c, code, i, fl);
	}

	private static MediaSession session(final Context c) {
		if (session != null) return session;
		final Context app = c.getApplicationContext();
		session = new MediaSession(app, "Rembobine");
		session.setCallback(new MediaSession.Callback() {
			@Override public void onPlay() { command(app, "resume", null); }
			@Override public void onPause() { command(app, "pause", null); }
			@Override public void onStop() { command(app, "stop", null); }
			@Override public void onSkipToNext() { command(app, "next", null); }
			@Override public void onFastForward() { command(app, "fwd10", null); }
			@Override public void onRewind() { command(app, "back10", null); }
		});
		// les boutons de volume du téléphone (même écran verrouillé) règlent le volume de la TV
		session.setPlaybackToRemote(new VolumeProvider(VolumeProvider.VOLUME_CONTROL_RELATIVE, 100, 50) {
			@Override public void onAdjustVolume(int direction) {
				if (direction > 0) command(app, "volup", null);
				else if (direction < 0) command(app, "voldown", null);
			}
		});
		return session;
	}

	private static void show(Context c, String title, boolean paused) {
		Context app = c.getApplicationContext();
		try {
			MediaSession s = session(app);
			String name = prefs(app).getString("name", "la TV");
			s.setMetadata(new MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, title).putString(MediaMetadata.METADATA_KEY_ARTIST, "Sur " + name).build());
			long acts = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_STOP | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_FAST_FORWARD | PlaybackState.ACTION_REWIND;
			s.setPlaybackState(new PlaybackState.Builder().setActions(acts).setState(paused ? PlaybackState.STATE_PAUSED : PlaybackState.STATE_PLAYING, PlaybackState.PLAYBACK_POSITION_UNKNOWN, paused ? 0f : 1f).build());
			s.setActive(true);
			NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
			if (nm == null) return;
			Notification.Builder b;
			if (Build.VERSION.SDK_INT >= 26) {
				if (nm.getNotificationChannel(CHANNEL) == null) {
					NotificationChannel ch = new NotificationChannel(CHANNEL, "Lecture sur la TV", NotificationManager.IMPORTANCE_LOW);
					ch.setShowBadge(false);
					ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
					nm.createNotificationChannel(ch);
				}
				b = new Notification.Builder(app, CHANNEL);
			} else {
				b = new Notification.Builder(app);
			}
			Intent open = new Intent(app, RembobineActivity.class);
			open.putExtra("rbb_telecommande", true);
			open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
			PendingIntent pOpen = PendingIntent.getActivity(app, 1, open, PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
			b.setSmallIcon(android.R.drawable.ic_media_play)
				.setContentTitle(title)
				.setContentText("Sur " + name + (paused ? " · en pause" : ""))
				.setContentIntent(pOpen)
				.setOngoing(!paused)
				.setShowWhen(false)
				.setOnlyAlertOnce(true)
				.setVisibility(Notification.VISIBILITY_PUBLIC)
				.addAction(new Notification.Action.Builder(android.graphics.drawable.Icon.createWithResource(app, android.R.drawable.ic_media_rew), "−10 s", action(app, "back10", 11)).build())
				.addAction(new Notification.Action.Builder(android.graphics.drawable.Icon.createWithResource(app, paused ? android.R.drawable.ic_media_play : android.R.drawable.ic_media_pause), paused ? "Lecture" : "Pause", action(app, "toggle", 12)).build())
				.addAction(new Notification.Action.Builder(android.graphics.drawable.Icon.createWithResource(app, android.R.drawable.ic_media_ff), "+10 s", action(app, "fwd10", 13)).build())
				.addAction(new Notification.Action.Builder(android.graphics.drawable.Icon.createWithResource(app, android.R.drawable.ic_menu_close_clear_cancel), "Arrêter", action(app, "stop", 14)).build())
				.setStyle(new Notification.MediaStyle().setMediaSession(s.getSessionToken()).setShowActionsInCompactView(0, 1, 2));
			nm.notify(NOTIF, b.build());
		} catch (Exception ignored) {
			// pas d'autorisation de notification (Android 13+) : le widget et la télécommande restent utilisables
		}
	}

	static void hide(Context c) {
		try {
			NotificationManager nm = (NotificationManager) c.getApplicationContext().getSystemService(Context.NOTIFICATION_SERVICE);
			if (nm != null) nm.cancel(NOTIF);
		} catch (Exception ignored) {}
		if (session != null) {
			try { session.setActive(false); session.release(); } catch (Exception ignored) {}
			session = null;
		}
	}

	/** Le widget : titre en cours, pause/lecture, volume −/+ (vues construites sans la classe R du projet Godot). */
	static RemoteViews widgetViews(Context c) {
		String pkg = c.getPackageName();
		android.content.res.Resources res = c.getResources();
		int layout = res.getIdentifier("rbb_widget", "layout", pkg);
		RemoteViews v = new RemoteViews(pkg, layout);
		SharedPreferences p = prefs(c);
		String title = p.getString("title", ""), base = p.getString("base", "");
		boolean paused = p.getBoolean("paused", false);
		int tTitle = res.getIdentifier("rbb_w_title", "id", pkg), tSub = res.getIdentifier("rbb_w_sub", "id", pkg);
		int bPlay = res.getIdentifier("rbb_w_play", "id", pkg), bDown = res.getIdentifier("rbb_w_voldown", "id", pkg), bUp = res.getIdentifier("rbb_w_volup", "id", pkg);
		v.setTextViewText(tTitle, base.isEmpty() ? "Rembobine" : title.isEmpty() ? "Rien sur la TV" : title);
		v.setTextViewText(tSub, base.isEmpty() ? "Ouvre la télécommande une fois pour relier ce téléphone" : (p.getString("name", "TV") + (title.isEmpty() ? "" : paused ? " · en pause" : " · en lecture")));
		v.setTextViewText(bPlay, paused || title.isEmpty() ? "▶" : "❚❚");
		v.setOnClickPendingIntent(bPlay, action(c, "toggle", 21));
		v.setOnClickPendingIntent(bDown, action(c, "voldown", 22));
		v.setOnClickPendingIntent(bUp, action(c, "volup", 23));
		Intent open = new Intent(c, RembobineActivity.class);
		open.putExtra("rbb_telecommande", true);
		open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
		v.setOnClickPendingIntent(tTitle, PendingIntent.getActivity(c, 24, open, PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0)));
		return v;
	}

	static void updateWidgets(Context c) {
		try {
			AppWidgetManager m = AppWidgetManager.getInstance(c);
			int[] ids = m.getAppWidgetIds(new ComponentName(c, RembobineWidget.class));
			if (ids != null && ids.length > 0) m.updateAppWidget(ids, widgetViews(c));
		} catch (Exception ignored) {}
	}
}
