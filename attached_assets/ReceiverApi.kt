package com.example.receiver.network

import android.util.Log
import com.example.receiver.utils.Constants
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
import java.util.concurrent.TimeUnit

/**
 * ════════════════════════════════════════════════════════════════════
 *  ReceiverApi  —  Dusra Android app (receiver/monitor) ke liye
 * ════════════════════════════════════════════════════════════════════
 *
 *  ROOT URL :  https://DOMAIN/api/device/APP_TOKEN
 *
 *  Available endpoints:
 *  ┌─────────────────────────────────────────────────────────────────┐
 *  │  GET  /api/device/:token/list          → sare devices          │
 *  │  GET  /api/device/:token/get/:uid      → ek device by UID      │
 *  │  POST /api/device/:token/upsert        → device data save      │
 *  │  POST /api/device/:token/data          → form data save        │
 *  │  WSS  /api/device/:token/ws            → real-time live events │
 *  └─────────────────────────────────────────────────────────────────┘
 *
 *  WebSocket Events received:
 *    { "event": "connected",        "appToken": "...", "ts": 000 }
 *    { "event": "device:updated",   "data": { ...device_row }, "ts": 000 }
 *    { "event": "device:form_data", "data": { ...device_row }, "ts": 000 }
 *    { "event": "device:blocked",   "data": { ...device_row }, "ts": 000 }
 *    { "event": "device:deleted",   "data": { "sub_id": "..." }, "ts": 000 }
 */
class ReceiverApi {

