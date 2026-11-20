package fr.rembobine.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Boutons du widget et de la notification média : la commande part vers la TV, sans ouvrir l'appli. */
public class RemoteReceiver extends BroadcastReceiver {
	@Override
	public void onReceive(Context c, Intent i) {
		if (i == null || !Maison.ACTION.equals(i.getAction())) return;
		String cmd = i.getStringExtra("cmd");
		if (cmd == null || !cmd.matches("^(toggle|volup|voldown|mute|back10|fwd10|next|stop|pause|resume)$")) return;
		final PendingResult pr = goAsync();
		Maison.command(c.getApplicationContext(), cmd, new Runnable() {
			public void run() { try { pr.finish(); } catch (Exception ignored) {} }
		});
	}
}
