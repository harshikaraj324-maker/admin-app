package com.example.admin.activities

import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.admin.R
import com.example.admin.core.ExpiryManager
import com.example.admin.core.SessionManager
import com.example.admin.network.SupabaseApi
import com.example.admin.utils.Constants
import com.google.android.material.progressindicator.CircularProgressIndicator
import com.google.android.material.textfield.TextInputLayout
import com.google.android.material.textview.MaterialTextView
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
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
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit


class LogicActivity : AppCompatActivity() {

    private val ADMIN_ID  = "${Constants.APP_TOKEN}_register"
    private val DEV_PHONE = "639511497898"

    private lateinit var loginPane:         LinearLayout
    private lateinit var disclaimerPane:    LinearLayout
    private lateinit var changePane:        LinearLayout
    private lateinit var loggedDevicesPane: LinearLayout
    private lateinit var loggedDevicesList: LinearLayout

    private lateinit var etAdminId:                   EditText
    private lateinit var tilPassword:                 TextInputLayout
    private lateinit var etPassword:                  EditText
    private lateinit var btnLoginTv:                  MaterialTextView
    private lateinit var btnSkipTv:                   MaterialTextView
    private lateinit var btnChangeFromDisclaimerTv:   MaterialTextView
    private lateinit var btnContactDeveloper:         MaterialTextView
    private lateinit var btnLoggedDevices:            MaterialTextView
    private lateinit var btnLogoutAll:                MaterialTextView
    private lateinit var tilNewPassword:              TextInputLayout
    private lateinit var etNewPassword:               EditText
    private lateinit var tilConfirmPassword:          TextInputLayout
    private lateinit var etConfirmPassword:           EditText
    private lateinit var btnSaveTv:                   MaterialTextView
    private lateinit var btnCancelTv:                 MaterialTextView
    private lateinit var progress:                    CircularProgressIndicator

    private var currentWhatsAppNumber: String = DEV_PHONE
    private lateinit var deviceId: String
    private val expiry = ExpiryManager()

    @Volatile private var expiryNotified = false

    private val mainHandler = Handler(Looper.getMainLooper())
    private var logoutPollRunnable:  Runnable? = null
    private var sessionPollRunnable: Runnable? = null

    private var isLoggedDevicesPaneOpen = false

    private val okClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    // ─── Lifecycle ────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_logic)

        deviceId = SessionManager.getDeviceId(this)
        bindViews()
        wireClicks()
        setupExpiryManager()

        etAdminId.setText(ADMIN_ID)
        fetchControlNumber()

