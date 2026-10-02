"""Choisir un mois dans le selecteur maison (`components/MonthPicker.tsx`).

Il remplace `<input type="month">` depuis le 02/10/2026 : on ne peut plus y
taper « 2026-09 », on ouvre la grille, on change d'annee puis on clique le mois.

    from month_ui import choose_month
    choose_month(page, "2026-09")            # champ « Mois »
"""
import re


def choose_month(p, month, label="Mois"):
    # « Mois : septembre 2026 » ; les fleches s'appellent « Mois precedent / suivant ».
    p.get_by_role("button", name=re.compile(rf"^{label} : ")).first.click()
    grid = p.get_by_test_id("month-picker")
    year = int(month[:4])
    for _ in range(20):
        if grid.locator(f'[data-month="{month}"]').count():
            break
        shown = int(grid.locator("span").first.inner_text())
        grid.get_by_role("button", name="Année suivante" if year > shown else "Année précédente").click()
    grid.locator(f'[data-month="{month}"]').click()
