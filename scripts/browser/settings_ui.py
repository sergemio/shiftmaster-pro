"""Ouvrir les reglages depuis un test, quelle que soit la taille d'ecran.

Depuis le 22/09/2026 : sur ordinateur, le bouton menu en haut a gauche ouvre un
tiroir ; sur telephone, la roue dentee ouvre une fenetre. Dans les deux cas les
reglages sont ranges en sections repliables : on les deplie toutes, pour que les
tests trouvent chaque reglage comme avant.
"""


def open_settings(p, expand_all=True):
    btn = next(b for b in p.locator("[data-tour=settings]").all() if b.is_visible())
    if btn.get_attribute("aria-expanded") != "true":
        btn.click(); p.wait_for_timeout(500)
    if expand_all:
        # Une section a la fois, en attendant la fin de son glissement (0,2 s) :
        # cliquer pendant qu'elles bougent tomberait sur la mauvaise ligne.
        closed = p.locator("button[aria-controls^='settings-'][aria-expanded='false']")
        for _ in range(20):
            if closed.count() == 0:
                break
            closed.first.click(); p.wait_for_timeout(260)