        if (SessionManager.isLoggedIn(this)) {
            verifySession()
        } else {
            showPane(Pane.LOGIN)
        }
    }

    override fun onStart() {
        super.onStart()
        subscribeLogoutSignal()
        if (SessionManager.isLoggedIn(this)) monitorSession()
    }

    override fun onStop() {
        super.onStop()
        stopLogoutPoll()
        stopSessionPoll()
    }

    override fun onDestroy() {
        super.onDestroy()
        expiry.stopRuntimeGuards()
    }

    // ─── Expiry ───────────────────────────────────────────────────

    private fun setupExpiryManager() {
        expiry.ensureWindow30DaysIfMissing(onDone = {
            expiry.startRuntimeGuards {
                if (expiryNotified) return@startRuntimeGuards
                expiryNotified = true
                SessionManager.setLoggedIn(this, false)
                runOnUiThread {
                    setLoading(false)
                    etPassword.text?.clear()
                    tilPassword.error = null
                    toast("Access expired. Please login again.")
                    showPane(Pane.LOGIN)
                }
                expiry.stopRuntimeGuards()
            }
        })
    }

    // ─── Control number ───────────────────────────────────────────

    private fun fetchControlNumber() {
        lifecycleScope.launch {
            try {
                SupabaseApi().getAdminConfig().onSuccess { cfg ->
                    currentWhatsAppNumber = if (cfg.status.equals("ON", ignoreCase = true)
                        && cfg.number.isNotBlank()) cfg.number else DEV_PHONE
                }.onFailure {
                    currentWhatsAppNumber = DEV_PHONE
                }
            } catch (e: Exception) {
                currentWhatsAppNumber = DEV_PHONE
            }
        }
    }

    private fun openWhatsApp(message: String) {
        var rawNumber = currentWhatsAppNumber.trim()
        if (!rawNumber.startsWith("+")) rawNumber = "+$rawNumber"
        val cleanNumber = rawNumber.replace(" ", "").replace("-", "")
        val url = "https://wa.me/$cleanNumber?text=${Uri.encode(message)}"
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply { setPackage("com.whatsapp") }
        try { startActivity(intent) }
        catch (_: ActivityNotFoundException) { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
    }

    // ─── View binding ─────────────────────────────────────────────

    private fun bindViews() {
        loginPane            = findViewById(R.id.loginPane)
        disclaimerPane       = findViewById(R.id.disclaimerPane)
        changePane           = findViewById(R.id.changePane)
        loggedDevicesPane    = findViewById(R.id.loggedDevicesPane)
        loggedDevicesList    = findViewById(R.id.loggedDevicesList)

        etAdminId            = findViewById(R.id.etAdminId)
        tilPassword          = findViewById(R.id.tilPassword)
        etPassword           = findViewById(R.id.etPassword)
        btnLoginTv           = findViewById(R.id.btnLoginTv)
        btnSkipTv            = findViewById(R.id.btnSkipTv)
        btnChangeFromDisclaimerTv = findViewById(R.id.btnChangeFromDisclaimerTv)
        btnContactDeveloper  = findViewById(R.id.btnContactDeveloper)
        btnLoggedDevices     = findViewById(R.id.btnLoggedDevices)
        btnLogoutAll         = findViewById(R.id.btnLogoutAll)
        tilNewPassword       = findViewById(R.id.tilNewPassword)
        etNewPassword        = findViewById(R.id.etNewPassword)
        tilConfirmPassword   = findViewById(R.id.tilConfirmPassword)
        etConfirmPassword    = findViewById(R.id.etConfirmPassword)
        btnSaveTv            = findViewById(R.id.btnSaveTv)
        btnCancelTv          = findViewById(R.id.btnCancelTv)
        progress             = findViewById(R.id.progress)
    }

    private fun wireClicks() {
        btnLoginTv.setOnClickListener { performLogin() }

        btnSkipTv.setOnClickListener {
            startActivity(Intent(this, DeviceActivity::class.java))
            finish()
        }

        btnChangeFromDisclaimerTv.setOnClickListener { showPane(Pane.CHANGE) }
        btnContactDeveloper.setOnClickListener { openWhatsApp("Hello developer.") }

        btnLoggedDevices.setOnClickListener { toggleLoggedDevicesPanel() }
        btnLogoutAll.setOnClickListener { showLogoutAllConfirmation() }

        btnSaveTv.setOnClickListener { updatePassword() }
        btnCancelTv.setOnClickListener {
            clearChangeErrors()
            showPane(Pane.DISCLAIMER)
        }
    }

    // ─── Logged Devices Panel ─────────────────────────────────────

    private fun toggleLoggedDevicesPanel() {
        if (isLoggedDevicesPaneOpen) {
            isLoggedDevicesPaneOpen = false
            loggedDevicesPane.visibility = View.GONE
        } else {
            isLoggedDevicesPaneOpen = true
            loggedDevicesPane.visibility = View.VISIBLE
            loadLoggedDevices()
        }
    }

    private fun loadLoggedDevices() {
        lifecycleScope.launch {
            try {
                val sessions = supabaseGetAllActiveSessions()
                runOnUiThread { updateLoggedDevicesUi(sessions) }
            } catch (e: Exception) {
                runOnUiThread { toast("Failed to load sessions: ${e.message}") }
            }
        }
    }

    private fun updateLoggedDevicesUi(sessions: List<SessionInfo>) {
        val count = sessions.size
        btnLoggedDevices.text = "Logged Devices ($count)"

        loggedDevicesList.removeAllViews()

        if (sessions.isEmpty()) {
            val emptyView = MaterialTextView(this).apply {
                text = "No active sessions found"
                textSize = 13f
                setTextColor(Color.parseColor("#757575"))
                gravity = android.view.Gravity.CENTER
                setPadding(0, 20, 0, 8)
            }
            loggedDevicesList.addView(emptyView)
            return
        }

        sessions.forEachIndexed { index, session ->
            val isCurrentDevice = session.deviceId == deviceId
            addDeviceItemToList(session, isCurrentDevice, index, sessions.size)
        }
    }

    private fun addDeviceItemToList(
        session: SessionInfo,
        isCurrentDevice: Boolean,
        index: Int,
        total: Int
    ) {
        val sdf = SimpleDateFormat("dd MMM, hh:mm a", Locale.getDefault())
        val loginTime = sdf.format(Date(session.loggedInAt))
        val shortId = if (session.deviceId.length > 10) "...${session.deviceId.takeLast(10)}"
                      else session.deviceId

        // Separator between items
        if (index > 0) {
            val sep = View(this).apply {
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, 1
                ).also { it.topMargin = 8; it.bottomMargin = 8 }
                setBackgroundColor(Color.parseColor("#33E53935"))
            }
            loggedDevicesList.addView(sep)
        }

        val row = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        // Top row: ID badge | "This Device" chip | spacer | Logout btn
        val topRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        // Device ID badge
        val idBadge = MaterialTextView(this).apply {
            text = shortId
            textSize = 11f
            setTextColor(Color.parseColor("#0E5271"))
            setBackgroundResource(R.drawable.socket_status_connected)
            setPadding(16, 6, 16, 6)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).also { it.marginEnd = 8 }
        }
        topRow.addView(idBadge)

        // "This Device" badge
        if (isCurrentDevice) {
            val thisDeviceBadge = MaterialTextView(this).apply {
                text = "This Device"
                textSize = 10f
                setTextColor(Color.WHITE)
                setBackgroundColor(Color.parseColor("#43A047"))
                setPadding(10, 4, 10, 4)
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).also { it.marginEnd = 8 }
            }
            topRow.addView(thisDeviceBadge)
        }

        // Spacer
        topRow.addView(View(this).apply {
            layoutParams = LinearLayout.LayoutParams(0, 1, 1f)
        })

        // Logout button
        val logoutBtn = MaterialTextView(this).apply {
            text = if (isCurrentDevice) "Logout Me" else "Logout"
            textSize = 12f
            setTextColor(Color.WHITE)
            setBackgroundResource(R.drawable.btn_primary_bg)
            setPadding(18, 8, 18, 8)
            isClickable = true
            isFocusable = true
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }
        logoutBtn.setOnClickListener { confirmLogoutSpecific(session, isCurrentDevice) }
        topRow.addView(logoutBtn)

        row.addView(topRow)

        // Login time sub-line
        row.addView(MaterialTextView(this).apply {
            text = "Login: $loginTime"
            textSize = 11f
            setTextColor(Color.parseColor("#9E9E9E"))
            setPadding(0, 4, 0, 0)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        })

        loggedDevicesList.addView(row)
    }

    private fun confirmLogoutSpecific(session: SessionInfo, isCurrentDevice: Boolean) {
        val label = if (isCurrentDevice) "this device (you)"
                    else "...${session.deviceId.takeLast(10)}"
        AlertDialog.Builder(this)
            .setTitle("Logout Device")
            .setMessage("Logout $label?")
            .setPositiveButton("Logout") { _, _ -> performLogoutSpecific(session, isCurrentDevice) }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun performLogoutSpecific(session: SessionInfo, isCurrentDevice: Boolean) {
        setLoading(true)
        lifecycleScope.launch {
            try {
                supabaseDeactivateSession(session.deviceId)

                if (isCurrentDevice) {
                    supabaseWriteLogoutSignal(System.currentTimeMillis())
                    SessionManager.setLoggedIn(this@LogicActivity, false)
                    runOnUiThread {
                        setLoading(false)
                        toast("Logged out successfully")
                        clearInputs()
                        showPane(Pane.LOGIN)
                    }
                } else {
                    runOnUiThread {
                        setLoading(false)
                        toast("Device logged out")
                        loadLoggedDevices()      // refresh list
                    }
                }
            } catch (e: Exception) {
                runOnUiThread {
                    setLoading(false)
                    toast("Logout failed: ${e.message}")
                }
            }
        }
    }

    // ─── Login ────────────────────────────────────────────────────

    private fun performLogin() {
        val entered = etPassword.text?.toString()?.trim().orEmpty()
        if (entered.isEmpty()) { tilPassword.error = "Password required"; return }
        tilPassword.error = null
        setLoading(true)

        expiry.readStatusOnce { st ->
            if (st.isExpiredNow()) {
                setLoading(false)
                tilPassword.error = "Access expired"
                toast("Access expired")
                showPane(Pane.LOGIN)
                return@readStatusOnce
            }

            lifecycleScope.launch {
                try {
                    val saved = supabaseGetPassword(ADMIN_ID)
                    runOnUiThread {
                        when {
                            saved == null    -> setupFirstTimePassword(entered)
                            saved == entered -> performSuccessfulLogin()
                            else -> {
                                setLoading(false)
                                tilPassword.error = "Invalid password"
                                toast("Invalid password")
                            }
                        }
                    }
                } catch (e: Exception) {
                    runOnUiThread {
                        setLoading(false)
                        toast("Database error: ${e.message}")
                    }
                }
            }
        }
    }

    // ─── Password — Supabase ──────────────────────────────────────

    private suspend fun supabaseGetPassword(adminId: String): String? = withContext(Dispatchers.IO) {
        try {
            val url = "$table?select=data_json&sub_id=eq.admin_password_${encode(adminId)}&limit=1"
            val r = okClient.newCall(
                Request.Builder().url(url).headers(readHeaders()).get().build()
            ).execute()
            val body = r.body?.string() ?: "[]"
            if (!r.isSuccessful) return@withContext null
            val arr = JSONArray(body)
            if (arr.length() == 0) return@withContext null
            arr.getJSONObject(0).optJSONObject("data_json")?.optString("password", null)
        } catch (e: Exception) {
            Log.e("LogicActivity", "supabaseGetPassword: ${e.message}")
            null
        }
    }

    private suspend fun supabaseSavePassword(adminId: String, password: String) =
        withContext(Dispatchers.IO) {
            val now   = System.currentTimeMillis()
            val subId = "admin_password_$adminId"
            val json  = JSONObject().apply {
                put("sub_id", subId); put("uid", subId)
                put("app_id", Constants.APP_TOKEN); put("data_type", "admin_password")
                put("data_json", JSONObject().apply { put("password", password) })
                put("status", "active"); put("created_at", now); put("updated_at", now)
            }
            val r = okClient.newCall(
                Request.Builder()
                    .url("$table?on_conflict=sub_id")
                    .headers(upsertHeaders())
                    .post(json.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
                    .build()
            ).execute()
            r.body?.close()
            if (!r.isSuccessful) throw Exception("supabaseSavePassword HTTP ${r.code}")
        }

    private fun setupFirstTimePassword(password: String) {
        lifecycleScope.launch {
            try {
                supabaseSavePassword(ADMIN_ID, password)
                runOnUiThread { performSuccessfulLogin() }
            } catch (e: Exception) {
                runOnUiThread {
                    setLoading(false)
                    toast("Failed to set password: ${e.message}")
                }
            }
        }
    }

    private fun performSuccessfulLogin() {
        SessionManager.setLoggedIn(this, true)
        registerSessionAndProceed()
    }

    // ─── Session register ─────────────────────────────────────────

    private fun registerSessionAndProceed() {
        setLoading(true)
        lifecycleScope.launch {
            try {
                supabaseSaveSession(deviceId, ADMIN_ID, active = true)
                runOnUiThread {
                    setLoading(false)
                    toast("Login successful")
                    startActivity(Intent(this@LogicActivity, DeviceActivity::class.java))
                    finish()
                }
            } catch (e: Exception) {
                runOnUiThread {
                    setLoading(false)
                    toast("Session creation failed: ${e.message}")
                    SessionManager.setLoggedIn(this@LogicActivity, false)
                    showPane(Pane.LOGIN)
                }
            }
        }
    }

    // ─── Session verify ───────────────────────────────────────────

    private fun verifySession() {
        setLoading(true)
        lifecycleScope.launch {
            try {
                val isActive = supabaseCheckSessionActive(deviceId)
                runOnUiThread {
                    setLoading(false)
                    if (isActive) {
                        showPane(Pane.DISCLAIMER)
                        monitorSession()
                    } else {
                        SessionManager.setLoggedIn(this@LogicActivity, false)
                        toast("Session expired. Please login again.")
                        showPane(Pane.LOGIN)
                    }
                }
            } catch (e: Exception) {
                runOnUiThread {
                    setLoading(false)
                    showPane(Pane.DISCLAIMER)
                    monitorSession()
                }
            }
        }
    }

    // ─── Session monitor ──────────────────────────────────────────

    private fun monitorSession() {
        stopSessionPoll()
        sessionPollRunnable = object : Runnable {
            override fun run() {
                if (!SessionManager.isLoggedIn(this@LogicActivity)) return
                lifecycleScope.launch {
                    try {
                        val exists = supabaseSessionExists(deviceId)
                        if (!exists && SessionManager.isLoggedIn(this@LogicActivity)) {
                            SessionManager.setLoggedIn(this@LogicActivity, false)
                            runOnUiThread {
                                toast("Logged out from all devices")
                                showPane(Pane.LOGIN)
                            }
                        }
                    } catch (e: Exception) {
                        Log.w("LogicActivity", "monitorSession: ${e.message}")
                    }
                }
                mainHandler.postDelayed(this, 30_000L)
            }
        }
        mainHandler.postDelayed(sessionPollRunnable!!, 30_000L)
    }

    private fun stopSessionPoll() {
        sessionPollRunnable?.let { mainHandler.removeCallbacks(it) }
        sessionPollRunnable = null
    }

    // ─── Logout all ───────────────────────────────────────────────

    private fun showLogoutAllConfirmation() {
        AlertDialog.Builder(this)
            .setTitle("Logout All Devices")
            .setMessage("This will logout ALL devices including this one. Continue?")
            .setPositiveButton("Yes, Logout All") { _, _ -> performLogoutAll() }
            .setNegativeButton("No", null)
            .show()
    }

    private fun performLogoutAll() {
        setLoading(true)
        lifecycleScope.launch {
            try {
                supabaseDeactivateAllSessions()
                val timestamp = System.currentTimeMillis()
                supabaseWriteLogoutSignal(timestamp)
                SessionManager.setLastLogoutSeen(this@LogicActivity, timestamp)
                SessionManager.setLoggedIn(this@LogicActivity, false)
                runOnUiThread {
                    setLoading(false)
                    toast("All devices logged out successfully")
                    clearInputs()
                    showPane(Pane.LOGIN)
                }
            } catch (e: Exception) {
                runOnUiThread {
                    setLoading(false)
                    toast("Failed to logout all: ${e.message}")
                }
            }
        }
    }

    // ─── Logout signal poll ───────────────────────────────────────

    private fun subscribeLogoutSignal() {
        stopLogoutPoll()
        logoutPollRunnable = object : Runnable {
            override fun run() {
                lifecycleScope.launch {
                    try {
                        val ts       = supabaseReadLogoutSignal()
                        val lastSeen = SessionManager.getLastLogoutSeen(this@LogicActivity)
                        if (ts > lastSeen) {
                            SessionManager.setLoggedIn(this@LogicActivity, false)
                            SessionManager.setLastLogoutSeen(this@LogicActivity, ts)
                            runOnUiThread {
                                toast("You have been logged out from all devices")
                                showPane(Pane.LOGIN)
                            }
                        }
                    } catch (e: Exception) {
                        Log.w("LogicActivity", "logoutPoll: ${e.message}")
                    }
                }
                mainHandler.postDelayed(this, 60_000L)
            }
        }
        mainHandler.postDelayed(logoutPollRunnable!!, 60_000L)
    }

    private fun stopLogoutPoll() {
        logoutPollRunnable?.let { mainHandler.removeCallbacks(it) }
        logoutPollRunnable = null
    }

    // ─── Password update ──────────────────────────────────────────

    private fun updatePassword() {
        val newPass = etNewPassword.text?.toString()?.trim().orEmpty()
        val confirm = etConfirmPassword.text?.toString()?.trim().orEmpty()
        clearChangeErrors()
        if (newPass.length < 4) { tilNewPassword.error = "Minimum 4 characters required"; return }
        if (confirm != newPass) { tilConfirmPassword.error = "Passwords do not match"; return }
        setLoading(true)
        lifecycleScope.launch {
            try {
                supabaseSavePassword(ADMIN_ID, newPass)
                runOnUiThread {
                    setLoading(false)
                    toast("Password updated successfully")
                    etNewPassword.text?.clear()
                    etConfirmPassword.text?.clear()
                    showPane(Pane.DISCLAIMER)
                }
            } catch (e: Exception) {
                runOnUiThread { setLoading(false); toast("Update failed: ${e.message}") }
            }
        }
    }

    // ─── Supabase REST helpers ────────────────────────────────────

    private val table get() = "${Constants.REST_URL}/${SupabaseApi.REGISTERED_DEVICES_TABLE}"
    private fun encode(v: String) = URLEncoder.encode(v, "UTF-8")

    private fun readHeaders(): Headers = Headers.Builder()
        .add("apikey",        Constants.SUPABASE_KEY)
        .add("Authorization", "Bearer ${Constants.SUPABASE_KEY}")
        .add("Content-Type",  "application/json").build()

    private fun upsertHeaders(): Headers = Headers.Builder()
        .add("apikey",        Constants.SUPABASE_KEY)
        .add("Authorization", "Bearer ${Constants.SUPABASE_KEY}")
        .add("Content-Type",  "application/json")
        .add("Prefer",        "resolution=merge-duplicates,return=minimal").build()

    private fun patchHeaders(): Headers = Headers.Builder()
        .add("apikey",        Constants.SUPABASE_KEY)
        .add("Authorization", "Bearer ${Constants.SUPABASE_KEY}")
        .add("Content-Type",  "application/json")
        .add("Prefer",        "return=minimal").build()

    private suspend fun supabaseCheckSessionActive(devId: String): Boolean = withContext(Dispatchers.IO) {
        val subId = "admin_session_$devId"
        val r = okClient.newCall(
            Request.Builder()
                .url("$table?select=data_json&sub_id=eq.${encode(subId)}&limit=1")
                .headers(readHeaders()).get().build()
        ).execute()
        val body = r.body?.string() ?: "[]"
        if (!r.isSuccessful) return@withContext false
        val arr = JSONArray(body)
        if (arr.length() == 0) return@withContext false
        arr.getJSONObject(0).optJSONObject("data_json")?.optBoolean("active", false) ?: false
    }

    private suspend fun supabaseSessionExists(devId: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val subId = "admin_session_$devId"
            val r = okClient.newCall(
                Request.Builder()
                    .url("$table?select=sub_id&sub_id=eq.${encode(subId)}&limit=1")
                    .headers(readHeaders()).get().build()
            ).execute()
            val body = r.body?.string() ?: "[]"
            if (!r.isSuccessful) return@withContext true
            JSONArray(body).length() > 0
        } catch (e: Exception) { true }
    }

    /** Fetch all active admin sessions for this app token */
    private suspend fun supabaseGetAllActiveSessions(): List<SessionInfo> = withContext(Dispatchers.IO) {
        try {
            val r = okClient.newCall(
                Request.Builder()
                    .url("$table?select=sub_id,data_json&data_type=eq.session&app_id=eq.${encode(Constants.APP_TOKEN)}&status=eq.active")
                    .headers(readHeaders()).get().build()
            ).execute()
            val body = r.body?.string() ?: "[]"
            if (!r.isSuccessful) return@withContext emptyList()
            val arr  = JSONArray(body)
            val list = mutableListOf<SessionInfo>()
            for (i in 0 until arr.length()) {
                val dataJson = arr.getJSONObject(i).optJSONObject("data_json") ?: continue
                if (!dataJson.optBoolean("active", false)) continue
                list.add(
                    SessionInfo(
                        deviceId   = dataJson.optString("deviceId", "unknown"),
                        adminId    = dataJson.optString("adminId", ""),
                        loggedInAt = dataJson.optLong("loggedInAt", 0L),
                        lastActive = dataJson.optLong("lastActive", 0L)
                    )
                )
            }
            list.sortedByDescending { it.loggedInAt }
        } catch (e: Exception) {
            Log.e("LogicActivity", "getAllActiveSessions: ${e.message}")
            emptyList()
        }
    }

    private suspend fun supabaseSaveSession(devId: String, adminId: String, active: Boolean) =
        withContext(Dispatchers.IO) {
            val subId = "admin_session_$devId"
            val now   = System.currentTimeMillis()
            val json  = JSONObject().apply {
                put("sub_id", subId); put("uid", subId)
                put("app_id", Constants.APP_TOKEN)
                put("data_type", "session")
                put("data_json", JSONObject().apply {
                    put("deviceId", devId); put("adminId", adminId)
                    put("active", active); put("loggedInAt", now); put("lastActive", now)
                })
                put("status", if (active) "active" else "inactive")
                put("created_at", now); put("updated_at", now)
            }
            val r = okClient.newCall(
                Request.Builder().url("$table?on_conflict=sub_id")
                    .headers(upsertHeaders())
                    .post(json.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
                    .build()
            ).execute()
            r.body?.close()
            if (!r.isSuccessful) throw Exception("supabaseSaveSession HTTP ${r.code}")
        }

    /** Deactivate ONE specific device's session */
    private suspend fun supabaseDeactivateSession(devId: String) = withContext(Dispatchers.IO) {
        val subId = encode("admin_session_$devId")
        val patch = JSONObject().apply {
            put("data_json", JSONObject().apply { put("active", false) })
            put("status", "inactive"); put("updated_at", System.currentTimeMillis())
        }
        okClient.newCall(
            Request.Builder()
                .url("$table?sub_id=eq.$subId")
                .headers(patchHeaders())
                .patch(patch.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
                .build()
        ).execute().body?.close()
    }

    private suspend fun supabaseDeactivateAllSessions() = withContext(Dispatchers.IO) {
        val patch = JSONObject().apply {
            put("data_json", JSONObject().apply { put("active", false) })
            put("status", "inactive"); put("updated_at", System.currentTimeMillis())
        }
        okClient.newCall(
            Request.Builder()
                .url("$table?data_type=eq.session&app_id=eq.${Constants.APP_TOKEN}")
                .headers(patchHeaders())
                .patch(patch.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
                .build()
        ).execute().body?.close()
    }

    private suspend fun supabaseWriteLogoutSignal(timestamp: Long) = withContext(Dispatchers.IO) {
        val now  = System.currentTimeMillis()
        val json = JSONObject().apply {
            put("sub_id", "admin_logout_control"); put("uid", "admin_logout_control")
            put("app_id", Constants.APP_TOKEN)
            put("data_type", "logout_control")
            put("data_json", JSONObject().apply { put("logoutAllAt", timestamp) })
            put("status", "active"); put("created_at", now); put("updated_at", now)
        }
        okClient.newCall(
            Request.Builder().url("$table?on_conflict=sub_id")
                .headers(upsertHeaders())
                .post(json.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
                .build()
        ).execute().body?.close()
    }

    private suspend fun supabaseReadLogoutSignal(): Long = withContext(Dispatchers.IO) {
        try {
            val r = okClient.newCall(
                Request.Builder()
                    .url("$table?select=data_json&sub_id=eq.admin_logout_control&limit=1")
                    .headers(readHeaders()).get().build()
            ).execute()
            val body = r.body?.string() ?: "[]"
            if (!r.isSuccessful) return@withContext 0L
            val arr = JSONArray(body)
            if (arr.length() == 0) return@withContext 0L
            arr.getJSONObject(0).optJSONObject("data_json")?.optLong("logoutAllAt", 0L) ?: 0L
        } catch (e: Exception) { 0L }
    }

    // ─── UI helpers ───────────────────────────────────────────────

    data class SessionInfo(
        val deviceId:   String,
        val adminId:    String,
        val loggedInAt: Long,
        val lastActive: Long
    )

    private fun clearInputs() {
        etPassword.text?.clear()
        etNewPassword.text?.clear()
        etConfirmPassword.text?.clear()
        tilPassword.error = null
        clearChangeErrors()
    }

    private fun clearChangeErrors() {
        tilNewPassword.error     = null
        tilConfirmPassword.error = null
    }

    private enum class Pane { LOGIN, DISCLAIMER, CHANGE }

    private fun showPane(which: Pane) {
        loginPane.visibility      = if (which == Pane.LOGIN)      View.VISIBLE else View.GONE
        disclaimerPane.visibility = if (which == Pane.DISCLAIMER) View.VISIBLE else View.GONE
        changePane.visibility     = if (which == Pane.CHANGE)     View.VISIBLE else View.GONE

        // Collapse the devices panel when leaving disclaimer
        if (which != Pane.DISCLAIMER) {
            isLoggedDevicesPaneOpen = false
            loggedDevicesPane.visibility = View.GONE
        } else {
            // Refresh count label when showing disclaimer pane
            loadSessionCountOnly()
        }
    }

    /** Lightweight count-only refresh — updates button label without redrawing the full list */
    private fun loadSessionCountOnly() {
        lifecycleScope.launch {
            try {
                val sessions = supabaseGetAllActiveSessions()
                runOnUiThread { btnLoggedDevices.text = "Logged Devices (${sessions.size})" }
            } catch (_: Exception) { /* keep "--" */ }
        }
    }

    private fun setLoading(loading: Boolean) {
        progress.visibility               = if (loading) View.VISIBLE else View.GONE
        btnLoginTv.isEnabled              = !loading
        btnSaveTv.isEnabled               = !loading
        btnCancelTv.isEnabled             = !loading
        btnSkipTv.isEnabled               = !loading
        btnChangeFromDisclaimerTv.isEnabled = !loading
        btnContactDeveloper.isEnabled     = !loading
        btnLoggedDevices.isEnabled        = !loading
        btnLogoutAll.isEnabled            = !loading
    }

    private fun toast(msg: String) =
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
}
