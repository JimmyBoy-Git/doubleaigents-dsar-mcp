// Public, read-only MCP server for the Double AIgents subject access (DSAR)
// service, served at /api/mcp (Streamable HTTP, stateless, JSON responses).
//
//   POST /api/mcp                -> JSON-RPC 2.0 (MCP)
//   GET  /api/mcp/server-card    -> MCP Server Card (rewritten to ?view=server-card)
//   GET  /api/mcp                -> 405 (no standalone SSE stream; stateless)
//
// Dual-era, per the MCP spec 2026-07-28 "Versioning: Backward Compatibility":
//   - Modern clients (2026-07-28) put the protocol version in params._meta and
//     mirror it, the method and the tool name into MCP-Protocol-Version,
//     Mcp-Method and Mcp-Name headers. We validate those and serve each request
//     statelessly, including server/discover.
//   - Legacy clients (2025-03-26 .. 2025-11-25) open with initialize. We answer
//     it, never mint an Mcp-Session-Id, and serve tools/list and tools/call.
//
// Discipline for anyone editing this file (same as api/agents.ts):
//   1. Read-only. No tool stores, logs or forwards anything a caller sends.
//      dsar_request_scoping only echoes its inputs into a mailto: URL.
//      The one usage log line per request (MCPLOG, see usageLog) carries the
//      time, the JSON-RPC method, the tool name and success only: never
//      arguments, IP, user agent or any other caller-supplied text.
//   2. No model or provider is named, and the internal brand is not used.
//   3. Prices: src/pages/Pricing.tsx (SAR_BANDS, SAR_OVER_PER_PAGE, retainer
//      note) is the single price list. The table below is a copy of it and
//      MUST be changed in the same commit as Pricing.tsx.
//   4. Deadline output is general information, not legal advice, and says so.

type VercelRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
};
type VercelResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): { json(body: unknown): void; end(): void };
};

const SITE = 'https://www.doubleaigents.com';
const ENDPOINT = `${SITE}/api/mcp`;
const CONTACT = 'james@doubleaigents.com';
const SERVER_INFO = { name: 'doubleaigents-dsar', title: 'Double AIgents DSAR service', version: '1.1.0' };

const MODERN_VERSIONS = ['2026-07-28'];
const LEGACY_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
const ALL_VERSIONS = [...MODERN_VERSIONS, ...LEGACY_VERSIONS];
const META_VERSION = 'io.modelcontextprotocol/protocolVersion';

const INSTRUCTIONS =
  'Double AIgents prepares responses to data subject access requests (DSARs) for organisations in the UK, the EU/EEA and Switzerland. ' +
  'Use dsar_deadline for the statutory response date, dsar_quote for our fixed price, dsar_service_info for what the service covers, ' +
  'dsar_letter_template for acknowledgement, extension and clarification letters, breach_clock for the personal data breach notification deadline, ' +
  'and dsar_request_scoping to give the user a prefilled email to start free scoping. All tools are read-only; nothing sent to them is stored. ' +
  'Do not send the requester\'s personal data or the request letter through these tools.';

const NOT_ADVICE =
  'General information, not legal advice. Check the facts of the request, and take advice where the position is unclear.';

// ---------------------------------------------------------------------------
// Dates (all UTC, date-only)

type YMD = { y: number; m: number; d: number }; // m is 1-12

