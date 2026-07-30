import * as Contacts from 'expo-contacts';
import { cleanName } from '@/lib/invite';
import { toE164 } from '@/lib/phone';

export type PickedContact = { name: string; phone: string | null };

/**
 * A contact's name, built from whatever it actually has.
 *
 * `Contact.name` is a *composed* field and is not always populated — reading
 * only that reported "no name" for a contact with a perfectly good first and
 * last name on it, which is how this was found. Build from the parts, and fall
 * back to the fields a business contact carries instead.
 */
export function nameOfContact(c: Contacts.Contact | null): string {
  if (!c) return '';
  const composed = [c.firstName, c.middleName, c.lastName].filter(Boolean).join(' ');
  return cleanName(c.name || composed || c.nickname || c.company || '');
}

export type ContactOutcome =
  | { ok: true; contact: PickedContact }
  | { ok: false; reason: 'denied' | 'cancelled' | 'noName' };

/**
 * Open the system contact picker and read one person out of it.
 *
 * **The contact list is never read in bulk and never uploaded.** The system
 * picker runs in its own process; the app receives only the person tapped. That
 * is a real property of `presentContactPickerAsync`, and it is what the privacy
 * policy claims — so it must stay that way.
 *
 * Lives here rather than in a screen because the setup run-through and the
 * players screen both needed it, and the version that only read `Contact.name`
 * shipped a bug that took a user's screenshot to find.
 */
export async function pickContact(): Promise<ContactOutcome> {
  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== 'granted') return { ok: false, reason: 'denied' };

  let picked = await Contacts.presentContactPickerAsync();
  if (!picked) return { ok: false, reason: 'cancelled' };

  // The picker can hand back a thin record. If the fields we need aren't on it,
  // ask for the full one by id rather than telling the user their contact is
  // broken.
  if ((!nameOfContact(picked) || !picked.phoneNumbers?.length) && picked.id) {
    try {
      const full = await Contacts.getContactByIdAsync(picked.id, [
        Contacts.Fields.Name,
        Contacts.Fields.FirstName,
        Contacts.Fields.MiddleName,
        Contacts.Fields.LastName,
        Contacts.Fields.Nickname,
        Contacts.Fields.Company,
        Contacts.Fields.PhoneNumbers,
      ]);
      if (full) picked = full;
    } catch (err) {
      console.warn('could not read the full contact:', err);
    }
  }

  const name = nameOfContact(picked);
  if (!name) return { ok: false, reason: 'noName' };

  // Normalised on the way in, so the same person picked from contacts and typed
  // by hand lands on one string and cannot become two players.
  const raw = picked.phoneNumbers?.[0]?.number ?? null;
  return { ok: true, contact: { name, phone: raw ? toE164(raw) : null } };
}
