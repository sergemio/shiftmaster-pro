"""Mails de ShiftMaster (30/09/2026) : confirmation d'adresse, mot de passe oublie et
invitation partent de NOS fonctions, en HTML a nos couleurs. Aux emulateurs, ils sont
ranges dans la collection `mailOutbox` au lieu de partir : on les lit, on verifie leur
contenu, puis on suit le lien comme le ferait la personne. Emulateurs seulement."""
from playwright.sync_api import sync_playwright
from dates import MON, iso
import time, json, re, html, urllib.request
URL = "http://localhost:3100/shiftmaster-pro/"
OUTBOX = "http://127.0.0.1:8080/v1/projects/demo-shiftmaster/databases/(default)/documents/mailOutbox?pageSize=300"
res = []
def check(label, ok, extra=""):
    res.append(ok)
    print(("OK     " if ok else "ECHEC  ") + label + (f"  [{extra}]" if not ok else ""))

TS = int(time.time())
NEW = f"henry{TS}@test.fr"
INVITEE = f"lina{TS}@test.fr"

def mails(to):
    """Mails ranges pour une adresse, du plus ancien au plus recent."""
    req = urllib.request.Request(OUTBOX, headers={"Authorization": "Bearer owner"})
    docs = json.load(urllib.request.urlopen(req)).get("documents", [])
    out = [{k: (v.get("stringValue") if isinstance(v, dict) else v) for k, v in d["fields"].items()} for d in docs]
    return sorted([m for m in out if m.get("to") == to], key=lambda m: m.get("at") or "")

def button_link(m):
    """Le lien du bouton violet, tel qu'il est dans le HTML."""
    hit = re.search(r'<a href="([^"]+)" style="display:inline-block', m["html"])
    return html.unescape(hit.group(1)) if hit else ""

def wait_mail(to, n, tries=20):
    for _ in range(tries):
        got = mails(to)
        if len(got) >= n: return got
        time.sleep(0.5)
    return mails(to)

def fresh(b):
    p = b.new_context(viewport={"width": 1400, "height": 1000}).new_page()
    p.goto(URL); p.evaluate("() => { localStorage.clear(); localStorage.setItem('shiftmaster_lang','fr'); }"); p.reload()
    return p

