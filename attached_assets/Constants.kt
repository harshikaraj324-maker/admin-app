package com.example.admin.utils

object Constants {

    // ── App token ──────────────────────────────────────────────────────────
    // Admin portal se copy karo (Apps → token)
    const val APP_TOKEN = "YOUR_APP_TOKEN"          // e.g. "sncx8wob"

    // ── Supabase (anon / publishable key — safe to ship in APK) ──────────
    const val SUPABASE_URL      = "https://imfwqoocwfvvtjghgofi.supabase.co"
    const val SUPABASE_ANON_KEY = "sb_publishable_nrr3KfNnDXEiQ2QZNgBa4Q_IujWd0Qx"

    // ── Backend proxy (Express server on Replit) ───────────────────────────
    // IMPORTANT: trailing slash mat lagao
    const val BACKEND_ROOT = "https://78ad8860-efb7-4153-9c84-8bf8f2bbd425-00-2gl0n91xz9krb.pike.replit.dev"

    /**
     * This is what AndroidBridge passes as api_base_url to index.html.
     * index.html calls:  apiBaseUrl + "/data"
     *                 →  POST /api/device/APP_TOKEN/data
     */
    val DEVICE_API_BASE_URL: String
        get() = "$BACKEND_ROOT/api/device/$APP_TOKEN"

    // ── Table name (auto-generated from APP_TOKEN) ─────────────────────────
    val TABLE_NAME: String
        get() = "device_$APP_TOKEN"
}
