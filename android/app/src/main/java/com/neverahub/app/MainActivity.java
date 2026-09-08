package com.neverahub.app;

import android.annotation.SuppressLint;
import android.content.Context;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.view.View;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatActivity;
import java.util.ArrayList;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {

    private WebView mWebView;
    private TextToSpeech mTTS;
    private SpeechRecognizer mSpeechRecognizer;
    private boolean isTtsReady = false;
    private static final String PREFS_NAME = "NeveraHubPrefs";
    private static final String KEY_SERVER_URL = "server_url";
    private static final String DEFAULT_SERVER_URL = "https://nevera-hub.vercel.app";
    private static final String DEFAULT_ASSET_URL = "file:///android_asset/www/index.html";


    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Mantener la pantalla encendida siempre (ideal para la pantalla de la nevera)
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Inicializar canal de notificaciones nativas para móviles Android
        NotificationHelper.createNotificationChannel(this);
        if (Build.VERSION.SDK_INT >= 33) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 101);
            }
        }

        // Permiso de micrófono para asistente por voz en la tablet
        if (Build.VERSION.SDK_INT >= 23) {
            if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{android.Manifest.permission.RECORD_AUDIO}, 102);
            }
        }

        // Permiso de cámara frontal para identificación facial inteligente
        if (Build.VERSION.SDK_INT >= 23) {
            if (checkSelfPermission(android.Manifest.permission.CAMERA) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{android.Manifest.permission.CAMERA}, 103);
            }
        }

        // Inicializar sintetizador de voz (TTS) en español para responder por los altavoces
        initTTS();



        // Ocultar barra de navegación y habilitar modo inmersivo
        hideSystemUI();

        setContentView(R.layout.activity_main);

        mWebView = findViewById(R.id.webview_kiosk);
        setupWebView();
        loadDashboard();
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUI();
    }

    private void hideSystemUI() {
        View decorView = getWindow().getDecorView();
        int uiOptions = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
        decorView.setSystemUiVisibility(uiOptions);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings settings = mWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);

        // Aceleración de renderizado para Android 6.0
        settings.setRenderPriority(WebSettings.RenderPriority.HIGH);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        mWebView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
        mWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                if (Build.VERSION.SDK_INT >= 21) {
                    runOnUiThread(() -> {
                        try {
                            request.grant(request.getResources());
                        } catch (Exception ignored) {}
                    });
                }
            }
        });
        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                // Si falla la conexión con el servidor de red, recurrir a los assets locales offline
                if (request.isForMainFrame() && !request.getUrl().toString().startsWith("file:///android_asset/")) {
                    view.loadUrl(DEFAULT_ASSET_URL);
                }
            }
        });
    }

    private void initTTS() {
        mTTS = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS && mTTS != null) {
                int result = mTTS.setLanguage(new Locale("es", "ES"));
                if (result != TextToSpeech.LANG_MISSING_DATA && result != TextToSpeech.LANG_NOT_SUPPORTED) {
                    isTtsReady = true;
                }
            }
        });
    }

    private void notifyVoiceResult(String text) {
        if (mWebView != null && text != null) {
            final String escaped = text.replace("'", "\\'").replace("\"", "\\\"");
            mWebView.post(() -> {
                mWebView.evaluateJavascript("window.NeveraVoice && window.NeveraVoice.onSpeechResult('" + escaped + "');", null);
            });
        }
    }

    private void notifyVoiceState(String state) {
        if (mWebView != null && state != null) {
            mWebView.post(() -> {
                mWebView.evaluateJavascript("window.NeveraVoice && window.NeveraVoice.onSpeechState('" + state + "');", null);
            });
        }
    }

    public class AndroidBridge {
        @android.webkit.JavascriptInterface
        public long getDeviceTimeMillis() {
            return System.currentTimeMillis();
        }

        @android.webkit.JavascriptInterface
        public void showNotification(String title, String message) {
            NotificationHelper.showNotification(MainActivity.this, title, message);
        }

        @android.webkit.JavascriptInterface
        public void startListening() {
            runOnUiThread(() -> {
                try {
                    if (!SpeechRecognizer.isRecognitionAvailable(MainActivity.this)) {
                        notifyVoiceState("unsupported");
                        return;
                    }
                    if (mSpeechRecognizer != null) {
                        try {
                            mSpeechRecognizer.cancel();
                            mSpeechRecognizer.destroy();
                        } catch (Exception ignored) {}
                        mSpeechRecognizer = null;
                    }
                    mSpeechRecognizer = SpeechRecognizer.createSpeechRecognizer(MainActivity.this);
                    mSpeechRecognizer.setRecognitionListener(new RecognitionListener() {
                        @Override public void onReadyForSpeech(Bundle params) { notifyVoiceState("listening"); }
                        @Override public void onBeginningOfSpeech() {}
                        @Override public void onRmsChanged(float rmsdB) {}
                        @Override public void onBufferReceived(byte[] buffer) {}
                        @Override public void onEndOfSpeech() { notifyVoiceState("processing"); }
                        @Override public void onError(int error) {
                            // Ignorar silencios o ausencias de voz no críticas; retornar a idle
                            if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                                notifyVoiceState("idle");
                            } else {
                                notifyVoiceState("idle");
                            }
                        }
                        @Override public void onResults(Bundle results) {
                            ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                            if (matches != null && !matches.isEmpty()) {
                                notifyVoiceResult(matches.get(0));
                            } else {
                                notifyVoiceState("idle");
                            }
                        }
                        @Override public void onPartialResults(Bundle partialResults) {}
                        @Override public void onEvent(int eventType, Bundle params) {}
                    });
                    Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                    intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                    intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-ES");
                    intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                    mSpeechRecognizer.startListening(intent);
                } catch (Exception e) {
                    notifyVoiceState("unsupported");
                }
            });
        }

        @android.webkit.JavascriptInterface
        public void stopListening() {
            runOnUiThread(() -> {
                if (mSpeechRecognizer != null) {
                    try {
                        mSpeechRecognizer.stopListening();
                    } catch (Exception ignored) {}
                }
            });
        }

        @android.webkit.JavascriptInterface
        public void speak(String text) {
            if (isTtsReady && mTTS != null && text != null) {
                if (Build.VERSION.SDK_INT >= 21) {
                    mTTS.speak(text, TextToSpeech.QUEUE_FLUSH, null, "neverahub_tts");
                } else {
                    mTTS.speak(text, TextToSpeech.QUEUE_FLUSH, null);
                }
            }
        }

        @android.webkit.JavascriptInterface
        public boolean isVoiceSupported() {
            return SpeechRecognizer.isRecognitionAvailable(MainActivity.this);
        }

        @android.webkit.JavascriptInterface
        public void captureSnapshot() {
            captureFrontSnapshot();
        }

        @android.webkit.JavascriptInterface
        public boolean isCameraSupported() {
            return getPackageManager().hasSystemFeature(android.content.pm.PackageManager.FEATURE_CAMERA_FRONT)
                || getPackageManager().hasSystemFeature(android.content.pm.PackageManager.FEATURE_CAMERA);
        }

        @android.webkit.JavascriptInterface
        public String getServerUrl() {
            return getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(KEY_SERVER_URL, DEFAULT_SERVER_URL);
        }

        @android.webkit.JavascriptInterface
        public void setServerUrl(String url) {
            if (url != null && !url.trim().isEmpty()) {
                getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit().putString(KEY_SERVER_URL, url.trim()).apply();
                runOnUiThread(() -> loadDashboard());
            }
        }
    }

    private void notifyPhotoCaptured(String base64) {
        if (mWebView != null) {
            mWebView.post(() -> {
                if (base64 != null) {
                    mWebView.evaluateJavascript("window.NeveraVision && window.NeveraVision.onPhotoCaptured('" + base64 + "');", null);
                } else {
                    mWebView.evaluateJavascript("window.NeveraVision && window.NeveraVision.onPhotoCaptured(null);", null);
                }
            });
        }
    }

    @SuppressWarnings("deprecation")
    private void captureFrontSnapshot() {
        new Thread(() -> {
            android.hardware.Camera camera = null;
            try {
                int frontCameraId = -1;
                int numberOfCameras = android.hardware.Camera.getNumberOfCameras();
                for (int i = 0; i < numberOfCameras; i++) {
                    android.hardware.Camera.CameraInfo info = new android.hardware.Camera.CameraInfo();
                    android.hardware.Camera.getCameraInfo(i, info);
                    if (info.facing == android.hardware.Camera.CameraInfo.CAMERA_FACING_FRONT) {
                        frontCameraId = i;
                        break;
                    }
                }
                if (frontCameraId == -1 && numberOfCameras > 0) frontCameraId = 0;
                if (frontCameraId != -1) {
                    camera = android.hardware.Camera.open(frontCameraId);
                    android.hardware.Camera.Parameters parameters = camera.getParameters();
                    android.hardware.Camera.Size size = parameters.getPreviewSize();
                    android.graphics.SurfaceTexture dummyTexture = new android.graphics.SurfaceTexture(10);
                    camera.setPreviewTexture(dummyTexture);
                    camera.startPreview();

                    // Breve pausa para que el sensor ajuste exposición y balance de blancos
                    try { Thread.sleep(250); } catch (InterruptedException ignored) {}

                    final android.hardware.Camera camRef = camera;
                    final int width = size.width;
                    final int height = size.height;
                    final int format = parameters.getPreviewFormat();

                    camRef.setOneShotPreviewCallback((data, cam) -> {
                        new Thread(() -> {
                            try {
                                android.graphics.YuvImage yuv = new android.graphics.YuvImage(data, format, width, height, null);
                                java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
                                yuv.compressToJpeg(new android.graphics.Rect(0, 0, width, height), 80, out);
                                byte[] jpegBytes = out.toByteArray();
                                String base64 = android.util.Base64.encodeToString(jpegBytes, android.util.Base64.NO_WRAP);
                                notifyPhotoCaptured("data:image/jpeg;base64," + base64);
                            } catch (Exception e) {
                                notifyPhotoCaptured(null);
                            } finally {
                                try { cam.stopPreview(); cam.release(); } catch (Exception ignored) {}
                            }
                        }).start();
                    });
                    return;
                }
            } catch (Exception e) {
                if (camera != null) {
                    try { camera.release(); } catch (Exception ignored) {}
                }
            }
            notifyPhotoCaptured(null);
        }).start();
    }


    private void loadDashboard() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String serverUrl = prefs.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL);

        if (serverUrl != null && !serverUrl.trim().isEmpty()) {
            mWebView.loadUrl(serverUrl);
        } else {
            // Por defecto, cargar el panel offline empaquetado en el APK
            mWebView.loadUrl(DEFAULT_ASSET_URL);
        }
    }

    @Override
    public void onBackPressed() {
        // En modo kiosko de nevera evitamos que un toque accidental cierre la aplicación
        if (mWebView.canGoBack()) {
            mWebView.goBack();
        }
    }

    @Override
    protected void onDestroy() {
        if (mTTS != null) {
            mTTS.stop();
            mTTS.shutdown();
        }
        if (mSpeechRecognizer != null) {
            mSpeechRecognizer.destroy();
        }
        super.onDestroy();
    }
}

