package com.example.admin.network

import android.os.Handler
import android.os.Looper
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * SupabaseRealtimeManager — with connect/disconnect callbacks + public reconnect()
 *
 * Added:
 *  - onConnected  callback → fires when WebSocket opens successfully
 *  - onDisconnected callback → fires on failure OR clean close (while shouldReconnect)
 *  - reconnect() public method → allows UI button to manually reconnect
 *  - isSocketConnected() → exposes connection state to UI
 */
class SupabaseRealtimeManager {

    companion object {
        private const val TAG = "SUPABASE_REALTIME_OKHTTP"
        private val CHANNEL_ID get() = "realtime:public:${SupabaseApi.REGISTERED_DEVICES_TABLE}"
    }

    private val client = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS)
        .build()

    private val mainHandler = Handler(Looper.getMainLooper())
    private val refCounter  = AtomicInteger(1)

    private var webSocket:         WebSocket? = null
    private var heartbeatRunnable: Runnable?  = null
    private var reconnectRunnable: Runnable?  = null

    private var shouldReconnect  = true
    private var reconnectAttempt = 0
    private var isConnected      = false

    private var onInsertOrUpdateCallback: ((JSONObject) -> Unit)? = null
    private var onDeleteCallback:         ((JSONObject) -> Unit)? = null
    private var onErrorCallback:          ((Throwable)  -> Unit)? = null
    private var onConnectedCallback:      (() -> Unit)?           = null
    private var onDisconnectedCallback:   (() -> Unit)?           = null

    // ─── Public API ───────────────────────────────────────────────

    fun startRegisteredDevicesRealtime(
        scope: CoroutineScope,
        onInsertOrUpdate: (JSONObject) -> Unit,
        onDelete:         (JSONObject) -> Unit,
        onError:          (Throwable)  -> Unit,
        onConnected:      (() -> Unit)? = null,
        onDisconnected:   (() -> Unit)? = null
    ) {
        onInsertOrUpdateCallback = onInsertOrUpdate
        onDeleteCallback         = onDelete
        onErrorCallback          = onError
        onConnectedCallback      = onConnected
        onDisconnectedCallback   = onDisconnected
        connect()
    }

    /** Expose live connection state to UI */
    fun isSocketConnected(): Boolean = isConnected

    /**
     * Manually disconnect the WebSocket.
     * Auto-reconnect is disabled until reconnect() is called.
     */
    fun disconnect() {
        try {
            shouldReconnect = false
            isConnected     = false

            stopHeartbeat()
            reconnectRunnable?.let { mainHandler.removeCallbacks(it) }
            reconnectRunnable = null

            webSocket?.close(1000, "user disconnected")
            webSocket = null

            mainHandler.post { onDisconnectedCallback?.invoke() }
            Log.d(TAG, "Manually disconnected")
        } catch (e: Exception) {
            Log.e(TAG, "disconnect error", e)
        }
    }

    /**
     * Manually reconnect after a disconnect() call.
     * Also works if the socket dropped and auto-reconnect hasn't fired yet.
     */
    fun reconnect() {
        Log.d(TAG, "Manual reconnect requested")
        shouldReconnect  = true
        reconnectAttempt = 0

        // Cancel any pending auto-reconnect to avoid double connect
        reconnectRunnable?.let { mainHandler.removeCallbacks(it) }
        reconnectRunnable = null

        // Close existing stale socket if any
        webSocket?.close(1000, "manual reconnect")
        webSocket  = null
        isConnected = false

        connect()
    }

    fun stop() {
        try {
            shouldReconnect = false
            isConnected     = false

            stopHeartbeat()
            reconnectRunnable?.let { mainHandler.removeCallbacks(it) }
            reconnectRunnable = null

            webSocket?.close(1000, "screen closed")
            webSocket = null

            onInsertOrUpdateCallback = null
            onDeleteCallback         = null
            onErrorCallback          = null
            onConnectedCallback      = null
            onDisconnectedCallback   = null

            Log.d(TAG, "Realtime stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Realtime stop failed", e)
        }
    }

    // ─── Connect ──────────────────────────────────────────────────

    private fun connect() {
        shouldReconnect = true
        if (isConnected || webSocket != null) {
            Log.d(TAG, "Already connected or connecting")
            return
        }

        val url = "wss://${SupabaseApi.PROJECT_REF}.supabase.co/realtime/v1/websocket" +
                  "?apikey=${SupabaseApi.KEY}&vsn=1.0.0"

        val request = Request.Builder()
            .url(url)
            .addHeader("apikey",        SupabaseApi.KEY)
            .addHeader("Authorization", "Bearer ${SupabaseApi.KEY}")
            .build()

        Log.d(TAG, "Connecting: $url")
        webSocket = client.newWebSocket(request, socketListener)
    }

    // ─── WebSocket listener ───────────────────────────────────────

    private val socketListener = object : WebSocketListener() {

        override fun onOpen(webSocket: WebSocket, response: Response) {
            Log.d(TAG, "WebSocket opened")
            isConnected      = true
            reconnectAttempt = 0
            joinChannel(webSocket)
            startHeartbeat()
            mainHandler.post { onConnectedCallback?.invoke() }
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            handleMessage(text)
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            Log.e(TAG, "WebSocket failure: ${t.message}", t)
            isConnected                          = false
            this@SupabaseRealtimeManager.webSocket = null
            stopHeartbeat()
            mainHandler.post {
                onErrorCallback?.invoke(t)
                onDisconnectedCallback?.invoke()
            }
            scheduleReconnect()
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            Log.d(TAG, "WebSocket closed: $code $reason")
            isConnected                          = false
            this@SupabaseRealtimeManager.webSocket = null
            stopHeartbeat()
            // Only fire disconnected UI + auto-reconnect when not a manual stop
            if (shouldReconnect) {
                mainHandler.post { onDisconnectedCallback?.invoke() }
                scheduleReconnect()
            }
        }
    }

    // ─── Channel join ─────────────────────────────────────────────

    private fun joinChannel(socket: WebSocket) {
        val postgresChanges = JSONArray().apply {
            for (evt in listOf("INSERT", "UPDATE", "DELETE")) {
                put(JSONObject().apply {
                    put("event",  evt)
                    put("schema", "public")
                    put("table",  SupabaseApi.REGISTERED_DEVICES_TABLE)
                    put("filter", "app_id=eq.${SupabaseApi.APP_ID}")
                })
            }
        }

        val payload = JSONObject().apply {
            put("config", JSONObject().apply {
                put("broadcast",       JSONObject().apply { put("self", false) })
                put("presence",        JSONObject().apply { put("key",  "") })
                put("postgres_changes", postgresChanges)
            })
            put("access_token", SupabaseApi.KEY)
        }

        val joinMessage = JSONObject().apply {
            put("topic",   CHANNEL_ID)
            put("event",   "phx_join")
            put("payload", payload)
            put("ref",     nextRef())
        }

        Log.d(TAG, "Join channel: $joinMessage")
        socket.send(joinMessage.toString())
    }

    // ─── Message handler ──────────────────────────────────────────

    private fun handleMessage(text: String) {
        try {
            val json  = JSONObject(text)
            val event = json.optString("event", "")
            when (event) {
                "phx_reply"        -> Log.d(TAG, "Realtime reply: $text")
                "presence_state"   -> { /* ignore */ }
                "system"           -> Log.d(TAG, "Realtime system: $text")
                "postgres_changes" -> handlePostgresChanges(json)
                else               -> Log.d(TAG, "Realtime ignored event=$event")
            }
        } catch (e: Exception) {
            Log.e(TAG, "handleMessage error: $text", e)
            mainHandler.post { onErrorCallback?.invoke(e) }
        }
    }

    private fun handlePostgresChanges(json: JSONObject) {
        try {
            val payload   = json.optJSONObject("payload") ?: return
            val data      = payload.optJSONObject("data")
            val eventType = payload.optString("eventType",
                data?.optString("type", "") ?: "").uppercase()

            val record = payload.optJSONObject("record")
                ?: payload.optJSONObject("new")
                ?: data?.optJSONObject("record")
                ?: data?.optJSONObject("new")

            val oldRecord = payload.optJSONObject("old_record")
                ?: payload.optJSONObject("old")
                ?: data?.optJSONObject("old_record")
                ?: data?.optJSONObject("old")

            val finalEventType = when {
                eventType.contains("INSERT") -> "INSERT"
                eventType.contains("UPDATE") -> "UPDATE"
                eventType.contains("DELETE") -> "DELETE"
                record    != null            -> "UPDATE"
                oldRecord != null            -> "DELETE"
                else                         -> ""
            }

            when (finalEventType) {
                "INSERT", "UPDATE" -> {
                    val row = record ?: return
                    if (!isAppRow(row)) return
                    Log.d(TAG, "$finalEventType uid=${row.optString("sub_id", row.optString("uid", ""))}")
                    mainHandler.post { onInsertOrUpdateCallback?.invoke(row) }
                }
                "DELETE" -> {
                    val row = oldRecord ?: record ?: return
                    if (!isAppRow(row)) return
                    Log.d(TAG, "DELETE uid=${row.optString("sub_id", row.optString("uid", ""))}")
                    mainHandler.post { onDeleteCallback?.invoke(row) }
                }
                else -> Log.d(TAG, "Unknown postgres_changes payload: $json")
            }
        } catch (e: Exception) {
            Log.e(TAG, "handlePostgresChanges error", e)
            mainHandler.post { onErrorCallback?.invoke(e) }
        }
    }

    private fun isAppRow(row: JSONObject): Boolean {
        val appId = row.optString("app_id", "")
        return appId.isBlank() || appId == SupabaseApi.APP_ID
    }

    // ─── Heartbeat ────────────────────────────────────────────────

    private fun startHeartbeat() {
        stopHeartbeat()
        heartbeatRunnable = object : Runnable {
            override fun run() {
                val socket = webSocket
                if (socket == null || !isConnected) return
                socket.send(JSONObject().apply {
                    put("topic",   "phoenix")
                    put("event",   "heartbeat")
                    put("payload", JSONObject())
                    put("ref",     nextRef())
                }.toString())
                mainHandler.postDelayed(this, 25_000L)
            }
        }
        mainHandler.postDelayed(heartbeatRunnable!!, 25_000L)
    }

    private fun stopHeartbeat() {
        heartbeatRunnable?.let { mainHandler.removeCallbacks(it) }
        heartbeatRunnable = null
    }

    // ─── Reconnect (exponential backoff) ─────────────────────────

    private fun scheduleReconnect() {
        if (!shouldReconnect) return
        stopHeartbeat()
        reconnectRunnable?.let { mainHandler.removeCallbacks(it) }
        reconnectAttempt++
        val delayMs = when {
            reconnectAttempt <= 1 -> 1_000L
            reconnectAttempt == 2 -> 3_000L
            reconnectAttempt == 3 -> 5_000L
            else                  -> 10_000L
        }
        Log.d(TAG, "Reconnect in ${delayMs}ms (attempt $reconnectAttempt)")
        reconnectRunnable = Runnable {
            if (shouldReconnect && webSocket == null) connect()
        }
        mainHandler.postDelayed(reconnectRunnable!!, delayMs)
    }

    private fun nextRef(): String = refCounter.getAndIncrement().toString()
}
