package com.techbroz.streetraja;

import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

/** Street Raja: full-screen landscape WebGL game shell. All game files are bundled in the APK (no internet needed). */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        try {
            WebView wv = getBridge().getWebView();
            WebSettings s = wv.getSettings();
            s.setMediaPlaybackRequiresUserGesture(false);
            wv.setOverScrollMode(View.OVER_SCROLL_NEVER);
        } catch (Exception ignored) { }
        hideSystemUI();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUI();
    }

    /** Android back button: open the in-game pause menu instead of closing the game. */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        try { getBridge().getWebView().evaluateJavascript("window.__androidBack ? window.__androidBack() : 0", null); } catch (Exception ignored) { }
    }

    @SuppressWarnings("deprecation")
    private void hideSystemUI() {
        View d = getWindow().getDecorView();
        d.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_FULLSCREEN);
    }
}
