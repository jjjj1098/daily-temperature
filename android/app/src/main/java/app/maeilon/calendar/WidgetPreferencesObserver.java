package app.maeilon.calendar;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;

/**
 * Initialize a process-lifetime preference observer without replacing Capacitor's activity.
 * This private provider does not publish or store data.
 */
public final class WidgetPreferencesObserver extends ContentProvider {
    private SharedPreferences.OnSharedPreferenceChangeListener listener;

    @Override
    public boolean onCreate() {
        Context context = getContext();
        if (context == null) return false;
        listener = (preferences, key) -> {
            if (key == null || NextEventWidget.CACHE_KEY.equals(key)) NextEventWidget.refresh(context);
        };
        context.getSharedPreferences(NextEventWidget.PREFS, Context.MODE_PRIVATE)
                .registerOnSharedPreferenceChangeListener(listener);
        return true;
    }

    @Override public Cursor query(Uri uri, String[] columns, String where, String[] args, String order) {
        throw new UnsupportedOperationException();
    }
    @Override public String getType(Uri uri) { return null; }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String where, String[] args) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String where, String[] args) {
        throw new UnsupportedOperationException();
    }
}
