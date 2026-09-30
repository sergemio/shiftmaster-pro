/**
 * Mails envoyes par ShiftMaster : confirmation d'adresse, mot de passe oublie,
 * invitation d'un employe. HTML valide dans les messageries (tableaux, styles en
 * ligne, polices systeme), plus une version texte. Maquette validee par Serge le
 * 30/09/2026 : maquettes/emails/apercu.html.
 *
 * Le nom de la marque est provisoire : il ne vit qu'ici (BRAND).
 */
export const BRAND = 'ShiftMaster';

const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const C = { paper: '#f6f7f9', card: '#ffffff', line: '#e4e6eb', lineSoft: '#f0f1f4', tint: '#fafbfc', ink: '#13151a', graphite: '#585e6a', mute: '#8a8f9a', violet: '#5b3df5' };

/** Tout texte venu d'un utilisateur (nom, restaurant) passe par ici avant le HTML. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const T = {
  fr: {
    fallback: 'Le bouton ne marche pas ? Copiez ce lien dans votre navigateur :',
    hello: (n) => n ? `Bonjour ${n},` : 'Bonjour,',
    verify: {
      subject: 'Confirmez votre adresse email',
      preheader: `Un clic, et votre compte ${BRAND} est prêt.`,
      title: 'Confirmez votre adresse email',
      body: `Votre compte ${BRAND} est créé. Confirmez que cette adresse est bien la vôtre pour ouvrir votre planning.`,
      button: 'Confirmer mon adresse',
      note: 'Vous n’avez pas créé de compte ? Ignorez ce message : rien ne sera activé.',
    },
    reset: {
      subject: 'Choisissez un nouveau mot de passe',
      preheader: 'Le lien pour choisir un nouveau mot de passe.',
      title: 'Choisissez un nouveau mot de passe',
      body: (email) => `Une demande de nouveau mot de passe a été faite pour le compte ${email}.`,
      button: 'Choisir un nouveau mot de passe',
      note: 'Vous n’êtes pas à l’origine de cette demande ? Ignorez ce message : votre mot de passe actuel reste valable.',
    },
    invite: {
      subject: (inviter, org) => `${inviter} vous invite sur le planning de ${org}`,
      preheader: (org) => `Vos horaires chez ${org}, à jour sur votre téléphone.`,
      title: (inviter, org) => `${inviter} vous invite à rejoindre l’équipe de ${org}`,
      body: (org) => `Le planning de ${org} est désormais sur ${BRAND}. Vous y verrez vos horaires, toujours à jour, depuis votre téléphone.`,
      useEmail: 'Créez votre compte avec cette adresse :',
      button: 'Rejoindre l’équipe',
      note: (inviter) => `Une question ? Répondez simplement à ce message : il arrivera à ${inviter}.`,
    },
  },
  en: {
    fallback: 'Button not working? Paste this link into your browser:',
    hello: (n) => n ? `Hello ${n},` : 'Hello,',
    verify: {
      subject: 'Confirm your email address',
      preheader: `One click and your ${BRAND} account is ready.`,
      title: 'Confirm your email address',
      body: `Your ${BRAND} account has been created. Confirm this address is yours to open your schedule.`,
      button: 'Confirm my address',
      note: 'Didn’t create an account? Ignore this message: nothing will be activated.',
    },
    reset: {
      subject: 'Choose a new password',
      preheader: 'The link to choose a new password.',
      title: 'Choose a new password',
      body: (email) => `Someone asked for a new password for the account ${email}.`,
      button: 'Choose a new password',
      note: 'Didn’t ask for this? Ignore this message: your current password still works.',
    },
    invite: {
      subject: (inviter, org) => `${inviter} invited you to the ${org} schedule`,
      preheader: (org) => `Your hours at ${org}, up to date on your phone.`,
      title: (inviter, org) => `${inviter} invited you to join the ${org} team`,
      body: (org) => `The ${org} schedule is now on ${BRAND}. You’ll see your hours there, always up to date, from your phone.`,
      useEmail: 'Create your account with this address:',
      button: 'Join the team',
      note: (inviter) => `Any question? Just reply to this message: it will reach ${inviter}.`,
    },
  },
};
const lang = (l) => (l === 'en' ? T.en : T.fr);

const p = (html, bottom = 12) => `<p style="margin:0 0 ${bottom}px;font-size:15px;line-height:24px;color:${C.graphite};">${html}</p>`;

/** Gabarit commun : marque, carte blanche, bouton violet, lien de secours dessous. */
const layout = ({ l, preheader, title, paragraphs, box = '', button, link, note }) => `<!doctype html>
<html lang="${l === T.en ? 'en' : 'fr'}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${title}</title></head>
<body style="margin:0;padding:0;background:${C.paper};">
<div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
<tr><td style="padding:0 4px 20px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="width:24px;height:24px;background:${C.violet};border-radius:7px;font-size:0;line-height:0;vertical-align:middle;"><div style="margin:8px 6px 0;height:2px;background:#fff;border-radius:2px;"></div><div style="margin:4px 10px 0 6px;height:2px;background:#fff;border-radius:2px;"></div></td>
<td style="padding-left:8px;font:700 16px/24px ${FONT};color:${C.ink};letter-spacing:-.02em;">${BRAND}</td>
</tr></table></td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:16px;padding:36px 32px;font-family:${FONT};">
<h1 style="margin:0 0 16px;font-size:22px;line-height:28px;font-weight:700;color:${C.ink};letter-spacing:-.01em;">${title}</h1>
${paragraphs}${box}
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${C.violet};border-radius:10px;">
<a href="${esc(link)}" style="display:inline-block;padding:13px 24px;font-size:15px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;">${button}</a>
</td></tr></table>
<p style="margin:28px 0 0;padding-top:20px;border-top:1px solid ${C.lineSoft};font-size:13px;line-height:20px;color:${C.mute};">${note}</p>
</td></tr>
<tr><td style="padding:20px 4px 0;font:12px/18px ${FONT};color:${C.mute};">${l.fallback}<br><a href="${esc(link)}" style="color:${C.violet};word-break:break-all;">${esc(link)}</a></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

const text = (...lines) => lines.filter(x => x !== null).join('\n\n');

/** Confirmation d'adresse. `name` : prenom ou nom du compte, facultatif. */
export const verifyEmailMail = ({ lang: lg, name, link }) => {
  const l = lang(lg), m = l.verify, hello = l.hello(name ? esc(name) : '');
  return {
    subject: m.subject,
    html: layout({ l, preheader: m.preheader, title: m.title, paragraphs: p(hello) + p(m.body, 28), button: m.button, link, note: m.note }),
    text: text(l.hello(name || ''), m.body, `${m.button} : ${link}`, m.note),
  };
};

export const resetPasswordMail = ({ lang: lg, email, link }) => {
  const l = lang(lg), m = l.reset;
  const who = `<b style="color:${C.ink};font-weight:600;">${esc(email)}</b>`;
  return {
    subject: m.subject,
    html: layout({ l, preheader: m.preheader, title: m.title, paragraphs: p(m.body(who), 28), button: m.button, link, note: m.note }),
    text: text(m.body(email), `${m.button} : ${link}`, m.note),
  };
};

/** Invitation : `inviter` = prenom du gerant, `name` = prenom de l'employe. */
export const inviteMail = ({ lang: lg, inviter, org, name, email, link }) => {
  const l = lang(lg), m = l.invite;
  const I = esc(inviter), O = esc(org);
  const box = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;background:${C.tint};border:1px solid ${C.lineSoft};border-radius:12px;"><tr><td style="padding:14px 16px;font-size:13px;line-height:20px;color:${C.graphite};">${m.useEmail}<br><b style="font-size:15px;line-height:24px;color:${C.ink};font-weight:600;">${esc(email)}</b></td></tr></table>`;
  return {
    subject: m.subject(inviter, org),
    html: layout({ l, preheader: m.preheader(O), title: m.title(I, O), paragraphs: p(l.hello(name ? esc(name) : '')) + p(m.body(O), 20), box, button: m.button, link, note: m.note(I) }),
    text: text(l.hello(name || ''), m.body(org), `${m.useEmail} ${email}`, `${m.button} : ${link}`, m.note(inviter)),
  };
};
