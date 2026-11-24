package com.parthiban.moneytasks

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Local queue of transaction SMS captured while the app was closed. The web app reads it, saves to Supabase, then acks. */
object SmsStore {
    private const val PREF = "sms_queue"
    private const val KEY = "items"

    private val AMOUNT = Regex("(?i)(rs\\.?|inr|₹)\\s*:?\\s*[\\d,]+|(debited|credited)\\s*(by|with|for)?\\s*[\\d,]+")
    private val WORDS = Regex("(?i)(debit|credit|spent|paid|withdrawn|withdrawal|sent|received|deposited|transferred|refund|txn|transaction|purchase|deducted)")
    private val OTP = Regex("(?i)\\botp\\b|one[\\s-]?time\\s*pass|verification code")

    fun looksLikeTxn(body: String): Boolean =
        AMOUNT.containsMatchIn(body) && WORDS.containsMatchIn(body) && !OTP.containsMatchIn(body)

    @Synchronized
    fun add(ctx: Context, addr: String, body: String, date: Long) {
        val arr = load(ctx)
        val key = "$addr|$date"
        for (i in 0 until arr.length()) if (arr.getJSONObject(i).optString("key") == key) return
        arr.put(JSONObject().put("key", key).put("addr", addr).put("body", body).put("date", date))
        // keep the queue bounded
        while (arr.length() > 2000) arr.remove(0)
        save(ctx, arr)
    }

    @Synchronized
    fun all(ctx: Context): String = load(ctx).toString()

    @Synchronized
    fun ack(ctx: Context, keysJson: String) {
        val keys = try { JSONArray(keysJson) } catch (e: Exception) { JSONArray() }
        val set = HashSet<String>()
        for (i in 0 until keys.length()) set.add(keys.optString(i))
        val arr = load(ctx)
        val out = JSONArray()
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            if (!set.contains(o.optString("key"))) out.put(o)
        }
        save(ctx, out)
    }

    private fun load(ctx: Context): JSONArray {
        val s = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).getString(KEY, "[]") ?: "[]"
        return try { JSONArray(s) } catch (e: Exception) { JSONArray() }
    }

    private fun save(ctx: Context, arr: JSONArray) {
        ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().putString(KEY, arr.toString()).apply()
    }
}
