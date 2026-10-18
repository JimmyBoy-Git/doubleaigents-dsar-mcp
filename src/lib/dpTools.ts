// Pure data protection tool logic, shared by the MCP server (api/mcp.ts) and
// the free tools page (src/pages/FreeTools.tsx). One copy, so the page and the
// MCP tools always give the same answer.
//
// Rules for anyone editing this file:
//   1. Pure functions only: no network, no storage, no logging, no DOM. The
//      page runs these in the browser and nothing a user types leaves it.
//   2. General information, not legal advice. We "recommend"; the controller
//      decides. Risk views say "likely" or "unlikely", never a definite legal
//      conclusion.
//   3. No model or provider is named, and the internal brand is not used.
//   4. No prices. Prices live only in src/pages/Pricing.tsx.
//   5. Every figure carries its source. If a figure cannot be traced to a
//      primary or official source, leave the item out rather than guess.

export const SITE = 'https://www.doubleaigents.com';
export const CONTACT = 'james@doubleaigents.com';
export const HELP_LINE = `For help, contact ${CONTACT}.`;

export const NOT_ADVICE =
  'General information, not legal advice. Check the facts of the request, and take advice where the position is unclear.';

// Sources, checked October 2026.
export const ICO_BREACH_GUIDE = 'https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/personal-data-breaches-a-guide/';
export const EDPB_BREACH_GUIDELINES = 'https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-92022-personal-data-breach-notification-under_en';
export const EDPB_BREACH_EXAMPLES = 'https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-012021-examples-regarding-personal-data-breach_en';
export const EDPB_ACCESS_GUIDELINES = 'https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-012022-data-subject-rights-right-access_en';
export const ICO_SAR_GUIDE = 'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-of-access/';
export const ICO_DPIA = 'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/';
export const ICO_HIGH_RISK_LIST = 'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/examples-of-processing-likely-to-result-in-high-risk/';
export const ICO_ADM = 'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/automated-decision-making/';
export const ICO_EMPLOYMENT_RECORDS = 'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/employment/employment-practices-and-data-protection-keeping-employment-records/';
export const WP248 = 'https://ec.europa.eu/newsroom/article29/items/611236';
export const AI_ACT_URL = 'https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng';
export const AI_OMNIBUS_URL = 'https://eur-lex.europa.eu/eli/reg/2026/1744/oj/eng';
export const FADP_URL = 'https://www.fedlex.admin.ch/eli/cc/2022/491/en';

/** For the breach, AI, retention and search tools, which are not about one request. */
export const NOT_ADVICE_GENERAL = 'General information, not legal advice. Take advice where the position is unclear.';

export class ToolInputError extends Error {}

export type Source = { name: string; url: string };

function requireBool(v: unknown, name: string): boolean {
  if (typeof v !== 'boolean') throw new ToolInputError(`${name} must be true or false.`);
  return v;
}