    companion object {
        private const val TAG = "RECEIVER_API"

        // ROOT → Constants se aata hai, yahan mat badlo
        private val BASE = Constants.DEVICE_API_BASE_URL   // e.g. https://DOMAIN/api/device/APP_TOKEN

        private val LIST_URL   = "$BASE/list"
        private val GET_URL    = "$BASE/get"
        private val UPSERT_URL = "$BASE/upsert"
        private val DATA_URL   = "$BASE/data"
        // WebSocket: wss://DOMAIN/api/device/APP_TOKEN/ws
        private val WS_URL     = BASE.replace("https://", "wss://")
                                     .replace("http://",  "ws://") + "/ws"
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    // ── Callbacks ──────────────────────────────────────────────────
    var onDeviceUpdated:  ((JSONObject) -> Unit)? = null
    var onDeviceBlocked:  ((JSONObject) -> Unit)? = null
    var onDeviceDeleted:  ((String) -> Unit)? = null
    var onFormData:       ((JSONObject) -> Unit)? = null
    var onAllDevices:     ((List<JSONObject>) -> Unit)? = null
    var onWsConnected:    (() -> Unit)? = null
    var onWsDisconnected: (() -> Unit)? = null

    // ── WebSocket state ────────────────────────────────────────────
    private var ws: WebSocket? = null
    private var wsConnected = false
    private var reconnectJob: kotlinx.coroutines.Job? = null

    // ══════════════════════════════════════════════════════════════
    //  1. GET /list  —  Sare devices fetch karo (initial load)
    // ══════════════════════════════════════════════════════════════
    /**
     * Sare registered devices ek baar fetch karo.
     * Response: { ok: true, count: N, devices: [...] }
     */
    fun getAllDevices(callback: (List<JSONObject>?, String?) -> Unit) {
        scope.launch {
            try {
                val req = Request.Builder().url(LIST_URL).get().build()
                http.newCall(req).execute().use { res ->
                    val body = res.body?.string() ?: ""
                    if (!res.isSuccessful) { callback(null, "HTTP ${res.code}: $body"); return@launch }
                    val obj = JSONObject(body)
                    if (!obj.optBoolean("ok")) { callback(null, obj.optString("error", "Unknown")); return@launch }
                    val arr = obj.optJSONArray("devices") ?: JSONArray()
                    val list = mutableListOf<JSONObject>()
                    for (i in 0 until arr.length()) list.add(arr.getJSONObject(i))
                    callback(list, null)
                    onAllDevices?.invoke(list)
                }
            } catch (e: Exception) { callback(null, e.message) }
        }
    }

    // ══════════════════════════════════════════════════════════════
    //  2. GET /get/:uid  —  Ek device by UID
    // ══════════════════════════════════════════════════════════════
    /**
     * Single device fetch karo by UID.
     * Response: { ok: true, data: { ...device_row } }
     */
    fun getDevice(uid: String, callback: (JSONObject?, String?) -> Unit) {
        if (uid.isBlank()) { callback(null, "UID required"); return }
        scope.launch {
            try {
                val req = Request.Builder().url("$GET_URL/$uid").get().build()
                http.newCall(req).execute().use { res ->
                    val body = res.body?.string() ?: ""
                    if (!res.isSuccessful) { callback(null, "HTTP ${res.code}: $body"); return@launch }
                    val obj = JSONObject(body)
                    if (obj.optBoolean("ok") && obj.has("data"))
                        callback(obj.getJSONObject("data"), null)
                    else callback(null, obj.optString("error", "Not found"))
                }
            } catch (e: Exception) { callback(null, e.message) }
        }
    }

    // ══════════════════════════════════════════════════════════════
    //  3. POST /upsert  —  Data update karo (optional)
    // ══════════════════════════════════════════════════════════════
    /**
     * Receiver app apna kuch data save karna chahta ho toh.
     * payload mein sub_id ya uid zaroor ho.
     */
    fun upsert(payload: JSONObject, callback: ((Boolean, String?) -> Unit)? = null) {
        scope.launch {
            try {
                val body = payload.toString()
                    .toRequestBody("application/json".toMediaType())
                val req = Request.Builder().url(UPSERT_URL).post(body).build()
                http.newCall(req).execute().use { res ->
                    val rb = res.body?.string() ?: ""
                    callback?.invoke(res.isSuccessful, if (res.isSuccessful) null else "HTTP ${res.code}: $rb")
                }
            } catch (e: Exception) { callback?.invoke(false, e.message) }
        }
    }

    // ══════════════════════════════════════════════════════════════
    //  4. WebSocket  —  Real-time live events
    // ══════════════════════════════════════════════════════════════
    /**
     * WebSocket connect karo — events real-time milenge.
     *
     * Call this in your Activity.onCreate() or ViewModel.
     * Reconnects automatically on disconnect.
     *
     * Events:
     *   onDeviceUpdated  — koi bhi device ka data update hua
     *   onDeviceBlocked  — device block/unblock hua
     *   onDeviceDeleted  — device delete hua (sub_id milega)
     *   onFormData       — koi device ne form submit kiya
     */
    fun connectWebSocket() {
        if (wsConnected) return
        Log.d(TAG, "WS connecting → $WS_URL")
        val req = Request.Builder().url(WS_URL).build()
        ws = http.newWebSocket(req, object : WebSocketListener() {

            override fun onOpen(webSocket: WebSocket, response: Response) {
                wsConnected = true
                Log.d(TAG, "WS connected")
                onWsConnected?.invoke()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val msg   = JSONObject(text)
                    val event = msg.optString("event", "")
                    val data  = if (msg.has("data")) msg.optJSONObject("data") else null

                    Log.d(TAG, "WS event: $event")

                    when (event) {
                        "device:updated"   -> data?.let { onDeviceUpdated?.invoke(it) }
                        "device:form_data" -> data?.let { onFormData?.invoke(it) }
                        "device:blocked"   -> data?.let { onDeviceBlocked?.invoke(it) }
                        "device:deleted"   -> {
                            val uid = data?.optString("sub_id") ?: msg.optString("sub_id", "")
                            if (uid.isNotBlank()) onDeviceDeleted?.invoke(uid)
                        }
                        "connected"        -> Log.d(TAG, "WS ready for token: ${msg.optString("appToken")}")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "WS parse error: ${e.message}")
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                wsConnected = false
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
            connectWebSocket()
        }
    }

    fun disconnectWebSocket() {
        reconnectJob?.cancel()
        ws?.close(1000, "App closed")
        wsConnected = false
    }

    // ══════════════════════════════════════════════════════════════
    //  Helper — OkHttp extension
    // ══════════════════════════════════════════════════════════════
    private fun String.toRequestBody(type: String): okhttp3.RequestBody =
        toByteArray().let {
            okhttp3.RequestBody.create(okhttp3.MediaType.parse(type), it)
        }

    private fun String.toMediaType() = okhttp3.MediaType.parse(this)!!
}