with sync_playwright() as pw:
    b = pw.chromium.launch()
    errors = []

    # --- 1. inscription : le mail de confirmation --------------------------------------
    p = fresh(b); p.on("pageerror", lambda e: errors.append(str(e)))
    form = p.get_by_test_id("auth-form")
    form.get_by_role("button", name="Pas de compte ? En créer un").click()
    form.get_by_label("Prénom et nom").fill("Henry Test"); form.get_by_label("Email").fill(NEW)
    form.get_by_label("Mot de passe").fill("motdepasse8")
    form.get_by_role("button", name="Créer mon compte").click()
    got = wait_mail(NEW, 1)
    m = got[-1] if got else {}
    check("Inscription : un mail de confirmation, un seul", len(got) == 1, len(got))
    check("... objet « Confirmez votre adresse email », signe ShiftMaster", m.get("subject") == "Confirmez votre adresse email" and m.get("fromName") == "ShiftMaster", m.get("subject"))
    check("... « Bonjour Henry, » (le prenom seul)", "Bonjour Henry," in (m.get("html") or ""))
    link = button_link(m) if m else ""
    check("... le bouton mene a l'app (et non a la page anglaise de Firebase)", link.startswith(URL + "?mode=verifyEmail&oobCode="), link[:90])
    check("... version texte jointe, avec le lien", link and link in (m.get("text") or ""))

    # Le bouton « Renvoyer » juste apres : pas de second mail avant une minute
    p.wait_for_timeout(2500)
    again = p.get_by_role("button", name=re.compile("Renvoyer"))
    if again.count():
        again.first.click(); p.wait_for_timeout(2500)
        check("Renvoyer dans la minute : aucun second mail", len(mails(NEW)) == 1, len(mails(NEW)))

    v = b.new_page(); v.goto(link); v.wait_for_timeout(3000)
    check("Clic sur le bouton : page de l'app « adresse confirmee »", v.get_by_test_id("auth-action").count() == 1 and "confirm" in v.locator("body").inner_text().lower(), v.locator("body").inner_text()[:150])
    v.close()

    # --- 2. mot de passe oublie ------------------------------------------------------------
    r = fresh(b); r.on("pageerror", lambda e: errors.append(str(e)))
    f = r.get_by_test_id("auth-form")
    f.get_by_role("button", name="Mot de passe oublié ?").click()
    f.get_by_label("Email").fill(NEW)
    f.get_by_role("button", name="Recevoir le lien").click(); r.wait_for_timeout(2500)
    check("Demande envoyee : message affiche", "lien de réinitialisation" in f.inner_text(), f.inner_text()[:150])
    got = wait_mail(NEW, 2); m = got[-1]
    check("Mail « Choisissez un nouveau mot de passe », qui nomme le compte", m.get("subject") == "Choisissez un nouveau mot de passe" and NEW in m["html"], m.get("subject"))
    link = button_link(m)
    r.goto(link); r.wait_for_timeout(2500)
    r.locator("input[type=password]").first.fill("nouveau-mdp-9"); r.keyboard.press("Enter"); r.wait_for_timeout(2500)
    check("Nouveau mot de passe enregistre par la page de l'app", r.get_by_test_id("auth-action").count() == 1 and "Continuer" in r.locator("body").inner_text(), r.locator("body").inner_text()[:150])
    r2 = fresh(b); f = r2.get_by_test_id("auth-form")
    f.get_by_label("Email").fill(NEW); f.get_by_label("Mot de passe").fill("nouveau-mdp-9")
    f.get_by_role("button", name="Se connecter", exact=True).click(); r2.wait_for_timeout(4000)
    check("Connexion avec le nouveau mot de passe", r2.get_by_test_id("auth-form").count() == 0)

    # Adresse inconnue : le meme message, et aucun mail (on ne revele pas qui a un compte)
    u = fresh(b); f = u.get_by_test_id("auth-form")
    f.get_by_role("button", name="Mot de passe oublié ?").click()
    f.get_by_label("Email").fill(f"personne{TS}@test.fr")
    f.get_by_role("button", name="Recevoir le lien").click(); u.wait_for_timeout(2500)
    check("Adresse sans compte : meme message, aucun mail", "lien de réinitialisation" in f.inner_text() and not mails(f"personne{TS}@test.fr"), f.inner_text()[:150])

    # --- 3. invitation ------------------------------------------------------------------------
    s = fresh(b); s.on("pageerror", lambda e: errors.append(str(e)))
    s.get_by_label("Email").fill("serge@test.fr"); s.get_by_label("Mot de passe").fill("test1234")
    s.get_by_role("button", name="Se connecter", exact=True).click(); s.wait_for_timeout(3800)
    s.get_by_role("button", name="Gérer l'équipe").first.click(); s.wait_for_timeout(700)
    s.get_by_role("button", name="Ajouter une personne").first.click(); s.wait_for_timeout(400)
    s.get_by_label("Nom", exact=True).fill("Lina Test")
    s.locator('input[type="email"]').last.fill(INVITEE)
    s.get_by_label("Date d'arrivée").last.fill(iso(MON, -30))
    s.get_by_role("button", name="Ajouter à l'équipe").click(); s.wait_for_timeout(1500)
    row = s.locator("div.cursor-pointer").filter(has_text="Lina Test").first
    row.get_by_test_id("access-invite").click(); s.wait_for_timeout(1500)
    pend = row.get_by_test_id("access-pending")
    pend.get_by_role("button", name="Envoyer par email").click(); s.wait_for_timeout(2500)
    check("« Envoyer par email » : confirmation « Envoyé » a l'ecran", "Envoyé" in pend.inner_text(), pend.inner_text())
    got = wait_mail(INVITEE, 1); m = got[-1] if got else {}
    check("Un mail d'invitation part a Lina", len(got) == 1, len(got))
    check("... objet « Serge vous invite sur le planning de Sezam (demo) »", m.get("subject") == "Serge vous invite sur le planning de Sezam (demo)", m.get("subject"))
    check("... reponse a Serge, expediteur « Serge via ShiftMaster »", m.get("replyTo") == "serge@test.fr" and m.get("fromName") == "Serge via ShiftMaster", (m.get("replyTo"), m.get("fromName")))
    check("... « Bonjour Lina, » et l'adresse a utiliser", "Bonjour Lina," in m.get("html", "") and INVITEE in m.get("html", ""))
    link = button_link(m) if m else ""
    check("... le bouton porte le lien d'invitation", link.startswith(URL + "?org=") and "&invite=" in link, link[:90])
    pend.get_by_role("button", name="Envoyer par email").click(); s.wait_for_timeout(2500)
    check("Second clic dans la minute : aucun second mail", len(mails(INVITEE)) == 1, len(mails(INVITEE)))
    n = fresh(b); n.goto(link); n.wait_for_timeout(1500)
    check("Le lien du mail ouvre l'invitation", n.get_by_test_id("invite-banner").count() == 1)

    check("Aucune erreur JavaScript", not errors, errors[:3])
    b.close()
print("\nTOUT PASSE" if all(res) else f"\n{res.count(False)} ECHEC(S)")