function requireJurisdiction(v: unknown, allowed: readonly string[] = ['UK', 'EU', 'CH']): Jurisdiction {
  const j = String(v ?? '').toUpperCase();
  if (!allowed.includes(j)) {
    const list = allowed.map((a) => `"${a}"`);
    const text = list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} or ${list[list.length - 1]}`;
    throw new ToolInputError(`jurisdiction must be ${text}.`);
  }
  return j as Jurisdiction;
}

// ---------------------------------------------------------------------------
// Dates (all UTC, date-only)

export type YMD = { y: number; m: number; d: number }; // m is 1-12

export function parseIsoDate(s: unknown): YMD | null {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim().slice(0, 10));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, m: mo, d };
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Add calendar months; if the target month has no corresponding day, use its last day. */
export function addMonths(date: YMD, n: number): YMD {
  const total = date.y * 12 + (date.m - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return { y, m, d: Math.min(date.d, daysInMonth(y, m)) };
}

export function addDays(date: YMD, n: number): YMD {
  const t = new Date(Date.UTC(date.y, date.m - 1, date.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

export function iso(date: YMD): string {
  return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function weekday(date: YMD): number {
  return new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay();
}

export function longDate(date: YMD): string {
  return `${WEEKDAYS[weekday(date)]} ${date.d} ${MONTHS[date.m - 1]} ${date.y}`;
}

export function nextWeekday(date: YMD): YMD {
  const wd = weekday(date);
  if (wd === 6) return addDays(date, 2);
  if (wd === 0) return addDays(date, 1);
  return date;
}
// ---------------------------------------------------------------------------
// Tool: dsar_deadline

export type Jurisdiction = 'UK' | 'EU' | 'CH';

export function dsarDeadline(args: Record<string, unknown>) {
  const j = String(args.jurisdiction ?? '').toUpperCase() as Jurisdiction;
  if (!['UK', 'EU', 'CH'].includes(j)) throw new ToolInputError('jurisdiction must be "UK", "EU" or "CH".');
  const received = parseIsoDate(args.received_date);
  if (!received) throw new ToolInputError('received_date must be an ISO date, for example 2026-03-15.');
  const extended = args.extended === true;

  if (j === 'CH') {
    const due = addDays(received, 30);
    return {
      jurisdiction: 'CH',
      received_date: iso(received),
      due_date: iso(due),
      due_date_long: longDate(due),
      extended_requested: extended,
      extended_due_date: null,
      rule:
        'Switzerland (revised FADP Art. 25(7); Data Protection Ordinance Art. 18): information must be provided within 30 days of receipt of the request. ' +
        'The period can be extended only if, within those 30 days, the controller tells the data subject that it needs longer, gives its reasons and states the period within which it will respond. ' +
        'The law sets no fixed maximum extension, so no extended date is calculated.',
      notes: [
        'Counted as 30 calendar days from the date of receipt.',
        ...(extended ? ['Extension requested: notify the data subject, with reasons and the new period, on or before ' + iso(due) + '.'] : []),
      ],
      disclaimer: NOT_ADVICE,
    };
  }

  const due = addMonths(received, 1);
  const extDue = addMonths(received, 3);
  const weekendNote = (d: YMD) =>
    weekday(d) === 0 || weekday(d) === 6
      ? j === 'EU'
        ? `${iso(d)} is a ${WEEKDAYS[weekday(d)]}. Under Regulation 1182/71, which the EDPB applies to Art. 12(3), a period ending on a weekend or public holiday runs to the end of the next working day (${iso(nextWeekday(d))}, before any public holiday).`
        : `${iso(d)} is a ${WEEKDAYS[weekday(d)]}. ICO guidance has said that where the date falls on a weekend or bank holiday the controller has until the next working day (${iso(nextWeekday(d))}, before any bank holiday).`
      : null;

  const ruleUK =
    'UK (UK GDPR Art. 12(3) and Art. 12A, as inserted by the Data (Use and Access) Act 2025): respond without undue delay and within one month of the "relevant time". ' +
    'The relevant time is the day the request is received, or, if later, the day the controller receives any information it reasonably requested to confirm identity, or any fee that is payable. ' +
    'The month ends on the corresponding calendar day of the next month; if there is no corresponding day, it ends on the last day of that month. ' +
    'Where the request is complex or the data subject has made a number of requests, the period can be extended by up to two further months, provided the data subject is told of the extension, with reasons, within the first month. ' +
    'If the controller reasonably needs the data subject to clarify the information or processing the request concerns, the period does not run while it waits for that clarification.';
  const ruleEU =
    'EU/EEA (GDPR Art. 12(3)): respond without undue delay and in any event within one month of receipt of the request. ' +
    'The month ends on the corresponding calendar day of the next month; if there is no corresponding day, it ends on the last day of that month. ' +
    'Where necessary, taking into account the complexity and number of requests, the period can be extended by two further months, provided the data subject is told of the extension, with reasons, within one month of receipt. ' +
    'Member State law and supervisory authority guidance may add detail.';

  const notes: string[] = [];
  if (j === 'UK') notes.push('Pass as received_date the relevant time: the later of receipt, receipt of requested ID, or receipt of any fee.');
  const w = weekendNote(due);
  if (w) notes.push(w);
  if (extended) {
    notes.push(`Extension: notify the data subject, with reasons, on or before ${iso(due)}.`);
    const we = weekendNote(extDue);
    if (we) notes.push(we);
  }

  return {
    jurisdiction: j,
    received_date: iso(received),
    due_date: iso(due),
    due_date_long: longDate(due),
    extended_requested: extended,
    extended_due_date: extended ? iso(extDue) : null,
    extended_due_date_long: extended ? longDate(extDue) : null,
    extension_notice_by: extended ? iso(due) : null,
    rule: j === 'UK' ? ruleUK : ruleEU,
    notes,
    disclaimer: NOT_ADVICE,
  };
}
// ---------------------------------------------------------------------------
// Tool: breach_clock

export type Instant = { ms: number; offsetMin: number };

export function parseIsoDateTime(s: unknown): Instant | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/i.exec(t);
  if (!m || !parseIsoDate(m[1])) return null;
  if (Number(m[2]) > 23 || Number(m[3]) > 59 || Number(m[4] ?? 0) > 59) return null;
  let offsetMin = 0;
  if (m[5].toUpperCase() !== 'Z') {
    const sign = m[5][0] === '-' ? -1 : 1;
    const oh = Number(m[5].slice(1, 3));
    const om = Number(m[5].slice(4, 6));
    if (oh > 14 || om > 59) return null;
    offsetMin = sign * (oh * 60 + om);
  }
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return null;
  return { ms, offsetMin };
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function offsetText(min: number): string {
  const a = Math.abs(min);
  return `${min < 0 ? '-' : '+'}${pad2(Math.floor(a / 60))}:${pad2(a % 60)}`;
}

/** Wall-clock fields of an instant at a fixed UTC offset. */
export function wallAtOffset(ms: number, offsetMin: number) {
  const t = new Date(ms + offsetMin * 60000);
  const date: YMD = { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  return { date, hh: t.getUTCHours(), mm: t.getUTCMinutes(), ss: t.getUTCSeconds() };
}

export function isoAtOffset(ms: number, offsetMin: number): string {
  const w = wallAtOffset(ms, offsetMin);
  return `${iso(w.date)}T${pad2(w.hh)}:${pad2(w.mm)}:${pad2(w.ss)}${offsetText(offsetMin)}`;
}

/** UTC offset of Europe/London at an instant, in minutes (0 for GMT, 60 for BST). */
export function londonOffset(ms: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const p = (type: string) => Number(parts.find((x) => x.type === type)?.value);
  const wallAsUtc = Date.UTC(p('year'), p('month') - 1, p('day'), p('hour'), p('minute'), p('second'));
  return Math.round((wallAsUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

export function readableAt(ms: number, offsetMin: number, zoneLabel: string): string {
  const w = wallAtOffset(ms, offsetMin);
  return `${longDate(w.date)}, ${pad2(w.hh)}:${pad2(w.mm)} ${zoneLabel}`;
}

export const BREACH_FACTS = [
  'The date and time the organisation became aware of the breach, and how it found out.',
  'The nature of the breach: what happened, when it started and whether it is still going on.',
  'The categories and approximate number of people affected.',
  "The categories and approximate number of personal data records concerned, and whether special category data (for example health) or children's data is involved.",
  'Who received or could access the data, and whether it has been recalled, deleted or contained.',
  'The likely consequences for the people affected.',
  'The measures taken or proposed to deal with the breach and to reduce its possible adverse effects.',
  'The name and contact details of the data protection officer or other contact point.',
];

export const BREACH_DECIDE =
  'Whether and when to notify is for the controller to decide. We recommend recording the decision and the reasons for it, whichever way it goes.';

export function breachClock(args: Record<string, unknown>) {
  const j = String(args.jurisdiction ?? '').toUpperCase() as Jurisdiction;
  if (!['UK', 'EU', 'CH'].includes(j)) throw new ToolInputError('jurisdiction must be "UK", "EU" or "CH".');
  const aware = parseIsoDateTime(args.aware_at);
  if (!aware) {
    throw new ToolInputError(
      'aware_at must be an ISO date and time with a time zone, for example 2026-10-17T09:30:00+01:00 or 2026-10-17T08:30:00Z.',
    );
  }
  const awareIso = isoAtOffset(aware.ms, aware.offsetMin);

  if (j === 'CH') {
    return {
      jurisdiction: 'CH',
      aware_at: awareIso,
      deadline: null,
      deadline_note: 'Swiss law sets no fixed number of hours. Notification is due as soon as possible.',
      rule:
        'Switzerland (revised FADP Art. 24): the controller must notify the Federal Data Protection and Information Commissioner (FDPIC) as soon as possible of a data security breach that is likely to result in a high risk to the personality or fundamental rights of the data subject.',
      processor: 'A processor must report a data security breach to the controller as soon as possible (revised FADP Art. 24(3)).',
      individuals:
        'Informing the people affected is a separate duty: required where it is necessary for their protection or where the FDPIC requests it (revised FADP Art. 24(4)).',
      facts_regulator_will_ask_for: BREACH_FACTS,
      notes: [
        'The Data Protection Ordinance (Art. 15) sets out what the notification must contain. Information not yet available can follow as soon as possible.',
        'Every data security breach should be documented, whether or not it is notified (Data Protection Ordinance Art. 15(4)).',
        BREACH_DECIDE,
      ],
      disclaimer: NOT_ADVICE,
    };
  }

  const deadlineMs = aware.ms + 72 * 3600 * 1000;
  const zoneOffset = j === 'UK' ? londonOffset(deadlineMs) : aware.offsetMin;
  const zoneLabel = j === 'UK' ? `${zoneOffset === 60 ? 'BST' : 'GMT'}, London time` : `(UTC${offsetText(zoneOffset)})`;
  const passed = Date.now() > deadlineMs;
  const law = j === 'UK' ? 'UK GDPR' : 'GDPR';
  const authority =
    j === 'UK' ? 'the Information Commission (ICO)' : 'the competent supervisory authority (the lead supervisory authority, where there is one)';

  return {
    jurisdiction: j,
    aware_at: awareIso,
    deadline: isoAtOffset(deadlineMs, zoneOffset),
    deadline_utc: new Date(deadlineMs).toISOString().replace('.000Z', 'Z'),
    deadline_readable: readableAt(deadlineMs, zoneOffset, zoneLabel),
    deadline_passed: passed,
    rule:
      `${j === 'UK' ? 'UK' : 'EU/EEA'} (${law} Art. 33(1)): the controller must notify ${authority} of a personal data breach without undue delay and, where feasible, not later than 72 hours after having become aware of it, ` +
      'unless the breach is unlikely to result in a risk to the rights and freedoms of individuals. Where notification is not made within 72 hours, it must be accompanied by reasons for the delay.',
    processor: `A processor must notify the controller without undue delay after becoming aware of a personal data breach (${law} Art. 33(2)). The 72 hours run from when the controller becomes aware.`,
    individuals: `Telling the people affected is a separate duty (${law} Art. 34): required without undue delay where the breach is likely to result in a high risk to their rights and freedoms.`,
    facts_regulator_will_ask_for: BREACH_FACTS,
    notes: [
      `Information not yet available can be provided in phases, without further undue delay (${law} Art. 33(4)).`,
      `Every personal data breach must be documented, whether or not it is notified (${law} Art. 33(5)).`,
      j === 'UK'
        ? 'Providers of public electronic communications services have a separate 24-hour notification rule under PECR.'
        : 'Member State law and sector rules may add separate notification duties.',
      ...(passed ? ['This deadline has passed. A late notification must give the reasons for the delay.'] : []),
      BREACH_DECIDE,
    ],
    disclaimer: NOT_ADVICE,
  };
}

// ---------------------------------------------------------------------------
// Tool: breach_triage

export const RECIPIENTS = ['trusted_internal', 'trusted_external_professional', 'unknown_or_public', 'malicious'] as const;
export type Recipient = (typeof RECIPIENTS)[number];
export const RECOVERABLE = ['confirmed_deleted', 'likely', 'no'] as const;
export type Recoverable = (typeof RECOVERABLE)[number];
export type RiskView = 'unlikely' | 'borderline' | 'likely' | 'likely_high';

export const BREACH_SOURCES: Record<Jurisdiction, Source[]> = {
  UK: [
    { name: "ICO, 'Personal data breaches: a guide'", url: ICO_BREACH_GUIDE },
    { name: 'EDPB Guidelines 9/2022 on personal data breach notification under GDPR', url: EDPB_BREACH_GUIDELINES },
    { name: 'UK GDPR Articles 33 and 34', url: 'https://www.legislation.gov.uk/eur/2016/679/contents' },
  ],
  EU: [
    { name: 'EDPB Guidelines 9/2022 on personal data breach notification under GDPR', url: EDPB_BREACH_GUIDELINES },
    { name: 'EDPB Guidelines 01/2021 on examples regarding personal data breach notification', url: EDPB_BREACH_EXAMPLES },
    { name: 'GDPR Articles 33 and 34', url: 'https://eur-lex.europa.eu/eli/reg/2016/679/oj' },
  ],
  CH: [
    { name: 'Federal Act on Data Protection (FADP), Art. 24', url: FADP_URL },
  ],
};

const RISK_TEXT: Record<RiskView, string> = {
  unlikely: 'Unlikely to result in a risk to the rights and freedoms of individuals.',
  borderline: 'A risk to individuals cannot be ruled out on these facts. The factors point both ways.',
  likely: 'Likely to result in a risk to the rights and freedoms of individuals.',
  likely_high: 'Likely to result in a high risk to the rights and freedoms of individuals.',
};

function peopleAffected(v: unknown): number | 'unknown' {
  if (typeof v === 'string' && v.trim().toLowerCase() === 'unknown') return 'unknown';
  const n = typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v.trim()) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 1e9) {
    throw new ToolInputError('people_affected must be a whole number of 0 or more, or "unknown".');
  }
  return n;
}

export function breachTriage(args: Record<string, unknown>) {
  // breach_clock validates jurisdiction and aware_at and gives the deadline.
  const clock = breachClock({ jurisdiction: args.jurisdiction, aware_at: args.aware_at });
  const j = clock.jurisdiction as Jurisdiction;
  const people = peopleAffected(args.people_affected);
  const special = requireBool(args.special_category, 'special_category');
  const recipient = String(args.recipient ?? '') as Recipient;
  if (!RECIPIENTS.includes(recipient)) {
    throw new ToolInputError('recipient must be "trusted_internal", "trusted_external_professional", "unknown_or_public" or "malicious".');
  }
  const recoverable = String(args.recoverable ?? '') as Recoverable;
  if (!RECOVERABLE.includes(recoverable)) throw new ToolInputError('recoverable must be "confirmed_deleted", "likely" or "no".');
  const encrypted = requireBool(args.encrypted, 'encrypted');

  const factors: string[] = [];
  let score = 0;

  if (recipient === 'trusted_internal') {
    factors.push('Recipient: someone inside the organisation who is bound by confidentiality. This usually makes harm less likely.');
  } else if (recipient === 'trusted_external_professional') {
    score += 1;
    factors.push(
      'Recipient: a known external professional or organisation with its own duty of confidentiality (for example a solicitor, an accountant or another school). The EDPB examples treat a trusted recipient as lowering the risk, especially where it confirms deletion.',
    );
  } else if (recipient === 'unknown_or_public') {
    score += 3;
    factors.push('Recipient unknown, or the data was published or left open to the public. Nobody can be relied on to contain it.');
  } else {
    score += 4;
    factors.push('Malicious actor (for example theft, hacking or ransomware). The data may be used against the people affected, for example for fraud, phishing or identity theft.');
  }

  if (recoverable === 'confirmed_deleted') {
    factors.push('The data has been recovered, or the recipient has confirmed deletion. Prompt containment reduces the risk. Keep the confirmation on file.');
  } else if (recoverable === 'likely') {
    score += 1;
    factors.push('Recovery or deletion is likely but not confirmed. We recommend getting written confirmation from the recipient.');
  } else {
    score += 2;
    factors.push('The data cannot be recovered and deletion cannot be confirmed.');
  }

  if (special) {
    score += 2;
    factors.push(
      'Special category data, or criminal offence data, is involved (for example health, biometric or criminal records). This makes harm more likely and more serious.',
    );
  } else {
    factors.push(
      "No special category data reported. Other data can still be sensitive, for example bank details, identity documents, children's data or safeguarding information. If so, treat the breach as more serious.",
    );
  }

  if (people === 'unknown') {
    score += 1;
    factors.push('The number of people affected is not yet known. The regulator expects at least an approximate figure; we recommend estimating it as a priority.');
  } else if (people === 0) {
    factors.push('No people reported as affected. If no personal data was involved, this is not a personal data breach, but we recommend recording what happened.');
  } else if (people >= 1000) {
    score += 2;
    factors.push(`About ${people.toLocaleString('en-GB')} people affected. The scale increases the potential impact.`);
  } else if (people >= 100) {
    score += 1;
    factors.push(`About ${people.toLocaleString('en-GB')} people affected. The scale increases the potential impact.`);
  } else {
    factors.push(`${people} ${people === 1 ? 'person' : 'people'} affected.`);
  }

  if (encrypted) {
    factors.push(
      'The data was encrypted. If the encryption was strong and the key was not compromised, the data is unintelligible to the recipient and the risk to confidentiality is likely to be low (EDPB Guidelines 9/2022). This does not cover loss of availability, for example where there is no backup.',
    );
  }

  const exposed = recipient === 'unknown_or_public' || recipient === 'malicious';
  let view: RiskView;
  if (encrypted || people === 0) view = 'unlikely';
  else if ((special && exposed && recoverable !== 'confirmed_deleted') || (recipient === 'malicious' && recoverable === 'no' && score >= 7)) view = 'likely_high';
  else if (score >= 4) view = 'likely';
  else if (score >= 2) view = 'borderline';
  else view = 'unlikely';

  const authority = j === 'UK' ? 'the ICO' : j === 'EU' ? 'the supervisory authority' : 'the FDPIC';
  const law = j === 'UK' ? 'UK GDPR' : 'GDPR';
  let regulator: string;
  let individuals: string;
  if (j === 'CH') {
    regulator =
      view === 'likely_high'
        ? 'Notifying the FDPIC is likely to be required, as soon as possible: the breach looks likely to result in a high risk to the personality or fundamental rights of the people affected (FADP Art. 24(1)).'
        : 'In Switzerland the threshold for notifying the FDPIC is a likely high risk. These facts do not clearly point to a high risk, so notification is likely not to be required. Reassess if new facts emerge.';
    individuals =
      view === 'likely_high'
        ? 'Informing the people affected is likely to be needed, because it is necessary for their protection (FADP Art. 24(4)). The FDPIC can also ask for it.'
        : 'Informing the people affected is required where it is necessary for their protection or the FDPIC asks for it (FADP Art. 24(4)). On these facts that looks unlikely.';
  } else {
    regulator =
      view === 'unlikely'
        ? `Notifying ${authority} is likely not to be required, because the breach appears unlikely to result in a risk to individuals (${law} Art. 33(1)). Record the reasons for that view.`
        : view === 'borderline'
          ? `Notifying ${authority} may well be required. A breach is reportable unless it is unlikely to result in a risk, and these facts do not clearly show that. We recommend notifying within the deadline unless the controller can record why a risk is unlikely.`
          : `Notifying ${authority} is likely to be required, within 72 hours of becoming aware (${law} Art. 33(1)). Information not yet available can follow in phases.`;
    individuals =
      view === 'likely_high'
        ? `Telling the people affected is likely to be required without undue delay, in clear and plain language, because a high risk looks likely (${law} Art. 34). Art. 34(3) exceptions apply where the data was unintelligible to the recipient (for example strongly encrypted), where later measures mean the high risk is no longer likely, or where individual contact would take disproportionate effort (then a public communication instead).`
        : `Telling the people affected is likely not to be required, because a high risk does not look likely (${law} Art. 34). The controller can still choose to tell them, for example so they can protect themselves. Reassess if new facts emerge.`;
  }

  const log =
    j === 'CH'
      ? 'Record the breach in the breach log either way: the facts, its effects and the measures taken (Data Protection Ordinance Art. 15(4)).'
      : `Record the breach in the breach log either way: the facts, its effects and the remedial action taken (${law} Art. 33(5)).`;

  return {
    jurisdiction: j,
    aware_at: clock.aware_at,
    deadline: clock.deadline,
    deadline_readable: 'deadline_readable' in clock ? clock.deadline_readable : (clock as { deadline_note: string }).deadline_note,
    deadline_passed: 'deadline_passed' in clock ? clock.deadline_passed : null,
    risk_view: view,
    risk_view_text: RISK_TEXT[view],
    regulator,
    individuals,
    factors,
    always: [
      'The controller decides whether to notify. This is our view of the likely position on the facts given, not a legal conclusion.',
      log,
      HELP_LINE,
    ],
    how_we_assess:
      j === 'CH'
        ? 'Following the FADP: notify the FDPIC where a breach is likely to result in a high risk to the personality or fundamental rights of the people affected.'
        : "Following the ICO's breach guide and EDPB Guidelines 9/2022: weigh the likelihood and severity of harm to individuals' rights and freedoms. A breach is reportable unless it is unlikely to result in a risk; a high risk also means telling the people affected.",
    sources: BREACH_SOURCES[j],
    disclaimer: NOT_ADVICE_GENERAL,
  };
}

// ---------------------------------------------------------------------------
// Tool: dsar_search_checklist

export const ORG_TYPES = ['employer', 'law_firm', 'other'] as const;
export type OrgType = (typeof ORG_TYPES)[number];

type Place = { place: string; notes: string };

const SEARCH_COMMON: Place[] = [
  { place: 'Exchange mailboxes, including online archives', notes: "The person's own mailbox and the mailboxes of the people they dealt with most (line manager, HR, close colleagues). Include archive mailboxes and Recoverable Items if your retention policy keeps them." },
  { place: 'Shared mailboxes the person used', notes: 'For example an HR, team or enquiries mailbox they sent from or were discussed in.' },
  { place: 'Microsoft Teams chats and channel messages', notes: 'One-to-one and group chats are held in the participants\' mailboxes; channel messages in the team\'s group mailbox. A Purview content search covers both.' },
  { place: 'OneDrive', notes: "The person's own OneDrive, and the OneDrives of managers and HR staff who kept notes or files about them." },
  { place: 'SharePoint sites', notes: 'HR, team and project sites, including document libraries and lists.' },
  { place: 'Slack, Google Workspace or other collaboration tools', notes: 'Only if used. Slack and Google Vault both have export tools for this.' },
  { place: 'Phones and messaging apps on work devices', notes: 'Texts, WhatsApp and similar on work phones, and work messages on personal phones where the organisation uses them for work.' },
  { place: 'Paper records', notes: 'Notebooks, desk files, printed emails and filing cabinets. Paper is covered if it is, or is intended to be, part of a filing system.' },
];

const SEARCH_EMPLOYER: Place[] = [
  { place: 'HR system', notes: 'Personnel record, absence, appraisals, training, notes fields and attached documents.' },
  { place: 'Payroll', notes: 'Pay, tax, deductions, benefits and pension records, including any outsourced payroll provider.' },
  { place: 'Recruitment system or applicant tracking system', notes: 'Application, CV, interview notes, scoring, assessment results and references received.' },
  { place: 'Paper personnel file', notes: 'Including any file kept by the line manager.' },
  { place: 'Grievance and disciplinary files', notes: 'Investigation notes, witness statements, hearing notes and outcome letters. Third parties in them may need redaction.' },
  { place: "Line managers' notes and notebooks", notes: 'One-to-one notes, supervision notes and personal notebooks used for work.' },
  { place: 'Occupational health', notes: 'Often a separate controller. Check the contract: if the provider is the controller, the request for its records goes to it. Reports sent to the employer are in scope.' },
  { place: 'CCTV', notes: 'Only footage still held. Check the retention period and preserve footage at once if it is near deletion.' },
  { place: 'Door access, building entry and time-recording logs', notes: 'Swipe card, clocking-in and visitor systems.' },
  { place: 'IT and security logs', notes: 'Device, login and monitoring records that identify the person, where these are kept.' },
];

const SEARCH_LAW_FIRM: Place[] = [
  { place: 'Practice or case management system', notes: 'Matter records, file notes, attendance notes and tasks that mention the person.' },
  { place: 'Document management system', notes: 'Letters, drafts and documents saved to matters. Search across all matters, not only the person\'s own.' },
  { place: 'Time recording and billing', notes: 'Time narratives often name people.' },
  { place: 'Client due diligence and anti-money laundering records', notes: 'Identity documents and checks, if the person is or was a client.' },
  { place: 'HR system, payroll and personnel files', notes: 'If the requester is or was a member of staff.' },
  { place: 'Recruitment system', notes: 'If the requester applied for a job or training contract.' },
];

const BACKUPS: Place = {
  place: 'Backups',
  notes: 'Search a backup only if it is restored in the normal course of business, or the data exists nowhere else and restoring it is reasonable. Backups kept only for disaster recovery are not usually searched.',
};

export function dsarSearchChecklist(args: Record<string, unknown>) {
  const t = String(args.organisation_type ?? '').toLowerCase() as OrgType;
  if (!ORG_TYPES.includes(t)) throw new ToolInputError('organisation_type must be "employer", "law_firm" or "other".');

  const places: Place[] =
    t === 'employer'
      ? [...SEARCH_COMMON, ...SEARCH_EMPLOYER, BACKUPS]
      : t === 'law_firm'
        ? [...SEARCH_COMMON, ...SEARCH_LAW_FIRM, ...SEARCH_EMPLOYER.filter((p) => ['CCTV', 'Door access, building entry and time-recording logs'].includes(p.place)), BACKUPS]
        : [
            ...SEARCH_COMMON,
            { place: 'Line-of-business systems', notes: 'CRM, case, ticketing, booking, customer service and finance systems that hold records about the person.' },
            { place: 'HR system and personnel files', notes: 'If the requester is or was a member of staff.' },
            ...SEARCH_EMPLOYER.filter((p) => ['CCTV', 'Door access, building entry and time-recording logs'].includes(p.place)),
            BACKUPS,
          ];

  return {
    organisation_type: t,
    where_to_search: places,
    search_terms: [
      'Full name, and every variant: first name alone, nickname, maiden or previous surname, common misspellings.',
      'Initials, as used in emails and notes (for example "JS" or "J.S.").',
      'Work and personal email addresses, and any usernames or handles.',
      'Employee number, payroll number, candidate number or client/matter number.',
      'Phone numbers, and vehicle registration if parking or access records are held.',
      'Set the date range to the request, or to the whole period of the relationship if the request is for everything.',
      'Read a sample of results early, then refine the terms. Record the terms, dates and systems searched.',
    ],
    search_rule: {
      UK: 'UK GDPR Art. 15(1A), inserted by the Data (Use and Access) Act 2025: the controller is only required to make reasonable and proportionate searches for the personal data and information. The search should still be thorough: proportionality is about the effort, not a reason to skip obvious places.',
      EU: "GDPR: there is no express proportionality limit on the search. The EDPB Guidelines 01/2022 on the right of access expect a search of all IT systems and non-IT filing systems. A controller holding a large quantity of data can ask the person to specify what they want, but must still provide everything if they do not narrow it.",
      CH: 'FADP Art. 25: the controller must provide the information needed for the person to exercise their rights. It can refuse, restrict or defer only on the grounds in Art. 26.',
    },
    tips: [
      'Preserve first: suspend auto-deletion for the mailboxes and systems in scope as soon as the request arrives.',
      'Keep a search log: who searched what, when, with which terms. It is your evidence if the search is challenged.',
      'Information that is not personal data about the requester is out of scope, even if it mentions them in passing in a work context. Read before releasing.',
      "Other people's personal data in the results needs redaction or a balancing decision. Staff named in their work role can usually stay.",
      'If a reasonable search genuinely cannot find something, say so in the response.',
    ],
    always: ['We recommend; the controller decides the scope of the search.', HELP_LINE],
    sources: [
      { name: 'ICO, Right of access (subject access requests)', url: ICO_SAR_GUIDE },
      { name: 'Data (Use and Access) Act 2025', url: 'https://www.legislation.gov.uk/ukpga/2025/18/contents' },
      { name: 'EDPB Guidelines 01/2022 on data subject rights: right of access', url: EDPB_ACCESS_GUIDELINES },
    ],
    disclaimer: NOT_ADVICE_GENERAL,
  };
}

// ---------------------------------------------------------------------------
// Tool: ai_tool_check  (use_case is matched against fixed word lists in
// memory only; it is never stored, logged or echoed back)

export const AUDIT_LINE = `Double AIgents runs a fixed-price AI workflow audit: ${SITE}/#workflow-audit`;

type Finding = { area: string; finding: string; sources: Source[] };

const SRC = {
  gdpr: { name: 'GDPR (Regulation (EU) 2016/679)', url: 'https://eur-lex.europa.eu/eli/reg/2016/679/oj' },
  ukgdpr: { name: 'UK GDPR', url: 'https://www.legislation.gov.uk/eur/2016/679/contents' },
  wp248: { name: 'WP29 Guidelines on DPIA (WP248 rev.01), endorsed by the EDPB', url: WP248 },
  icoHighRisk: { name: "ICO, 'Examples of processing likely to result in high risk'", url: ICO_HIGH_RISK_LIST },
  icoDpia: { name: 'ICO, Data protection impact assessments', url: ICO_DPIA },
  fadp: { name: 'Federal Act on Data Protection (FADP)', url: FADP_URL },
  aiAct: { name: 'EU AI Act (Regulation (EU) 2024/1689)', url: AI_ACT_URL },
  omnibus: { name: 'Digital Omnibus on AI (Regulation (EU) 2026/1744), amending the AI Act', url: AI_OMNIBUS_URL },
  duaaS80: { name: 'Data (Use and Access) Act 2025, s. 80 (UK GDPR Arts 22A to 22D)', url: 'https://www.legislation.gov.uk/ukpga/2025/18/section/80' },
  duaaC6: { name: 'Data (Use and Access) Act 2025 (Commencement No. 6) Regulations 2026, SI 2026/82', url: 'https://www.legislation.gov.uk/uksi/2026/82/regulation/2/made' },
  icoAdm: { name: 'ICO, Automated decision-making guidance (draft, consultation closed 29 May 2026)', url: ICO_ADM },
} satisfies Record<string, Source>;

const EMPLOYMENT_TERMS =
  /\b(recruit\w*|hiring|hire|cvs?|r[ée]sum[ée]s?|candidates?|applicants?|applications?|shortlist\w*|interview\w*|job ads?|job adverts?|vacanc\w*|promot\w*|terminat\w*|dismiss\w*|redundan\w*|disciplin\w*|task allocation|allocat\w* tasks?|rota\w*|shifts?|performance|productivity|appraisal\w*|monitor\w*)\b/i;
const EMOTION_TERMS = /\b(emotions?|emotional|mood|feelings?|sentiment|facial expressions?|tone of voice|stress levels?)\b/i;
const MONITORING_TERMS = /\b(monitor\w*|track\w*|surveil\w*|keystrokes?|screenshots?|webcam|location|productivity)\b/i;
const SCORING_TERMS = /\b(scor\w*|rank\w*|rat(e|ing)s?|evaluat\w*|assess\w*|profil\w*|predict\w*|shortlist\w*|filter\w*)\b/i;
const BIOMETRIC_TERMS = /\b(biometric\w*|face recognition|facial recognition|fingerprints?|voiceprints?)\b/i;

export function aiToolCheck(args: Record<string, unknown>) {
  const j = requireJurisdiction(args.jurisdiction);
  const useCase = args.use_case;
  if (typeof useCase !== 'string' || useCase.trim() === '') throw new ToolInputError('use_case is required: a short description of what the AI tool does.');
  if (useCase.length > 500) throw new ToolInputError('use_case must be 500 characters or fewer.');
  const personal = requireBool(args.processes_personal_data, 'processes_personal_data');
  const special = requireBool(args.special_category, 'special_category');
  const workers = requireBool(args.employees_or_candidates, 'employees_or_candidates');
  const adm = requireBool(args.automated_decisions_with_significant_effect, 'automated_decisions_with_significant_effect');
  const newTech = requireBool(args.new_technology, 'new_technology');
  const largeScale = requireBool(args.large_scale, 'large_scale');

  const employmentUse = EMPLOYMENT_TERMS.test(useCase);
  const emotionUse = EMOTION_TERMS.test(useCase);
  const monitoringUse = MONITORING_TERMS.test(useCase);
  const scoringUse = SCORING_TERMS.test(useCase);
  const biometricUse = BIOMETRIC_TERMS.test(useCase);
  const law = j === 'UK' ? 'UK GDPR' : 'GDPR';
  const findings: Finding[] = [];

  // (a) DPIA screening ------------------------------------------------------
  const criteria: string[] = [];
  if (scoringUse) criteria.push('Evaluation or scoring of people (including profiling and prediction).');
  if (adm) criteria.push('Automated decision-making with legal or similarly significant effect.');
  if (monitoringUse) criteria.push('Systematic monitoring.');
  if (special || biometricUse) criteria.push('Sensitive data or data of a highly personal nature.');
  if (largeScale) criteria.push('Data processed on a large scale.');
  if (workers) criteria.push('Vulnerable data subjects: WP248 lists employees, because of the imbalance of power with the employer.');
  if (newTech) criteria.push('Innovative use or new technological solutions.');

  let dpiaView: 'not_applicable' | 'likely_required' | 'recommended' | 'unlikely_required';
  let dpiaText: string;
  const mandatoryA = adm;
  const mandatoryB = (special || biometricUse) && largeScale;
  if (!personal) {
    dpiaView = 'not_applicable';
    dpiaText = 'No personal data, so no DPIA is needed under data protection law. Check again if the tool will ever see names, emails, recordings or anything else that identifies a person.';
  } else if (j === 'CH') {
    const high = mandatoryB || newTech || criteria.length >= 2;
    dpiaView = high ? 'likely_required' : criteria.length === 1 ? 'recommended' : 'unlikely_required';
    dpiaText = high
      ? 'A DPIA is likely to be required. The FADP requires one where processing may lead to a high risk to personality or fundamental rights, in particular when new technologies are used or sensitive data is processed on a large scale (FADP Art. 22).'
      : criteria.length === 1
        ? 'A DPIA may not be required, but we recommend a short one: one high-risk indicator is present.'
        : 'A DPIA is unlikely to be required on these answers. We recommend recording that screening decision.';
  } else {
    const likely = mandatoryA || mandatoryB || criteria.length >= 2;
    dpiaView = likely ? 'likely_required' : criteria.length === 1 ? 'recommended' : 'unlikely_required';
    const why: string[] = [];
    if (mandatoryA) why.push(`it involves automated decisions with legal or similarly significant effects (${law} Art. 35(3)(a))`);
    if (mandatoryB) why.push(`it involves large-scale processing of special category data (${law} Art. 35(3)(b))`);
    if (criteria.length >= 2) why.push(`${criteria.length} of the nine WP248 criteria are met, and processing meeting two or more is likely to need a DPIA`);
    dpiaText = likely
      ? `A DPIA is likely to be required before the tool is used: ${why.join('; ')}.` +
        (j === 'UK' && newTech ? ' The ICO list also names innovative technology combined with any other criterion.' : '')
      : criteria.length === 1
        ? 'A DPIA may not be mandatory, but we recommend one: one high-risk criterion is met, and a DPIA is good practice for any major new use of personal data.'
        : 'A DPIA is unlikely to be required on these answers. We recommend recording that screening decision and its reasons.';
  }
  findings.push({
    area: 'DPIA screening',
    finding: dpiaText,
    sources: j === 'CH' ? [SRC.fadp] : j === 'UK' ? [SRC.ukgdpr, SRC.icoHighRisk, SRC.icoDpia, SRC.wp248] : [SRC.gdpr, SRC.wp248],
  });

  // (b) EU AI Act screen ----------------------------------------------------
  const reach =
    j === 'EU'
      ? ''
      : ` The AI Act is EU law. It reaches a ${j === 'UK' ? 'UK' : 'Swiss'} organisation that places the system on the EU market, or whose use of it produces output used in the EU (AI Act Art. 2(1)).`;

  let aiActView: 'possible_prohibited' | 'likely_high_risk' | 'possible_high_risk' | 'not_flagged' = 'not_flagged';
  if (emotionUse && (workers || employmentUse)) {
    aiActView = 'possible_prohibited';
    findings.push({
      area: 'EU AI Act: prohibited practice',
      finding:
        'Inferring the emotions of people in the workplace is prohibited (AI Act Art. 5(1)(f)), except for medical or safety reasons. The prohibition has applied since 2 February 2025. The description mentions emotion, mood or sentiment; if the tool infers how staff or candidates feel, it is likely to be caught.' +
        reach,
      sources: [SRC.aiAct],
    });
  }
  if (biometricUse) {
    findings.push({
      area: 'EU AI Act: biometrics',
      finding:
        'Biometric systems are covered in several places: biometric categorisation that infers race, political opinions, trade union membership, religious beliefs, sex life or sexual orientation is prohibited (Art. 5(1)(g)), and remote biometric identification, biometric categorisation and emotion recognition are high-risk areas (Annex III point 1). Biometric data used to identify someone is also special category data under data protection law.',
      sources: [SRC.aiAct],
    });
  }
  if (workers && (employmentUse || adm || scoringUse)) {
    if (aiActView === 'not_flagged') aiActView = employmentUse ? 'likely_high_risk' : 'possible_high_risk';
    findings.push({
      area: 'EU AI Act: high-risk (employment)',
      finding:
        'AI used in employment is a high-risk area (AI Act Annex III point 4): recruitment and selection, including placing targeted job adverts, analysing and filtering applications and evaluating candidates; and decisions on terms of work, promotion and termination, allocating tasks based on individual behaviour or personal traits, and monitoring and evaluating performance and behaviour. ' +
        (employmentUse
          ? 'The description suggests one of these uses, so the tool is likely to be high-risk. '
          : 'If the tool is used for any of these, it is likely to be high-risk. ') +
        'A system in an Annex III area is not high-risk if it does not pose a significant risk, for example where it only performs a narrow procedural task, but one that profiles people always is (Art. 6(3)). ' +
        'As a deployer, the employer would need to use it according to the instructions, assign trained human oversight, monitor it, keep its logs, tell workers and their representatives before it is used at work, and tell people when it is used to make decisions about them (Art. 26).' +
        reach,
      sources: [SRC.aiAct, SRC.omnibus],
    });
  } else if (workers) {
    findings.push({
      area: 'EU AI Act: high-risk (employment)',
      finding:
        'The tool involves staff or candidates. It becomes high-risk under AI Act Annex III point 4 if it is used for recruitment or selection, or for decisions on promotion, termination, task allocation or monitoring and evaluating performance. The description does not suggest that, but check how it will actually be used.' +
        reach,
      sources: [SRC.aiAct],
    });
  }
  findings.push({
    area: 'EU AI Act: timeline',
    finding:
      'Prohibited practices (Art. 5) and AI literacy (Art. 4) have applied since 2 February 2025. General-purpose AI model rules since 2 August 2025. Transparency duties (Art. 50) from 2 August 2026. ' +
      'The Digital Omnibus on AI (Regulation (EU) 2026/1744, in force 27 July 2026) postponed the high-risk rules: Annex III systems, including employment, from 2 December 2027; AI in products under Annex I from 2 August 2028. ' +
      'It also reworded Art. 4: providers and deployers must take measures to support the AI literacy of their staff, without having to guarantee any particular level.',
    sources: [SRC.aiAct, SRC.omnibus],
  });

  // Automated decisions --------------------------------------------------
  if (adm && personal) {
    findings.push({
      area: 'Automated decisions',
      finding:
        j === 'UK'
          ? 'UK GDPR Arts 22A to 22D, inserted by the Data (Use and Access) Act 2025, in force since 5 February 2026: significant decisions based solely on automated processing are allowed only with safeguards. The person must be told about the decision, be able to make representations, obtain human intervention and contest it (Art. 22C). Where special category data is involved, such decisions are allowed only with explicit consent, or where the decision is necessary for a contract or required or authorised by law and the substantial public interest condition in Art. 9(2)(g) applies (Art. 22B).' +
            (special ? ' Special category data is involved here, so Art. 22B applies.' : '') +
            ' The ICO\'s guidance on the new rules is still in draft.'
          : j === 'EU'
            ? 'GDPR Art. 22: people have the right not to be subject to a decision based solely on automated processing that has legal or similarly significant effects, unless it is necessary for a contract, authorised by law, or based on explicit consent. The controller must give safeguards, at least human intervention, the chance to express a view and to contest the decision. Special category data can be used only with explicit consent or for substantial public interest (Art. 22(4)). Meaningful human review, not a rubber stamp, takes a decision outside Art. 22.'
            : 'FADP Art. 21: the controller must tell the person about a decision based solely on automated processing that has a legal effect on them or significantly affects them, and on request let them give their view and have the decision reviewed by a person.',
      sources: j === 'UK' ? [SRC.duaaS80, SRC.duaaC6, SRC.icoAdm] : j === 'EU' ? [SRC.gdpr] : [SRC.fadp],
    });
  }

  return {
    jurisdiction: j,
    dpia: { view: dpiaView, criteria_met: personal ? criteria : [] },
    ai_act: { view: aiActView },
    findings,
    always: ['We recommend; the controller decides. This is a screening view on the answers given, not a legal conclusion.', HELP_LINE],
    audit: AUDIT_LINE,
    note: 'The use case text is read in memory to spot keywords and is not stored or returned.',
    disclaimer: NOT_ADVICE_GENERAL,
  };
}

// ---------------------------------------------------------------------------
// Tool: hr_retention  (UK only for now). Every period below was checked
// against the source given, October 2026. Record types we could not tie to a
// primary or official source (references given, leavers' mailboxes, SAR case
// files) are left out on purpose.

export type RetentionEntry = {
  label: string;
  period: string;
  basis: 'statutory' | 'recommended';
  detail: string;
  sources: Source[];
};

const LIMITATION_5 = { name: 'Limitation Act 1980, s. 5 (six years for contract claims)', url: 'https://www.legislation.gov.uk/ukpga/1980/58/section/5' };
const ICO_EMP_RECORDS = { name: "ICO, 'Employment practices and data protection: keeping employment records'", url: ICO_EMPLOYMENT_RECORDS };

export const HR_RECORDS: Record<string, RetentionEntry> = {
  payroll_paye: {
    label: 'Payroll and PAYE records',
    period: '3 years from the end of the tax year they relate to',
    basis: 'statutory',
    detail: 'HMRC requires PAYE records (pay, deductions, payments to HMRC, statutory pay) to be kept for 3 years from the end of the tax year. Many employers keep them for 6 years to cover contract claims.',
    sources: [{ name: "HMRC, 'PAYE for employers: keeping records'", url: 'https://www.gov.uk/paye-for-employers/keeping-records' }],
  },
  right_to_work: {
    label: 'Right-to-work check copies',
    period: 'For the whole of the employment and 2 years after it ends',
    basis: 'statutory',
    detail: 'The Immigration (Restrictions on Employment) Order 2007, made under the Immigration, Asylum and Nationality Act 2006, requires copies to be kept for not less than 2 years after the employment ends. The Home Office guide says to keep them throughout the employment and for 2 years after, then destroy them securely.',
    sources: [
      { name: 'Immigration (Restrictions on Employment) Order 2007, art. 6', url: 'https://www.legislation.gov.uk/uksi/2007/3290/article/6' },
      { name: "Home Office, 'An employer's guide to right to work checks'", url: 'https://www.gov.uk/government/publications/right-to-work-checks-employers-guide' },
    ],
  },
  accident_book_riddor: {
    label: 'Accident book and RIDDOR records',
    period: 'At least 3 years from the date of the entry',
    basis: 'statutory',
    detail: 'RIDDOR records must be kept for at least 3 years from the date they were made. The accident book (employers with 10 or more staff on the same premises, and mines, quarries and factories) also for at least 3 years from the entry. Records that may matter to a personal injury claim are often kept longer.',
    sources: [
      { name: 'RIDDOR 2013, reg. 12', url: 'https://www.legislation.gov.uk/uksi/2013/1471/regulation/12' },
      { name: 'Social Security (Claims and Payments) Regulations 1979, reg. 25', url: 'https://www.legislation.gov.uk/uksi/1979/628/regulation/25' },
    ],
  },
  unsuccessful_candidates: {
    label: "Unsuccessful candidates' CVs and interview notes",
    period: '6 months after the recruitment decision is recommended',
    basis: 'recommended',
    detail: "No statute sets a period. The ICO's draft recruitment guidance says not to keep these records beyond the time limit for bringing a claim. Six months is the usual recommendation, and is the period the ICO uses for its own recruitment records. Keep them longer only with the candidate's agreement, for example for a talent pool.",
    sources: [
      { name: "ICO, 'Recruitment and selection: keeping recruitment records' (draft)", url: 'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/employment/recruitment-and-selection/keeping-recruitment-records/' },
      { name: 'ICO, Retention and disposal policy (December 2025), entry 6.10', url: 'https://ico.org.uk/media2/hzbfc2c2/retention-and-disposal-policy-accessible_dec25.pdf' },
    ],
  },
  personnel_file_after_leaving: {
    label: 'Personnel file after the employee leaves',
    period: '6 years after employment ends is recommended',
    basis: 'recommended',
    detail: 'No statute sets a period for the file as a whole. Six years matches the time limit for contract claims. Review the file when the person leaves and remove what is no longer needed.',
    sources: [LIMITATION_5, ICO_EMP_RECORDS],
  },
  disciplinary_grievance: {
    label: 'Disciplinary and grievance records',
    period: '6 years after the matter closes (or after employment ends) is recommended',
    basis: 'recommended',
    detail: "No statute sets a period. Six years matches the time limit for contract claims, and is the period the ICO uses for its own disciplinary and grievance records. Expired warnings should not be relied on, in line with your disciplinary policy.",
    sources: [LIMITATION_5, { name: 'ICO, Retention and disposal policy (December 2025), entry 6.2', url: 'https://ico.org.uk/media2/hzbfc2c2/retention-and-disposal-policy-accessible_dec25.pdf' }, ICO_EMP_RECORDS],
  },
  sickness_absence: {
    label: 'Sickness absence and SSP records',
    period: 'SSP payments: 3 years from the end of the tax year, as payroll records. Absence records: with the personnel file, 6 years after employment ends is recommended',
    basis: 'recommended',
    detail: 'The separate duty to keep SSP records was revoked from 6 April 2014, but SSP paid is part of the payroll records HMRC requires. Absence records hold health data, so keep only what is needed, and keep fit notes and medical details separate from the main file.',
    sources: [
      { name: 'Statutory Sick Pay (General) Regulations 1982, reg. 13 (revoked 2014)', url: 'https://www.legislation.gov.uk/uksi/1982/894/regulation/13' },
      { name: "HMRC, 'PAYE for employers: keeping records'", url: 'https://www.gov.uk/paye-for-employers/keeping-records' },
      { name: "ICO, 'Employment practices and data protection: information about workers' health'", url: 'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/employment/information-about-workers-health/' },
    ],
  },
  maternity_smp: {
    label: 'Maternity and SMP records',
    period: '3 years after the end of the tax year in which the maternity pay period ends',
    basis: 'statutory',
    detail: 'Keep the dates of the maternity pay period, payments made, the MATB1 or other medical evidence, and any weeks SMP was not paid and why.',
    sources: [
      { name: 'Statutory Maternity Pay (General) Regulations 1986, reg. 26', url: 'https://www.legislation.gov.uk/uksi/1986/1960/regulation/26' },
      { name: "GOV.UK, 'Statutory Maternity Pay and Leave: employer guide: record keeping'", url: 'https://www.gov.uk/employers-maternity-pay-leave/records' },
    ],
  },
  paternity_shared_parental: {
    label: 'Statutory paternity pay and shared parental pay records',
    period: '3 years from the end of the tax year they relate to',
    basis: 'statutory',
    detail: 'HMRC record-keeping rules for statutory paternity pay and statutory shared parental pay.',
    sources: [
      { name: "GOV.UK, 'Statutory Paternity Pay and Leave: employer guide: record keeping'", url: 'https://www.gov.uk/employers-paternity-pay-leave/records' },
      { name: "GOV.UK, 'Shared Parental Leave and Pay: employer guide: record keeping'", url: 'https://www.gov.uk/shared-parental-leave-and-pay-employer-guide/record-keeping' },
    ],
  },
  pension_auto_enrolment: {
    label: 'Pension auto-enrolment records',
    period: '6 years; opt-out notices 4 years',
    basis: 'statutory',
    detail: 'Records of auto-enrolment duties (who was enrolled, when, contributions) must be kept for 6 years. Opt-out notices must be kept for 4 years.',
    sources: [{ name: "Employers' Duties (Registration and Compliance) Regulations 2010, reg. 8", url: 'https://www.legislation.gov.uk/uksi/2010/5/regulation/8' }],
  },
  working_time: {
    label: 'Working time and holiday records',
    period: 'Working time: 2 years. Holiday and holiday pay: 6 years (records made from 6 April 2026)',
    basis: 'statutory',
    detail: 'Records showing compliance with the weekly working time limit, opt-outs and night work must be kept for 2 years from the date they were made. The Employment Rights Act 2025 added a duty to keep records of holiday and holiday pay for 6 years, in force from 6 April 2026.',
    sources: [
      { name: 'Working Time Regulations 1998, reg. 9', url: 'https://www.legislation.gov.uk/uksi/1998/1833/regulation/9' },
      { name: 'Working Time Regulations 1998, reg. 16B (inserted by the Employment Rights Act 2025)', url: 'https://www.legislation.gov.uk/uksi/1998/1833/regulation/16B' },
    ],
  },
  national_minimum_wage: {
    label: 'National minimum wage records',
    period: '6 years from the end of the following pay reference period',
    basis: 'statutory',
    detail: 'Records showing that at least the national minimum wage was paid.',
    sources: [{ name: 'National Minimum Wage Regulations 2015, reg. 59', url: 'https://www.legislation.gov.uk/uksi/2015/621/regulation/59' }],
  },
  dbs_certificates: {
    label: 'DBS certificates',
    period: 'No fixed period: no longer than necessary after the recruitment decision',
    basis: 'recommended',
    detail: 'DBS guidance sets no fixed period. Certificate information should not be kept longer than necessary after the decision, allowing for disputes, complaints or safeguarding audits, then destroyed securely. You may keep a record of the date of issue, the name, the type of certificate, the position, the certificate number and the decision, but not a copy of the certificate.',
    sources: [{ name: "DBS, 'Handling of DBS certificate information'", url: 'https://www.gov.uk/government/publications/handling-of-dbs-certificate-information/handling-of-dbs-certificate-information' }],
  },
  cctv: {
    label: 'CCTV footage',
    period: 'No fixed period: only as long as needed for the purpose',
    basis: 'recommended',
    detail: 'The ICO says the law sets no minimum or maximum. Set a short period that fits the purpose, delete routinely, and keep footage longer only when it is needed, for example for an incident under investigation or a request already received. Storage capacity is not a reason to keep footage.',
    sources: [{ name: "ICO, 'Guidance on video surveillance (including CCTV)'", url: 'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/cctv-and-video-surveillance/guidance-on-video-surveillance-including-cctv/how-can-we-comply-with-the-data-protection-principles-when-using-surveillance-systems/' }],
  },
};

export const HR_RECORD_TYPES = Object.keys(HR_RECORDS);

export function hrRetention(args: Record<string, unknown>) {
  const j = requireJurisdiction(args.jurisdiction ?? 'UK', ['UK']);
  const type = String(args.record_type ?? '');
  const entry = HR_RECORDS[type];
  if (!entry) throw new ToolInputError(`record_type must be one of: ${HR_RECORD_TYPES.join(', ')}.`);
  return {
    jurisdiction: j,
    record_type: type,
    ...entry,
    notes: [
      entry.basis === 'statutory'
        ? 'Statutory: this is the minimum the law requires. Keep longer only with a reason, for example a live claim.'
        : 'Recommended: no law sets this period. It is our recommendation, based on the source given; the controller sets its own retention schedule.',
      'Keep a retention schedule and delete on time. Keeping data longer than needed breaches the storage limitation principle (UK GDPR Art. 5(1)(e)).',
      'Suspend deletion of anything relevant to a live request, complaint, claim or investigation.',
      HELP_LINE,
    ],
    disclaimer: NOT_ADVICE_GENERAL,
  };
}
