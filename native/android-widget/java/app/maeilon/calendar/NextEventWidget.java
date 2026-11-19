package app.maeilon.calendar;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class NextEventWidget extends AppWidgetProvider {
    static final String CACHE_KEY = "widget.next";
    static final String PREFS = "CapacitorStorage";
    private static final String ADVANCE = "app.maeilon.calendar.WIDGET_ADVANCE";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        refresh(context);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ADVANCE.equals(intent.getAction()) || Intent.ACTION_TIME_CHANGED.equals(intent.getAction())
                || Intent.ACTION_TIMEZONE_CHANGED.equals(intent.getAction())) {
            refresh(context);
        }
    }

    @Override
    public void onDisabled(Context context) {
        context.getSystemService(AlarmManager.class).cancel(advanceIntent(context));
    }

    static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, NextEventWidget.class));
        if (ids.length == 0) return;
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        JSONObject next = firstUnexpired(preferences.getString(CACHE_KEY, "[]"), now);
        RemoteViews view = new RemoteViews(context.getPackageName(), R.layout.next_event_widget);
        boolean underway = next != null && next.optLong("from") <= now;
        String heading = context.getString(underway ? R.string.next_widget_underway : R.string.next_widget_heading);
        String title = next == null ? context.getString(R.string.next_widget_empty) : next.optString("title");
        String subtitle = next == null ? context.getString(R.string.next_widget_open) : next.optString("subtitle");
        view.setTextViewText(R.id.next_widget_heading, heading);
        view.setTextViewText(R.id.next_widget_title, title);
        view.setTextViewText(R.id.next_widget_subtitle, subtitle);
        Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (open != null) {
            view.setOnClickPendingIntent(R.id.next_widget_root, PendingIntent.getActivity(context, 0, open,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        }
        manager.updateAppWidget(ids, view);
        AlarmManager alarm = context.getSystemService(AlarmManager.class);
        PendingIntent advance = advanceIntent(context);
        if (next == null) {
            alarm.cancel(advance);
        } else {
            long boundary = next.optLong(underway ? "until" : "from");
            // Keep the widget current within system power limits, without exact alarm permission.
            alarm.set(AlarmManager.RTC, boundary, advance);
        }
    }

    private static JSONObject firstUnexpired(String snapshot, long now) {
        JSONObject next = null;
        try {
            JSONArray rows = new JSONArray(snapshot);
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.optJSONObject(i);
                if (row == null || row.optString("title").isEmpty()) continue;
                long from = row.optLong("from"), until = row.optLong("until");
                if (from <= 0 || until <= now || until <= from) continue;
                if (next == null || from < next.optLong("from")) next = row;
            }
        } catch (JSONException ignored) {
            // A stale or incomplete cache can be rebuilt the next time the app opens.
        }
        return next;
    }

    private static PendingIntent advanceIntent(Context context) {
        Intent tick = new Intent(context, NextEventWidget.class).setAction(ADVANCE);
        return PendingIntent.getBroadcast(context, 0, tick, PendingIntent.FLAG_IMMUTABLE);
    }
}
