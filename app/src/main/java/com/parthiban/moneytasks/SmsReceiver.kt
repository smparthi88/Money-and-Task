package com.parthiban.moneytasks

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Telephony

/** Captures new bank / UPI transaction SMS, even when the app is closed. */
class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val msgs = try { Telephony.Sms.Intents.getMessagesFromIntent(intent) } catch (e: Exception) { null } ?: return
        // multi-part SMS arrive as several parts from the same sender
        val grouped = LinkedHashMap<String, StringBuilder>()
        var ts = System.currentTimeMillis()
        for (m in msgs) {
            if (m == null) continue
            val addr = m.displayOriginatingAddress ?: m.originatingAddress ?: "?"
            grouped.getOrPut(addr) { StringBuilder() }.append(m.displayMessageBody ?: m.messageBody ?: "")
            if (m.timestampMillis > 0) ts = m.timestampMillis
        }
        for ((addr, sb) in grouped) {
            val body = sb.toString()
            if (!SmsStore.looksLikeTxn(body)) continue
            SmsStore.add(ctx, addr, body, ts)
            notify(ctx, body)
        }
        MainActivity.instance?.onNewSms()
    }

    private fun notify(ctx: Context, body: String) {
        try {
            val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val ch = "sms_txn"
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(ch) == null) {
                nm.createNotificationChannel(NotificationChannel(ch, "Transaction SMS", NotificationManager.IMPORTANCE_DEFAULT))
            }
            val amt = Regex("(?i)(?:rs\\.?|inr|₹)\\s*:?\\s*([\\d,]+(?:\\.\\d{1,2})?)").find(body)?.groupValues?.get(1)
            val credit = Regex("(?i)credited|received|deposited|refund").containsMatchIn(body) &&
                !Regex("(?i)debited|spent|paid|withdrawn|sent").containsMatchIn(body.substringBefore("credited"))
            val title = if (amt != null) "₹$amt ${if (credit) "credited" else "debited"} – captured" else "Transaction SMS captured"
            val open = Intent(ctx, MainActivity::class.java).putExtra("openSms", true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            val pi = PendingIntent.getActivity(ctx, 1, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(ctx, ch) else @Suppress("DEPRECATION") Notification.Builder(ctx)
            b.setSmallIcon(android.R.drawable.ic_dialog_email)
                .setContentTitle(title)
                .setContentText("Tap to review in SMS Inbox")
                .setStyle(Notification.BigTextStyle().bigText(body))
                .setContentIntent(pi)
                .setAutoCancel(true)
            nm.notify((System.currentTimeMillis() % 100000).toInt(), b.build())
        } catch (e: Exception) { /* notification permission may be denied – capture still works */ }
    }
}
