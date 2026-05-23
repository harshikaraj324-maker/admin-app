// ─── ONLY THIS METHOD CHANGES in MainActivity.kt ─────────────────────────────
// Baaki sab same rehta hai.
// Replace your existing addAndroidBridgeIfNeeded() with this:

private fun addAndroidBridgeIfNeeded() {
    try {
        if (!bridgeAdded && ::uid.isInitialized) {
            webView.addJavascriptInterface(
                AndroidBridge(
                    uid            = uid,
                    appId          = supabaseApi.getAppId(),
                    tableName      = supabaseApi.getTableName(),
                    supabaseUrl    = supabaseApi.getSupabaseUrl(),
                    supabaseAnonKey= supabaseApi.getSupabaseAnonKey(),
                    apiBaseUrl     = Constants.DEVICE_API_BASE_URL   // ← NEW
                ),
                "AndroidBridge"
            )

            bridgeAdded = true
            Log.d(TAG, "AndroidBridge added with UID: $uid, apiBaseUrl: ${Constants.DEVICE_API_BASE_URL}")
        }
    } catch (e: Exception) {
        Log.e(TAG, "Error adding AndroidBridge: ${e.message}", e)
    }
}

// ─── Import bhi add karo (top of MainActivity.kt) ────────────────────────────
// import com.example.admin.utils.Constants   ← add if not already there
