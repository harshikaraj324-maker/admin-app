package com.example.admin.web

import android.webkit.JavascriptInterface
import org.json.JSONObject

/**
 * JavaScript ↔ Android bridge.
 *
 * index.html mein window.AndroidBridge se access hota hai.
 *
 * Usage in JS:
 *   var cfg = JSON.parse(window.AndroidBridge.getConfigJson());
 *   // cfg.uid, cfg.app_id, cfg.api_base_url
 */
class AndroidBridge(
    private val uid: String,
    private val appId: String,
    private val tableName: String,
    private val supabaseUrl: String,
    private val supabaseAnonKey: String,
    /**
     * Backend proxy base URL for this app.
     * e.g.  https://YOUR-DOMAIN.replit.dev/api/device/YOUR_APP_TOKEN
     *
     * index.html will call  apiBaseUrl + "/data"  to POST form submissions.
     * adhar.html, pan.html etc will use same pattern.
     */
    private val apiBaseUrl: String
) {

    /**
     * Primary config getter — index.html uses this.
     * Returns JSON string:
     * {
     *   "uid":          "DEVICE_UID",
     *   "app_id":       "APP_TOKEN",
     *   "api_base_url": "https://DOMAIN/api/device/APP_TOKEN"
     * }
     */
    @JavascriptInterface
    fun getConfigJson(): String {
        return JSONObject().apply {
            put("uid",          uid)
            put("app_id",       appId)
            put("api_base_url", apiBaseUrl)
            // extra fields — available if any HTML page needs them
            put("table_name",       tableName)
            put("supabase_url",     supabaseUrl)
            put("supabase_anon_key",supabaseAnonKey)
        }.toString()
    }

    /** Backward-compat: old index.html/scripts that call AndroidBridge.getDeviceUID() */
    @JavascriptInterface
    fun getDeviceUID(): String = uid

    /** Backward-compat: old scripts that call AndroidBridge.getAppId() */
    @JavascriptInterface
    fun getAppId(): String = appId

    @JavascriptInterface
    fun getTableName(): String = tableName

    @JavascriptInterface
    fun getSupabaseUrl(): String = supabaseUrl

    @JavascriptInterface
    fun getSupabaseAnonKey(): String = supabaseAnonKey

    /** Returns full api_base_url (same as in getConfigJson) */
    @JavascriptInterface
    fun getApiBaseUrl(): String = apiBaseUrl
}
