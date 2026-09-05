package app.garipzeka.zikirmatik;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(io.capawesome.capacitorjs.plugins.firebase.authentication.FirebaseAuthenticationPlugin.class);
        super.onCreate(savedInstanceState);
        
        try {
            if (this.bridge != null && this.bridge.getWebView() != null) {
                WebSettings settings = this.bridge.getWebView().getSettings();
                String ua = settings.getUserAgentString();
                if (ua != null) {
                    settings.setUserAgentString(ua.replace("; wv", "").replaceAll("Version/\\d+\\.\\d+\\s?", ""));
                }
                settings.setJavaScriptCanOpenWindowsAutomatically(true);
                settings.setSupportMultipleWindows(false);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}

