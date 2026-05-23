package com.example.admin.utils

/**
 * ══════════════════════════════════════════════════════
 *  Constants.kt — Single source of truth
 *  Sirf APP_TOKEN badlo — baaki sab automatically follow karega
 * ══════════════════════════════════════════════════════
 */
object Constants {

    // ── App Identity ─────────────────────────────────────────────
    const val APP_TOKEN = "sncx8wob"

    // ── Supabase (direct REST — sirf admin/expiry/sessions ke liye)
    const val SUPABASE_URL      = "https://imfwqoocwfvvtjghgofi.supabase.co"
    const val SUPABASE_ANON_KEY = "sb_publishable_nrr3KfNnDXEiQ2QZNgBa4Q_IujWd0Qx"
    val SUPABASE_KEY: String get() = SUPABASE_ANON_KEY
    val REST_URL:     String get() = "$SUPABASE_URL/rest/v1"

    // ── Backend Express API server — sare device operations ──────
    // NOTE: sirf domain rakho, /api/device/:token automatically lagate hain
    const val BACKEND_DOMAIN = "https://78ad8860-efb7-4153-9c84-8bf8f2bbd425-00-2gl0n91xz9krb.pike.replit.dev"
    val DEVICE_API_BASE_URL: String get() = "$BACKEND_DOMAIN/api/device/$APP_TOKEN"
    //
    // Iska matlab:
    //   DEVICE_API_BASE_URL  = "https://DOMAIN/api/device/sncx8wob"
    //   list    → GET  $DEVICE_API_BASE_URL/list
    //   get uid → GET  $DEVICE_API_BASE_URL/get/UID
    //   upsert  → POST $DEVICE_API_BASE_URL/upsert
    //   data    → POST $DEVICE_API_BASE_URL/data
    //   ws      → WSS  DOMAIN/api/device/sncx8wob/ws   (https→wss)

    // ── Table name (auto-derived — mat badlo) ────────────────────
    val TABLE_NAME: String get() = "${APP_TOKEN}_registered_devices"
}
