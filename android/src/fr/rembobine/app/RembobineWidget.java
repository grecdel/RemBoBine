package fr.rembobine.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** Widget de l'écran d'accueil : ce qui passe sur la TV, pause/lecture, volume − et +. */
public class RembobineWidget extends AppWidgetProvider {
	@Override
	public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
		try { m.updateAppWidget(ids, Maison.widgetViews(c)); } catch (Exception ignored) {}
		Maison.refresh(c.getApplicationContext());
	}

	static void updateAll(Context c) { Maison.updateWidgets(c.getApplicationContext()); }
}
