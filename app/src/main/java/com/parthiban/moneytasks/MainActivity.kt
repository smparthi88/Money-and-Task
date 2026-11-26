package com.parthiban.moneytasks

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.provider.Telephony
import android.util.Base64
import android.webkit.*
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

class MainActivity : Activity() {
    companion object {
        const val HOME = "https://money-tasks.vercel.app/"
        const val HOST = "money-tasks.vercel.app"
        private const val REQ_FILE = 11
        private const val REQ_SMS = 12
        @Volatile var instance: MainActivity? = null
    }

    private lateinit var web: WebView
    private var fileCb: ValueCallback<Array<Uri>>? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        instance = this
        web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#F1F5F9"))
        setContentView(web)
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            loadWithOverviewMode = true
            useWideViewPort = true
            setSupportZoom(false)
            mediaPlaybackRequiresUserGesture = true
            userAgentString = "$userAgentString MoneyTasksAndroid/1"
        }
        CookieManager.getInstance().setAcceptCookie(true)
        web.addJavascriptInterface(Bridge(), "AndroidSMS")

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                val u = req.url
                val host = u.host ?: ""
                if ((u.scheme == "https" || u.scheme == "http") && (host == HOST || host.endsWith(".supabase.co"))) return false
                return try { startActivity(Intent(Intent.ACTION_VIEW, u)); true } catch (e: Exception) { true }
            }
            // Offline and the app has not been cached yet (first launch) -> friendly page with Retry
            override fun onReceivedError(view: WebView, req: WebResourceRequest, err: WebResourceError) {
                if (!req.isForMainFrame) return
                val html = "<html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>" +
                    "<body style='font-family:sans-serif;background:#F1F5F9;text-align:center;padding:60px 24px;color:#334155'>" +
                    "<div style='font-size:48px'>📴</div><h2>No internet connection</h2>" +
                    "<p>Open Money &amp; Tasks once with internet. After that it works offline and syncs automatically when you are back online.</p>" +
                    "<button onclick=\"location.href='$HOME'\" style='margin-top:16px;padding:12px 28px;border:0;border-radius:10px;background:#1e40af;color:#fff;font-size:16px'>Retry</button>" +
                    "<script>addEventListener('online',function(){location.href='$HOME'})</script></body></html>"
                view.loadDataWithBaseURL(HOME, html, "text/html", "utf-8", HOME)
            }
            override fun onPageFinished(view: WebView, url: String) {
                // remember the file name of blob downloads (jsPDF / Excel exports)
                view.evaluateJavascript(
                    "(function(){if(window.__dlHook)return;window.__dlHook=1;var A=HTMLAnchorElement.prototype,c=A.click,d=A.dispatchEvent;" +
                    "function rec(a){try{if(a.href&&(a.href.indexOf('blob:')===0||a.href.indexOf('data:')===0))window.__lastDl={href:a.href,name:a.download||''}}catch(e){}}" +
                    "A.click=function(){rec(this);return c.apply(this,arguments)};A.dispatchEvent=function(e){if(e&&e.type==='click')rec(this);return d.apply(this,arguments)};})();", null)
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(v: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCb?.onReceiveValue(null)
                fileCb = cb
                val i = Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
                    .putExtra(Intent.EXTRA_MIME_TYPES, arrayOf(
                        "application/pdf", "text/csv", "text/comma-separated-values", "text/plain",
                        "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"))
                return try { startActivityForResult(Intent.createChooser(i, "Choose statement"), REQ_FILE); true }
                catch (e: Exception) { fileCb = null; false }
            }
        }
        web.setDownloadListener { url, _, contentDisposition, mime, _ ->
            if (url.startsWith("blob:") || url.startsWith("data:")) {
                val js = "(async function(){try{var u=${JSONObject.quote(url)};var n=(window.__lastDl&&window.__lastDl.href===u&&window.__lastDl.name)||'';" +
                    "var b=await (await fetch(u)).blob();var r=new FileReader();r.onload=function(){AndroidSMS.saveFile(String(r.result).split(',')[1],n,b.type||${JSONObject.quote(mime ?: "")})};r.readAsDataURL(b)}catch(e){AndroidSMS.toast('Download failed: '+e)}})()"
                web.evaluateJavascript(js, null)
            } else {
                try {
                    val name = URLUtil.guessFileName(url, contentDisposition, mime)
                    val r = DownloadManager.Request(Uri.parse(url)).setMimeType(mime)
                        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                        .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
                    (getSystemService(DOWNLOAD_SERVICE) as DownloadManager).enqueue(r)
                    Toast.makeText(this, "Downloading $name", Toast.LENGTH_SHORT).show()
                } catch (e: Exception) { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
            }
        }
        val start = if (intent?.getBooleanExtra("openSms", false) == true) HOME + "#sms" else HOME
        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl(start)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.getBooleanExtra("openSms", false)) {
            web.evaluateJavascript("try{window.smsSync&&smsSync(0,true);go('sms')}catch(e){location.href='$HOME#sms'}", null)
        }
    }

    fun onNewSms() = runOnUiThread { web.evaluateJavascript("window.onNewSms&&window.onNewSms()", null) }

    override fun onSaveInstanceState(outState: Bundle) { super.onSaveInstanceState(outState); web.saveState(outState) }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        web.evaluateJavascript("(function(){var m=document.querySelector('#modal.open');if(m){closeModal();return 'modal'}if(document.body.classList.contains('navopen')){navToggle(false);return 'nav'}if(typeof VIEW!=='undefined'&&VIEW!=='dashboard'&&window.S&&S.user){go('dashboard');return 'home'}return 'exit'})()") { r ->
            if (r?.contains("exit") == true) { if (web.canGoBack()) web.goBack() else finish() }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_FILE) {
            val res = if (resultCode == RESULT_OK && data != null) {
                data.clipData?.let { c -> Array(c.itemCount) { c.getItemAt(it).uri } } ?: data.data?.let { arrayOf(it) }
            } else null
            fileCb?.onReceiveValue(res); fileCb = null
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_SMS) {
            val ok = hasSms()
            web.evaluateJavascript("window.onSmsPerm&&window.onSmsPerm($ok)", null)
        }
    }

    override fun onDestroy() { if (instance === this) instance = null; super.onDestroy() }

    private fun hasSms() = checkSelfPermission(Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED

    inner class Bridge {
        @JavascriptInterface fun isAndroid() = true

        @JavascriptInterface fun hasPerm(): Boolean = hasSms()

        @JavascriptInterface fun requestPerm() = runOnUiThread {
            val p = mutableListOf(Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS)
            if (Build.VERSION.SDK_INT >= 33) p.add(Manifest.permission.POST_NOTIFICATIONS)
            requestPermissions(p.toTypedArray(), REQ_SMS)
        }

        /** Transaction-like SMS in the inbox received after `since` (epoch ms). */
        @JavascriptInterface fun scanInbox(since: String): String {
            val out = JSONArray()
            if (!hasSms()) return out.toString()
            val from = since.toLongOrNull() ?: (System.currentTimeMillis() - 30L * 86400000L)
            try {
                contentResolver.query(
                    Telephony.Sms.Inbox.CONTENT_URI,
                    arrayOf("_id", "address", "body", "date"),
                    "date > ?", arrayOf(from.toString()),
                    "date DESC"
                )?.use { c ->
                    while (c.moveToNext() && out.length() < 3000) {
                        val body = c.getString(2) ?: continue
                        if (!SmsStore.looksLikeTxn(body)) continue
                        out.put(JSONObject().put("id", c.getLong(0)).put("addr", c.getString(1) ?: "").put("body", body).put("date", c.getLong(3)))
                    }
                }
            } catch (e: Exception) { }
            return out.toString()
        }

        @JavascriptInterface fun getPending(): String = SmsStore.all(this@MainActivity)

        @JavascriptInterface fun ack(keysJson: String) = SmsStore.ack(this@MainActivity, keysJson)

        @JavascriptInterface fun toast(msg: String) = runOnUiThread { Toast.makeText(this@MainActivity, msg, Toast.LENGTH_LONG).show() }

        @JavascriptInterface fun saveFile(b64: String, nameIn: String, mimeIn: String) {
            try {
                val bytes = Base64.decode(b64, Base64.DEFAULT)
                val mime = mimeIn.ifBlank { "application/octet-stream" }
                var name = nameIn.ifBlank { "MoneyTasks_" + System.currentTimeMillis() }
                if (!name.contains('.')) name += when {
                    mime.contains("pdf") -> ".pdf"
                    mime.contains("sheet") || mime.contains("excel") -> ".xlsx"
                    mime.contains("csv") -> ".csv"
                    else -> ""
                }
                val uri: Uri? = if (Build.VERSION.SDK_INT >= 29) {
                    val cv = ContentValues().apply {
                        put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                        put(MediaStore.MediaColumns.MIME_TYPE, mime)
                        put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/MoneyTasks")
                    }
                    contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv)?.also { u ->
                        contentResolver.openOutputStream(u)?.use { it.write(bytes) }
                    }
                } else {
                    val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "MoneyTasks").apply { mkdirs() }
                    val f = File(dir, name); FileOutputStream(f).use { it.write(bytes) }
                    null
                }
                runOnUiThread {
                    Toast.makeText(this@MainActivity, "Saved to Downloads/MoneyTasks/$name", Toast.LENGTH_LONG).show()
                    if (uri != null) try {
                        startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
                    } catch (e: Exception) { }
                }
            } catch (e: Exception) {
                runOnUiThread { Toast.makeText(this@MainActivity, "Save failed: ${e.message}", Toast.LENGTH_LONG).show() }
            }
        }
    }
}
