/**
 * Disabled webhook handler
 *
 * This file was moved to `src/disabled` to keep it in the repository for
 * future re-enable, but prevent it from being mounted or executed by the
 * running bot. To re-enable, move it back to `src/webhooks` and wire it into
 * your Express server bootstrap.
 */
import express from 'express';
import type { Request, Response } from 'express';
import { Client } from 'whatsapp-web.js';
import logger from '../logger.js';
// The webhook handler is disabled and kept for reference. The project's
// utils/webhookSecurity.js may be intentionally absent; to avoid build
// failures keep a safe fallback here.
let verifySignature: (body: string, sig: string) => boolean = () => false;
let extractSignature: (headers: Record<string, unknown>) => string | null = () => null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
  // Import at runtime if available
  // NOTE: using require here because this file lives in `src/disabled` and
  // is not expected to be executed during normal operation.
  // @ts-ignore
  const ws = await import('../utils/webhookSecurity.js');
  if (ws.verifySignature) verifySignature = ws.verifySignature;
  if (ws.extractSignature) extractSignature = ws.extractSignature;
} catch (err) {
  // leave stubs in place
  // logger isn't imported at top of file for this try/catch block safety
}
import type { WebhookPayload } from '../types/index.js';

export function createWebhookRouter(whatsappClient: Client) {
  const router = express.Router();

  /**
   * Receive transaction status updates from backend
   */
  router.post('/transaction-update', async (req: Request, res: Response) => {
    try {
      const payload = req.body as WebhookPayload;
      const rawBody = JSON.stringify(req.body);

      logger.info(`[Webhook] Received transaction update: ${payload.transactionId} -> ${payload.status}`);

      // Verify webhook signature
      const signature = extractSignature(req.headers);
      if (!signature) {
        logger.warn('[Webhook] Missing signature header');
        return res.status(401).json({ error: 'Missing signature' });
      }

      if (!verifySignature(rawBody, signature)) {
        logger.error('[Webhook] Invalid signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Process webhook based on status
      await handleTransactionUpdate(whatsappClient, payload);

      // Respond quickly to backend
      res.status(200).json({ received: true });

    } catch (error) {
      logger.error('[Webhook] Processing error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

/**
 * Handle transaction status update
 */
async function handleTransactionUpdate(
  client: Client,
  payload: WebhookPayload
): Promise<void> {
  try {
    const { recipientPhone, transactionId, status, data } = payload;

    // Format phone number for WhatsApp (remove + and add @c.us)
    const chatId = recipientPhone.replace('+', '') + '@c.us';

    let message = '';

    switch (status) {
      case 'PAID':
        message = `✅ *Pembayaran Diterima*\n\n` +
                  `ID Transaksi: ${transactionId}\n` +
                  `Status: Pembayaran berhasil dikonfirmasi\n` +
                  `Jumlah: ${data?.sourceAmount} ${data?.sourceCurrency}\n\n` +
                  `Transaksi Anda sedang diproses...`;
        break;

      case 'PROCESSING':
        message = `⏳ *Transaksi Diproses*\n\n` +
                  `ID Transaksi: ${transactionId}\n` +
                  `Status: Sedang memproses transfer ke rekening tujuan\n\n` +
                  `Mohon tunggu beberapa saat...`;
        break;

      case 'COMPLETED':
        message = `🎉 *Transaksi Selesai*\n\n` +
                  `ID Transaksi: ${transactionId}\n` +
                  `Status: Dana telah dikirim ke rekening penerima\n` +
                  `Jumlah dikirim: ${data?.targetAmount} ${data?.targetCurrency}\n` +
                  `Penerima: ${data?.recipientName}\n` +
                  `Bank: ${data?.recipientBank}\n` +
                  `No. Rekening: ${data?.recipientAccount}\n\n` +
                  `Terima kasih telah menggunakan TrustBridge! 🙏`;
        break;

      case 'FAILED':
        message = `❌ *Transaksi Gagal*\n\n` +
                  `ID Transaksi: ${transactionId}\n` +
                  `Status: Transaksi gagal diproses\n` +
                  `Alasan: ${data?.failureReason || 'Tidak diketahui'}\n\n` +
                  `Dana akan dikembalikan ke wallet Anda dalam 1-3 hari kerja.`;
        break;

      case 'CANCELLED':
        message = `🚫 *Transaksi Dibatalkan*\n\n` +
                  `ID Transaksi: ${transactionId}\n` +
                  `Status: Transaksi telah dibatalkan\n\n` +
                  `Jika Anda memiliki pertanyaan, silakan hubungi customer service.`;
        break;

      default:
        message = `📋 *Update Transaksi*\n\n` +
                  `ID Transaksi: ${transactionId}\n` +
                  `Status: ${status}`;
    }

    // Send WhatsApp message
    await client.sendMessage(chatId, message);
    logger.info(`[Webhook] Notification sent to ${recipientPhone}`);

  } catch (error) {
    logger.error('[Webhook] Failed to send notification:', error);
    throw error;
  }
}