function parseIsoDate(s: unknown): YMD | null {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim().slice(0, 10));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, m: mo, d };
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Add calendar months; if the target month has no corresponding day, use its last day. */
function addMonths(date: YMD, n: number): YMD {
  const total = date.y * 12 + (date.m - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return { y, m, d: Math.min(date.d, daysInMonth(y, m)) };
}

function addDays(date: YMD, n: number): YMD {
  const t = new Date(Date.UTC(date.y, date.m - 1, date.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

function iso(date: YMD): string {
  return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function weekday(date: YMD): number {
  return new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay();
}

function longDate(date: YMD): string {
  return `${WEEKDAYS[weekday(date)]} ${date.d} ${MONTHS[date.m - 1]} ${date.y}`;
}

function nextWeekday(date: YMD): YMD {
  const wd = weekday(date);
  if (wd === 6) return addDays(date, 2);
  if (wd === 0) return addDays(date, 1);
  return date;
}

// ---------------------------------------------------------------------------
// Tool: dsar_deadline

type Jurisdiction = 'UK' | 'EU' | 'CH';

function dsarDeadline(args: Record<string, unknown>) {
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
// Tool: dsar_quote  (copy of src/pages/Pricing.tsx -- keep in step)

type Currency = 'GBP' | 'EUR' | 'CHF';
const SAR_BANDS: { upTo: number; GBP: number; EUR: number; CHF: number }[] = [
  { upTo: 100, GBP: 395, EUR: 475, CHF: 550 },
  { upTo: 500, GBP: 950, EUR: 1150, CHF: 1300 },
  { upTo: 1000, GBP: 1350, EUR: 1650, CHF: 1850 },
  { upTo: 2500, GBP: 1950, EUR: 2350, CHF: 2700 },
  { upTo: 7500, GBP: 3450, EUR: 4150, CHF: 4750 },
];
const SAR_OVER_PER_PAGE: Record<Currency, number> = { GBP: 0.35, EUR: 0.4, CHF: 0.45 };
const RETAINER_MONTHLY: Record<Currency, number> = { GBP: 295, EUR: 350, CHF: 400 };
const RETAINER_DISCOUNT = 0.15;
const SYMBOL: Record<Currency, (n: string) => string> = {
  GBP: (n) => `£${n}`,
  EUR: (n) => `€${n}`,
  CHF: (n) => `CHF ${n}`,
};

function money(c: Currency, n: number): string {
  const fixed = Number.isInteger(n) ? n.toLocaleString('en-GB') : n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return SYMBOL[c](fixed);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function dsarQuote(args: Record<string, unknown>) {
  const pages = args.pages;
  if (typeof pages !== 'number' || !Number.isInteger(pages) || pages < 1) {
    throw new ToolInputError('pages must be a whole number of 1 or more (pages after de-duplication).');
  }
  const currency = String(args.currency ?? 'GBP').toUpperCase() as Currency;
  if (!['GBP', 'EUR', 'CHF'].includes(currency)) throw new ToolInputError('currency must be "GBP", "EUR" or "CHF".');

  const top = SAR_BANDS[SAR_BANDS.length - 1];
  const band = SAR_BANDS.find((b) => pages <= b.upTo);
  let price: number;
  let bandText: string;
  if (band) {
    price = band[currency];
    bandText = `Up to ${band.upTo.toLocaleString('en-GB')} pages`;
  } else {
    const over = pages - top.upTo;
    price = round2(top[currency] + over * SAR_OVER_PER_PAGE[currency]);
    bandText = `Above ${top.upTo.toLocaleString('en-GB')} pages: ${money(currency, top[currency])} plus ${money(currency, SAR_OVER_PER_PAGE[currency])} a page on the ${over.toLocaleString('en-GB')} ${over === 1 ? 'page' : 'pages'} over ${top.upTo.toLocaleString('en-GB')}`;
  }
  const retainerPrice = round2(price * (1 - RETAINER_DISCOUNT));

  return {
    pages_after_deduplication: pages,
    currency,
    band: bandText,
    price,
    price_display: `${money(currency, price)} excl. VAT`,
    retainer_price: retainerPrice,
    retainer_price_display: `${money(currency, retainerPrice)} excl. VAT`,
    retainer: `Retainer for regular requests: ${money(currency, RETAINER_MONTHLY[currency])} a month: 15% off each request plus up to 2 hours of advice calls a month; three-month minimum, then monthly.`,
    notes: [
      'Fixed price, agreed before we start. Prices exclude VAT.',
      'Pages are counted after de-duplication, which we do for you. If you do not know the count yet, free scoping will establish it.',
      'Urgent turnaround, and records in languages other than English: quoted per case.',
      'Partners (law firms, HR consultancies, DPO firms) pay list price and set their own fee to their client.',
    ],
    price_list: `${SITE}/#pricing`,
  };
}

// ---------------------------------------------------------------------------
// Tool: dsar_service_info

function dsarServiceInfo() {
  return {
    provider: {
      name: 'Double AIgents Ltd',
      registered: 'England and Wales, company number 17513072',
      ico_registration: 'ZC272947',
      website: SITE,
      contact: CONTACT,
    },
    service: 'We prepare complete responses to data subject access requests for the controller, from scoping to secure delivery.',
    steps: [
      'Scoping: free, usually within one working day of receiving the request letter.',
      'Collection guidance: we tell you what to search and how to export it.',
      'De-duplication: we remove duplicate material before counting pages.',
      'Redaction: third-party personal data and other material that should not be released.',
      'Exemption recommendations: we recommend which exemptions apply, with written reasons. The controller decides and adopts them.',
      'Two independent reviews of every pack before delivery.',
      'Secure delivery of the finished pack and a covering letter.',
    ],
    data_handling: [
      'A data processing agreement is signed before any data moves.',
      'Data is processed on encrypted servers in Germany.',
    ],
    jurisdictions: ['United Kingdom', 'EU / EEA', 'Switzerland'],
    language: 'English-language records. Non-English material can be handled at a surcharge.',
    local_counsel: 'For Germany, France and Austria we work with a locally admitted partner lawyer.',
    partners: {
      summary: 'Partner and white-label arrangements are available for law firms and DPO firms.',
      partner_pack: `${SITE}/partner-pack.pdf`,
    },
    pricing: 'Fixed price by pack size, agreed before we start. Use dsar_quote, or see the price list.',
    price_list: `${SITE}/#pricing`,
    how_to_start: 'Use dsar_request_scoping, or email ' + CONTACT + ' with the request letter.',
  };
}

// ---------------------------------------------------------------------------
// Tool: dsar_request_scoping  (echo only: nothing is stored or sent)

function cleanField(v: unknown, name: string, max: number, required: boolean): string {
  if (v === undefined || v === null || v === '') {
    if (required) throw new ToolInputError(`${name} is required.`);
    return '';
  }
  if (typeof v !== 'string' && typeof v !== 'number') throw new ToolInputError(`${name} must be text.`);
  // eslint-disable-next-line no-control-regex
  const s = String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  if (s.length > max) throw new ToolInputError(`${name} must be ${max} characters or fewer.`);
  return s;
}

function dsarRequestScoping(args: Record<string, unknown>) {
  const organisation = cleanField(args.organisation, 'organisation', 200, true);
  const contactName = cleanField(args.contact_name, 'contact_name', 120, true);
  const contactEmail = cleanField(args.contact_email, 'contact_email', 254, true);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new ToolInputError('contact_email does not look like an email address.');
  const jurisdiction = cleanField(args.jurisdiction, 'jurisdiction', 10, true).toUpperCase();
  if (!['UK', 'EU', 'CH'].includes(jurisdiction)) throw new ToolInputError('jurisdiction must be "UK", "EU" or "CH".');
  const received = parseIsoDate(args.date_received);
  if (!received) throw new ToolInputError('date_received must be an ISO date, for example 2026-03-15.');
  const volume = cleanField(args.approx_volume, 'approx_volume', 200, false);

  const subject = `DSAR scoping request: ${organisation}`;
  const body = [
    'Hello,',
    '',
    'We would like free scoping for a subject access request.',
    '',
    `Organisation: ${organisation}`,
    `Contact: ${contactName} <${contactEmail}>`,
    `Jurisdiction: ${jurisdiction}`,
    `Date request received: ${iso(received)}`,
    ...(volume ? [`Approximate volume: ${volume}`] : []),
    '',
    'The request letter is attached.',
    '',
    `Thanks and regards,`,
    contactName,
  ].join('\r\n');
  const mailto = `mailto:${CONTACT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return {
    how_to_start: `Email ${CONTACT} and attach the request letter. Scoping is free and usually takes one working day.`,
    email_to: CONTACT,
    subject,
    body,
    mailto_url: mailto,
    important: [
      'Send the request letter by email, not through this tool. This tool accepts no files and stores nothing; it only builds the email above.',
      'Do not put the requester\'s name or other personal data in these fields.',
      'Nothing has been sent. The user sends the email from their own mail client.',
    ],
  };
}

// ---------------------------------------------------------------------------
// Tool: breach_clock

type Instant = { ms: number; offsetMin: number };

function parseIsoDateTime(s: unknown): Instant | null {
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

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function offsetText(min: number): string {
  const a = Math.abs(min);
  return `${min < 0 ? '-' : '+'}${pad2(Math.floor(a / 60))}:${pad2(a % 60)}`;
}

/** Wall-clock fields of an instant at a fixed UTC offset. */
function wallAtOffset(ms: number, offsetMin: number) {
  const t = new Date(ms + offsetMin * 60000);
  const date: YMD = { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  return { date, hh: t.getUTCHours(), mm: t.getUTCMinutes(), ss: t.getUTCSeconds() };
}

function isoAtOffset(ms: number, offsetMin: number): string {
  const w = wallAtOffset(ms, offsetMin);
  return `${iso(w.date)}T${pad2(w.hh)}:${pad2(w.mm)}:${pad2(w.ss)}${offsetText(offsetMin)}`;
}

/** UTC offset of Europe/London at an instant, in minutes (0 for GMT, 60 for BST). */
function londonOffset(ms: number): number {
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

function readableAt(ms: number, offsetMin: number, zoneLabel: string): string {
  const w = wallAtOffset(ms, offsetMin);
  return `${longDate(w.date)}, ${pad2(w.hh)}:${pad2(w.mm)} ${zoneLabel}`;
}

const BREACH_FACTS = [
  'The date and time the organisation became aware of the breach, and how it found out.',
  'The nature of the breach: what happened, when it started and whether it is still going on.',
  'The categories and approximate number of people affected.',
  "The categories and approximate number of personal data records concerned, and whether special category data (for example health) or children's data is involved.",
  'Who received or could access the data, and whether it has been recalled, deleted or contained.',
  'The likely consequences for the people affected.',
  'The measures taken or proposed to deal with the breach and to reduce its possible adverse effects.',
  'The name and contact details of the data protection officer or other contact point.',
];

const BREACH_DECIDE =
  'Whether and when to notify is for the controller to decide. We recommend recording the decision and the reasons for it, whichever way it goes.';

function breachClock(args: Record<string, unknown>) {
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
    j === 'UK' ? "the Information Commissioner's Office (ICO)" : 'the competent supervisory authority (the lead supervisory authority, where there is one)';

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
// Tool: dsar_letter_template

type LetterKind = 'acknowledgement' | 'extension' | 'clarification';

function letterDate(d: YMD | null, placeholder: string): string {
  return d ? `${d.d} ${MONTHS[d.m - 1]} ${d.y}` : placeholder;
}

function optionalDate(v: unknown, name: string): YMD | null {
  if (v === undefined || v === null || v === '') return null;
  const d = parseIsoDate(v);
  if (!d) throw new ToolInputError(`${name} must be an ISO date, for example 2026-03-15.`);
  return d;
}

const COMPLAINT_LINE: Record<Jurisdiction, string> = {
  UK:
    'If you are unhappy with how we have handled your request, you can complain to us first at [contact email or address] and we will look into it. ' +
    "You also have the right to complain to the Information Commissioner's Office (ico.org.uk).",
  EU:
    'If you are unhappy with how we have handled your request, you can contact us at [contact email or address]. ' +
    'You also have the right to complain to a data protection supervisory authority, in particular in the country where you live or work.',
  CH:
    'If you are unhappy with how we have handled your request, you can contact us at [contact email or address]. ' +
    'You can also contact the Federal Data Protection and Information Commissioner (FDPIC, www.edoeb.admin.ch).',
};

const LETTER_RULE: Record<Jurisdiction, string> = {
  UK:
    'UK GDPR Art. 12(3) and Art. 12A (as inserted by the Data (Use and Access) Act 2025): one month from the relevant time (receipt, or later receipt of requested ID or fee). ' +
    'The period can be extended by up to two further months where the request is complex or the data subject has made a number of requests, if the data subject is told, with reasons, within the first month. ' +
    'Where the controller reasonably requires further information to identify the information or processing the request relates to, the period is paused from the request for clarification until the reply. ' +
    'Controllers must also have a process for handling data protection complaints (Data Protection Act 2018, as amended by the 2025 Act).',
  EU:
    'GDPR Art. 12(3): one month from receipt. The period can be extended by two further months where necessary, taking into account the complexity and number of requests, if the data subject is told, with reasons, within one month of receipt. ' +
    'The Regulation contains no rule pausing the period while the controller waits for clarification.',
  CH:
    'Switzerland (revised FADP Art. 25(7); Data Protection Ordinance Art. 18): 30 days from receipt. The period can be extended only if the data subject is told within the 30 days, with the reasons and the period within which the controller will respond.',
};

function dsarLetterTemplate(args: Record<string, unknown>) {
  const kind = String(args.kind ?? '').toLowerCase() as LetterKind;
  if (!['acknowledgement', 'extension', 'clarification'].includes(kind)) {
    throw new ToolInputError('kind must be "acknowledgement", "extension" or "clarification".');
  }
  const j = String(args.jurisdiction ?? '').toUpperCase() as Jurisdiction;
  if (!['UK', 'EU', 'CH'].includes(j)) throw new ToolInputError('jurisdiction must be "UK", "EU" or "CH".');
  const received = optionalDate(args.received_date, 'received_date');
  const dueIn = optionalDate(args.due_date, 'due_date');

  // Same arithmetic as dsar_deadline. A given due_date (for example one already
  // moved by a pause for clarification) is used in place of the calculated one.
  const due = dueIn ?? (received ? (j === 'CH' ? addDays(received, 30) : addMonths(received, 1)) : null);
  const extended = j === 'CH' ? null : dueIn ? addMonths(dueIn, 2) : received ? addMonths(received, 3) : null;

  const recText = letterDate(received, '[date received]');
  const dueText = letterDate(due, '[due date]');
  const extText = j === 'CH' ? '[new date]' : letterDate(extended, '[extended due date]');

  let subject: string;
  let body: string[];
  if (kind === 'acknowledgement') {
    subject = 'Your request for your personal data';
    body = [
      `Thank you for your request for a copy of your personal data, which we received on ${recText}.`,
      j === 'UK'
        ? `We will respond without undue delay and within one month, which means by ${dueText}. If we need to confirm your identity, the month runs from the day we receive that confirmation.`
        : j === 'EU'
          ? `We will respond without undue delay and in any event within one month of receipt, which means by ${dueText}.`
          : `We will respond within 30 days of receipt, which means by ${dueText}.`,
      '[Optional: To confirm your identity, please send us [document, for example a copy of a passport or driving licence]. We will use it only to confirm your identity.]',
      j === 'CH'
        ? 'If we need longer, we will tell you, with our reasons and the date by which we will respond, before the date above.'
        : 'If your request turns out to be complex, or you have made a number of requests, we may need longer. If so, we will tell you, with our reasons, before the date above.',
    ];
  } else if (kind === 'extension') {
    subject = 'Your request for your personal data: extension of time';
    body = [
      `We are writing about your request for a copy of your personal data, which we received on ${recText}.`,
      j === 'UK'
        ? `The law allows us to extend the time to respond by up to two further months where a request is complex or a person has made a number of requests. We need to extend the time for your request because [reasons, for example the volume of records or the number of requests]. We will now respond by ${extText}.`
        : j === 'EU'
          ? `The law allows us to extend the time to respond by two further months where necessary, taking into account the complexity and number of requests. We need to extend the time for your request because [reasons]. We will now respond by ${extText}.`
          : `We need longer than 30 days to respond to your request because [reasons]. We will respond by ${extText}.`,
      'If the information is ready sooner, we will send it to you then.',
    ];
  } else {
    subject = 'Your request for your personal data: please help us identify the information';
    body = [
      `Thank you for your request for a copy of your personal data, which we received on ${recText}.`,
      'To help us find the information you are asking for, please tell us [what is needed, for example the time period, the department or the type of records you are interested in].',
      j === 'UK'
        ? 'We need this to identify the information or processing your request relates to. The time we have to respond is paused from the date of this letter until we receive your reply. When we receive it, we will tell you the date by which we will respond.'
        : j === 'EU'
          ? `This will help us respond within the time limit, which ends on ${dueText}. We are continuing to work on your request in the meantime.`
          : `This will help us respond within the 30-day time limit, which ends on ${dueText}. We are continuing to work on your request in the meantime.`,
      'If you would like everything we hold about you, you can tell us that instead.',
    ];
  }

  const letter = [
    '[Organisation name]',
    '[Address]',
    '',
    '[Date]',
    '',
    'Dear [requester name],',
    '',
    subject,
    '',
    ...body.flatMap((p) => [p, '']),
    COMPLAINT_LINE[j],
    '',
    'Yours sincerely,',
    '',
    '[Name]',
    '[Role]',
    '[Organisation name]',
  ].join('\n');

  const notes: string[] = [];
  if (!received) notes.push('Pass received_date to fill in the dates.');
  if (dueIn) notes.push('The due_date given is used in place of the calculated one.');
  if (kind === 'extension') {
    notes.push(`Send this before the original ${j === 'CH' ? '30 days end' : 'month ends'}${due ? ` (${iso(due)})` : ''}.`);
    if (j === 'CH') notes.push('Swiss law sets no fixed maximum extension. Put in a new date you can meet.');
  }
  if (kind === 'clarification') {
    notes.push(
      j === 'UK'
        ? 'We recommend asking for clarification only where it is genuinely needed to identify the information, and promptly. Record the dates the clock stopped and restarted.'
        : 'Do not tell the requester the time limit is paused: this law has no such rule.',
    );
  }
  notes.push('Replace every [placeholder] before sending. We recommend the controller checks the letter against its own policy before use.');

  return {
    kind,
    jurisdiction: j,
    received_date: received ? iso(received) : null,
    due_date: due ? iso(due) : null,
    extended_due_date: kind === 'extension' && extended ? iso(extended) : null,
    letter,
    rule: LETTER_RULE[j],
    notes,
    disclaimer: NOT_ADVICE,
  };
}

// ---------------------------------------------------------------------------
// Tool registry

class ToolInputError extends Error {}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const TOOLS = [
  {
    name: 'dsar_deadline',
    title: 'DSAR response deadline',
    description:
      'Calculate the statutory deadline for answering a data subject access request in the UK, the EU/EEA or Switzerland, with the rule that applies and the extension position. General information, not legal advice.',
    inputSchema: {
      type: 'object',
      properties: {
        jurisdiction: { type: 'string', enum: ['UK', 'EU', 'CH'], description: 'UK, EU (EU/EEA GDPR) or CH (Switzerland).' },
        received_date: {
          type: 'string',
          format: 'date',
          description: 'ISO date the clock starts. For the UK, the later of receipt and receipt of any requested ID or fee.',
        },
        extended: { type: 'boolean', description: 'Also calculate the extended deadline where an extension is available.' },
      },
      required: ['jurisdiction', 'received_date'],
      additionalProperties: false,
    },
    annotations: { title: 'DSAR response deadline', ...READ_ONLY },
    run: dsarDeadline,
  },
  {
    name: 'dsar_quote',
    title: 'DSAR fixed-price quote',
    description:
      'Fixed price from Double AIgents for preparing a DSAR response, by pack size in pages after de-duplication. Also gives the retainer price (15% off). Excludes VAT.',
    inputSchema: {
      type: 'object',
      properties: {
        pages: { type: 'integer', minimum: 1, description: 'Number of pages after de-duplication.' },
        currency: { type: 'string', enum: ['GBP', 'EUR', 'CHF'], default: 'GBP', description: 'GBP (UK), EUR (EU/EEA) or CHF (Switzerland).' },
      },
      required: ['pages'],
      additionalProperties: false,
    },
    annotations: { title: 'DSAR fixed-price quote', ...READ_ONLY },
    run: dsarQuote,
  },
  {
    name: 'dsar_service_info',
    title: 'DSAR service information',
    description:
      'What the Double AIgents DSAR service covers: scoping, collection guidance, de-duplication, redaction, exemption recommendations, two independent reviews, secure delivery, data handling, jurisdictions and partner arrangements.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { title: 'DSAR service information', ...READ_ONLY },
    run: () => dsarServiceInfo(),
  },
  {
    name: 'dsar_request_scoping',
    title: 'Start DSAR scoping',
    description:
      'Explains how to start free scoping and returns a prefilled email (mailto URL) to james@doubleaigents.com. Sends nothing and stores nothing. Do not pass the requester\'s personal data or the request letter.',
    inputSchema: {
      type: 'object',
      properties: {
        organisation: { type: 'string', maxLength: 200, description: 'The controller organisation that received the request.' },
        contact_name: { type: 'string', maxLength: 120, description: 'Name of the person at the organisation handling the request (not the requester).' },
        contact_email: { type: 'string', format: 'email', maxLength: 254, description: 'Email of that person.' },
        jurisdiction: { type: 'string', enum: ['UK', 'EU', 'CH'] },
        date_received: { type: 'string', format: 'date', description: 'ISO date the request was received.' },
        approx_volume: { type: 'string', maxLength: 200, description: 'Optional rough volume, for example "two mailboxes, about 3 years".' },
      },
      required: ['organisation', 'contact_name', 'contact_email', 'jurisdiction', 'date_received'],
      additionalProperties: false,
    },
    annotations: { title: 'Start DSAR scoping', ...READ_ONLY },
    run: dsarRequestScoping,
  },
  {
    name: 'breach_clock',
    title: 'Personal data breach notification clock',
    description:
      'When a personal data breach must be notified to the regulator: 72 hours from awareness in the UK and EU/EEA (Art. 33), "as soon as possible" in Switzerland (revised FADP Art. 24). Gives the deadline, the rule, the processor and individual-notification position, and the facts the regulator will ask for. The controller decides whether to notify. General information, not legal advice.',
    inputSchema: {
      type: 'object',
      properties: {
        jurisdiction: { type: 'string', enum: ['UK', 'EU', 'CH'], description: 'UK, EU (EU/EEA GDPR) or CH (Switzerland).' },
        aware_at: {
          type: 'string',
          format: 'date-time',
          description: 'ISO date and time, with time zone, when the controller became aware of the breach. Example: 2026-10-17T09:30:00+01:00.',
        },
      },
      required: ['jurisdiction', 'aware_at'],
      additionalProperties: false,
    },
    annotations: { title: 'Personal data breach notification clock', ...READ_ONLY },
    run: breachClock,
  },
  {
    name: 'dsar_letter_template',
    title: 'DSAR letter template',
    description:
      'Plain-text letter template, in British English with [placeholders], for an acknowledgement, an extension of time or a request for clarification of a data subject access request, under UK, EU/EEA or Swiss law. Fills in the dates if received_date is given. General information, not legal advice.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['acknowledgement', 'extension', 'clarification'] },
        jurisdiction: { type: 'string', enum: ['UK', 'EU', 'CH'], description: 'UK, EU (EU/EEA GDPR) or CH (Switzerland).' },
        received_date: {
          type: 'string',
          format: 'date',
          description: 'Optional ISO date the clock started. For the UK, the later of receipt and receipt of any requested ID or fee.',
        },
        due_date: { type: 'string', format: 'date', description: 'Optional ISO due date, used in place of the calculated one.' },
      },
      required: ['kind', 'jurisdiction'],
      additionalProperties: false,
    },
    annotations: { title: 'DSAR letter template', ...READ_ONLY },
    run: dsarLetterTemplate,
  },
];

function toolList() {
  return TOOLS.map(({ run: _run, ...t }) => t);
}

function callTool(params: Record<string, unknown>) {
  const name = params.name;
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { rpcError: { code: -32602, message: `Unknown tool: ${String(name)}` } };
  const args = (params.arguments && typeof params.arguments === 'object' ? params.arguments : {}) as Record<string, unknown>;
  try {
    const out = tool.run(args);
    return {
      result: {
        content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
        structuredContent: out,
        isError: false,
      },
    };
  } catch (err) {
    if (err instanceof ToolInputError) {
      return { result: { content: [{ type: 'text', text: err.message }], isError: true } };
    }
    return { result: { content: [{ type: 'text', text: 'Internal error.' }], isError: true } };
  }
}

// ---------------------------------------------------------------------------
// Server Card (SEP-2127)

export const SERVER_CARD = {
  $schema: 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json',
  name: 'com.doubleaigents/dsar',
  title: SERVER_INFO.title,
  version: SERVER_INFO.version,
  description:
    'Read-only tools for the Double AIgents subject access request (DSAR) service: statutory deadlines (UK, EU/EEA, Switzerland), letter templates (acknowledgement, extension, clarification), the personal data breach notification clock, fixed-price quotes, service information and how to start free scoping.',
  websiteUrl: SITE,
  remotes: [{ type: 'streamable-http', url: ENDPOINT, supportedProtocolVersions: ALL_VERSIONS }],
};

// ---------------------------------------------------------------------------
// HTTP / JSON-RPC

type RpcId = string | number | null;
type Rpc = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };

function header(req: VercelRequest, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

function decodeSentinel(v: string): string {
  const m = /^=\?base64\?(.*)\?=$/.exec(v);
  return m ? Buffer.from(m[1], 'base64').toString('utf8') : v;
}

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id, Last-Event-ID, If-None-Match',
  );
  res.setHeader('Access-Control-Expose-Headers', 'ETag');
}

function originOk(origin: string | undefined): boolean {
  // Public, unauthenticated, read-only server with no private data, so any web
  // origin may call it. We still reject malformed or non-http(s) origins.
  if (!origin) return true;
  try {
    const u = new URL(origin);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Usage log: one line per request, for counting calls in the platform logs.
// Only fixed vocabulary is written. Caller-supplied method or tool names that
// are not ours become "other" / "unknown", so no caller text reaches the log.

const LOGGED_METHODS = [
  'initialize',
  'ping',
  'tools/list',
  'tools/call',
  'server/discover',
  'notifications/initialized',
  'notifications/cancelled',
];

type UsageLog = { method: string; tool?: string; ok: boolean };

function usageLog(entry: UsageLog) {
  const line: Record<string, unknown> = { t: new Date().toISOString(), method: entry.method };
  if (entry.tool !== undefined) line.tool = entry.tool;
  line.ok = entry.ok;
  console.log('MCPLOG ' + JSON.stringify(line));
}

function bodyIsError(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const b = body as { error?: unknown; result?: { isError?: unknown } };
  return b.error !== undefined || b.result?.isError === true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const log: UsageLog = { method: `http:${(req.method ?? 'GET').toUpperCase()}`, ok: false };
  let logged = false;
  const writeLog = () => {
    if (logged) return;
    logged = true;
    try {
      usageLog(log);
    } catch {
      // never let logging break a response
    }
  };
  const tracked: VercelResponse = {
    setHeader: (n, v) => res.setHeader(n, v),
    status(code: number) {
      const r = res.status(code);
      return {
        json(body: unknown) {
          log.ok = code < 400 && !bodyIsError(body);
          writeLog();
          r.json(body);
        },
        end() {
          log.ok = code < 400;
          writeLog();
          r.end();
        },
      };
    },
  };
  try {
    return await route(req, tracked, log);
  } finally {
    writeLog();
  }
}

async function route(req: VercelRequest, res: VercelResponse, log: UsageLog) {
  setCors(res);
  const method = (req.method ?? 'GET').toUpperCase();

  if (method === 'OPTIONS') return res.status(204).end();

  const view = req.query?.view;
  if (method === 'GET' && (view === 'server-card' || (Array.isArray(view) && view[0] === 'server-card'))) {
    log.method = 'server-card';
    res.setHeader('Content-Type', 'application/mcp-server-card+json');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).json(SERVER_CARD);
  }

  if (!originOk(header(req, 'origin'))) {
    return res.status(403).json({ jsonrpc: '2.0', error: { code: -32600, message: 'Forbidden origin' } });
  }

  if (method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ jsonrpc: '2.0', error: { code: -32600, message: 'Method not allowed. POST JSON-RPC to this endpoint.' } });
  }

  let msg: unknown = req.body;
  if (typeof msg === 'string') {
    try {
      msg = JSON.parse(msg);
    } catch {
      return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
  }
  if (Buffer.isBuffer(msg)) {
    try {
      msg = JSON.parse(msg.toString('utf8'));
    } catch {
      return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
  }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
    return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request: send a single JSON-RPC object.' } });
  }

  const rpc = msg as Rpc;
  const isRequest = 'id' in rpc && rpc.id !== undefined;
  const id: RpcId = typeof rpc.id === 'string' || typeof rpc.id === 'number' ? rpc.id : null;
  if (rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string') {
    return res.status(400).json({ jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid Request' } });
  }
  const rpcMethod = rpc.method;
  const params = (rpc.params && typeof rpc.params === 'object' ? rpc.params : {}) as Record<string, unknown>;
  log.method = LOGGED_METHODS.includes(rpcMethod) ? rpcMethod : 'other';
  if (rpcMethod === 'tools/call') log.tool = TOOLS.some((t) => t.name === params.name) ? String(params.name) : 'unknown';

  // Notifications (no id): accept and return 202 with no body.
  if (!isRequest) return res.status(202).end();

  res.setHeader('Content-Type', 'application/json');
  const send = (status: number, body: Record<string, unknown>) => res.status(status).json({ jsonrpc: '2.0', id, ...body });

  const meta = (params._meta && typeof params._meta === 'object' ? params._meta : {}) as Record<string, unknown>;
  const bodyVersion = typeof meta[META_VERSION] === 'string' ? (meta[META_VERSION] as string) : undefined;
  const headerVersion = header(req, 'mcp-protocol-version');

  // ---- Modern era: per-request metadata ----------------------------------
  if (bodyVersion !== undefined || (headerVersion && !LEGACY_VERSIONS.includes(headerVersion))) {
    if (bodyVersion === undefined || !MODERN_VERSIONS.includes(bodyVersion)) {
      return send(400, {
        error: { code: -32022, message: 'Unsupported protocol version', data: { supported: ALL_VERSIONS, requested: bodyVersion ?? headerVersion ?? null } },
      });
    }
    if (headerVersion !== bodyVersion) {
      return send(400, { error: { code: -32020, message: 'Header mismatch: MCP-Protocol-Version header missing or does not match _meta protocolVersion' } });
    }
    const hMethod = header(req, 'mcp-method');
    if (hMethod !== rpcMethod) {
      return send(400, { error: { code: -32020, message: 'Header mismatch: Mcp-Method header missing or does not match body method' } });
    }
    if (rpcMethod === 'tools/call') {
      const hName = header(req, 'mcp-name');
      if (hName === undefined || decodeSentinel(hName) !== params.name) {
        return send(400, { error: { code: -32020, message: 'Header mismatch: Mcp-Name header missing or does not match params.name' } });
      }
    }

    const serverMeta = { 'io.modelcontextprotocol/serverInfo': SERVER_INFO };
    switch (rpcMethod) {
      case 'server/discover':
        return send(200, {
          result: {
            resultType: 'complete',
            supportedVersions: ALL_VERSIONS,
            capabilities: { tools: {} },
            _meta: serverMeta,
            instructions: INSTRUCTIONS,
            ttlMs: 3600000,
            cacheScope: 'public',
          },
        });
      case 'ping':
        return send(200, { result: { resultType: 'complete' } });
      case 'tools/list':
        return send(200, { result: { resultType: 'complete', tools: toolList(), ttlMs: 3600000, cacheScope: 'public' } });
      case 'tools/call': {
        const r = callTool(params);
        if ('rpcError' in r) return send(200, { error: r.rpcError });
        return send(200, { result: { resultType: 'complete', ...r.result } });
      }
      default:
        return send(404, { error: { code: -32601, message: `Method not found: ${rpcMethod}` } });
    }
  }

  // ---- Legacy era: initialize handshake, no sessions ----------------------
  switch (rpcMethod) {
    case 'initialize': {
      const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
      const protocolVersion = LEGACY_VERSIONS.includes(requested) ? requested : LEGACY_VERSIONS[0];
      return send(200, {
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        },
      });
    }
    case 'ping':
      return send(200, { result: {} });
    case 'tools/list':
      return send(200, { result: { tools: toolList() } });
    case 'tools/call': {
      const r = callTool(params);
      if ('rpcError' in r) return send(200, { error: r.rpcError });
      return send(200, { result: r.result });
    }
    default:
      return send(200, { error: { code: -32601, message: `Method not found: ${rpcMethod}` } });
  }
}
