/**
 * Cloud Functions — Notifikace pro registrace a soupisky
 *
 * Env proměnné:
 *   RESEND_API_KEY  — API klíč z resend.com
 *   EMAIL_FROM      — odesílací adresa (noreply@torq.cz)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';

// Inicializace Firebase Admin (singleton)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.database();

// ─── Resend client (lazy init) ───────────────────────────────────────────────

let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    functions.logger.warn('RESEND_API_KEY not configured — email notifications disabled');
    return null;
  }
  _resend = new Resend(key);
  return _resend;
}

function getFromAddress(): string {
  return process.env.EMAIL_FROM || 'TORQ <noreply@torq.cz>';
}

// ─── 1. Notifikace při nové registraci ───────────────────────────────────────

/**
 * Trigger: /registrations/{tournamentId}/{registrationId} — onCreate
 * Pošle email vlastníkovi turnaje, že se někdo zaregistroval.
 */
export const onNewRegistration = functions
  .region('europe-west1')
  .database.ref('/registrations/{tournamentId}/{registrationId}')
  .onCreate(async (snapshot, context) => {
    const { tournamentId } = context.params;
    const registration = snapshot.val();

    if (!registration || !registration.teamName) {
      functions.logger.warn('Invalid registration data', { tournamentId });
      return;
    }

    // Najdi vlastníka turnaje
    const publicSnap = await db.ref(`/public/${tournamentId}`).once('value');
    if (!publicSnap.exists()) {
      functions.logger.warn('Tournament not found in public', { tournamentId });
      return;
    }
    const publicData = publicSnap.val();
    const ownerUid = publicData.ownerUid;
    const tournamentName = publicData.name || 'Turnaj';

    if (!ownerUid) {
      functions.logger.warn('No ownerUid', { tournamentId });
      return;
    }

    // Získej email vlastníka z Firebase Auth
    let ownerEmail: string | undefined;
    try {
      const userRecord = await admin.auth().getUser(ownerUid);
      ownerEmail = userRecord.email || undefined;
    } catch (err) {
      functions.logger.error('Failed to get owner email', { ownerUid, err });
      return;
    }

    if (!ownerEmail) {
      functions.logger.warn('Owner has no email', { ownerUid });
      return;
    }

    const resend = getResend();
    if (!resend) return;

    const subject = `📝 Nová přihláška — ${tournamentName}`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #1A237E;">📝 Nová přihláška na turnaj</h2>
        <div style="background: #F5F5F5; border-radius: 12px; padding: 16px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>🏆 Turnaj:</strong> ${escapeHtml(tournamentName)}</p>
          <p style="margin: 4px 0;"><strong>👕 Tým:</strong> ${escapeHtml(registration.teamName)}</p>
          <p style="margin: 4px 0;"><strong>👤 Trenér:</strong> ${escapeHtml(registration.coachName || '')}</p>
          <p style="margin: 4px 0;"><strong>📞 Telefon:</strong> ${escapeHtml(registration.coachPhone || '')}</p>
          ${registration.coachEmail ? `<p style="margin: 4px 0;"><strong>📧 Email:</strong> ${escapeHtml(registration.coachEmail)}</p>` : ''}
        </div>
        <p style="color: #666;">Přejděte do <a href="https://torq.cz" style="color: #1A237E; font-weight: 700;">TORQ</a> pro schválení nebo zamítnutí přihlášky.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">TORQ · torq.cz</p>
      </div>
    `;

    try {
      const { error } = await resend.emails.send({
        from: getFromAddress(),
        to: [ownerEmail],
        subject,
        html,
      });
      if (error) {
        functions.logger.error('Resend error', { error });
      } else {
        functions.logger.info('Registration notification sent', { ownerEmail, tournamentName, teamName: registration.teamName });
      }
    } catch (err) {
      functions.logger.error('Failed to send registration notification', { err });
    }
  });

// ─── 2. Připomínka soupisky (scheduled) ──────────────────────────────────────

/**
 * Spouští se každý den v 8:00 CET.
 * Najde turnaje, které začínají za 3 dny, a pošle email trenérům,
 * kteří ještě neodevzdali soupisku.
 */
export const rosterReminder = functions
  .region('europe-west1')
  .pubsub.schedule('0 8 * * *')
  .timeZone('Europe/Prague')
  .onRun(async () => {
    const resend = getResend();
    if (!resend) return;

    // Najdi turnaje, které začínají za 3 dny
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 3);
    const targetDateStr = targetDate.toISOString().split('T')[0]; // "YYYY-MM-DD"

    // Čteme z /public — obsahuje startDate v settings
    const publicSnap = await db.ref('/public').once('value');
    if (!publicSnap.exists()) return;

    const allPublic = publicSnap.val() as Record<string, Record<string, unknown>>;
    let emailsSent = 0;

    for (const [tournamentId, data] of Object.entries(allPublic)) {
      const settings = data.settings as Record<string, unknown> | undefined;
      if (!settings) continue;

      const startDate = settings.startDate as string | undefined;
      if (startDate !== targetDateStr) continue;

      // Turnaj začíná za 3 dny — zkontroluj soupisky
      const tournamentName = (data.name as string) || 'Turnaj';
      const teams = data.teams as Record<string, Record<string, unknown>> | unknown[] | undefined;
      if (!teams) continue;

      const teamArray = Array.isArray(teams) ? teams : Object.values(teams);

      for (const team of teamArray) {
        if (!team || typeof team !== 'object') continue;
        const t = team as Record<string, unknown>;

        // Přeskoč týmy, které už mají soupisku
        if (t.rosterSubmittedAt) continue;

        // Přeskoč týmy bez kontaktu trenéra
        const coach = t.coach as Record<string, unknown> | undefined;
        if (!coach || !coach.email) continue;

        const coachEmail = coach.email as string;
        const coachName = (coach.name as string) || 'trenére';
        const teamName = (t.name as string) || 'Tým';
        const rosterToken = t.rosterToken as string | undefined;

        if (!rosterToken) continue;

        const rosterUrl = `https://torq.cz#roster=${tournamentId}&k=${rosterToken}`;

        const subject = `📋 Připomínka soupisky — ${tournamentName}`;
        const html = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #1A237E;">📋 Prosíme o vyplnění soupisky</h2>
            <p>Ahoj ${escapeHtml(coachName)},</p>
            <p>turnaj <strong>${escapeHtml(tournamentName)}</strong> začíná za <strong>3 dny</strong> (${escapeHtml(startDate)})
            a soupiska vašeho týmu <strong>${escapeHtml(teamName)}</strong> ještě nebyla odevzdána.</p>
            <div style="margin: 20px 0; text-align: center;">
              <a href="${rosterUrl}" style="
                display: inline-block; padding: 12px 28px; border-radius: 10px;
                background: #1A237E; color: #fff; font-weight: 700; font-size: 15px;
                text-decoration: none;
              ">📝 Vyplnit soupisku</a>
            </div>
            <p style="color: #666;">Děkujeme a těšíme se na turnaji! ⚽</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">TORQ · torq.cz</p>
          </div>
        `;

        try {
          const { error } = await resend.emails.send({
            from: getFromAddress(),
            to: [coachEmail],
            subject,
            html,
          });
          if (error) {
            functions.logger.error('Resend roster reminder error', { error, coachEmail });
          } else {
            emailsSent++;
          }
        } catch (err) {
          functions.logger.error('Failed to send roster reminder', { coachEmail, err });
        }
      }
    }

    functions.logger.info(`Roster reminder complete: ${emailsSent} emails sent`);
  });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
