# Travailler sur Rembobine en parallèle (« parts »)

Rembobine = logiciel médiathèque français, avec un salon dessiné :
- **2D** : `/home/claude/cinebox-web/index.html` (une seule page HTML, salon dessiné en SVG). NE PAS MODIFIER ce fichier.
Tu écris uniquement dans `/home/claude/parts/` (tes fichiers), et tu testes sur des COPIES.
Tout le texte visible par l'utilisateur est en français. Pas de personnage, logo ou œuvre protégée ; pas de stéréotype sur un peuple ;
pas de figure religieuse sacrée tournée en dérision.

## Règle de lumière (importante, demandée par l'utilisateur)
La lumière de la pièce reste NATURELLE. Aucune lumière sans source visible. Seules les décorations qui ont une source
(guirlande, bougie, lanterne, sapin, citrouille…) apportent une petite lueur colorée locale. Pas de voile coloré sur toute la pièce,
pas de projecteurs qui sortent de nulle part.

## 2D : un fichier par fête dans `parts/web/<nom>.js`
Le fichier est inséré tel quel dans le `<script>` du logiciel (même portée que le reste du code). Il enregistre :
```js
FETES2D["nouvelan"] = {
  replaces: true,          // remplace la décoration intégrée (festSvg) de cette fête
  css: `...`,              // facultatif : animations CSS (préfixe tes classes, ex. .ny-)
  greet: (c) => "Bonne année !",       // facultatif : message d'accueil
  wall:   (c) => "<svg…>",  // calque du mur (derrière la cheminée, la télé et les meubles du fond)
  mantel: (c) => "…",      // calque devant le fond (cheminée, dessus de cheminée)
  front:  (c) => "…",      // calque de devant (canapé, table basse, sol)
  window: (c) => "…",      // dans le ciel de la fenêtre (découpé à x 798–1002, y 128–392)
};
```
`c` = { id, nat (code pays si id = "nat:XX"), y, m, day, h, per ("night"|"dawn"|"day"|"dusk"), season, W (=2600), flagSvg(code,x,y,w,h), FLAGS, esc, profiles }.
Coordonnées du salon (SVG, la vue montre x 440 → 2200, y 0 → 720) : sol à y=600 (le plancher va de 600 à 720),
fenêtre x 798–1002 / y 128–392 (rebord y≈392), télé ≈ x 1053–1422 / y 250–470, cheminée x 1420–1705 (dessus de cheminée y=318,
foyer 1466–1614 / 432–600), horloge (1562, 236), bibliothèque de droite à partir de x≈1882, lampe sur pied x≈1820,
canapé ≈ x 920–1355 / y 560–720 (devant), table basse ≈ x 1440–1700 / y ≈ 612, boîte de quiz ≈ 1900–1960.
Les ids de fête du logiciel : nouvelan, galette, chandeleur, valentin, poisson, stpatrick (et "nat:IE"), paques, muguet, victoire,
musique, 14juillet, toussaint, armistice, vendredi13, et "nat:XX" pour les fêtes nationales (BE CH LU MC QC CA US IE DE IT ES PT NL PL GR MA DZ TN SN CI CM HT MX BR JP).
Une clé "nat" sert à TOUTES les fêtes nationales sans clé propre ; une clé "nat:BE" est prioritaire pour la Belgique.
Les nouveaux événements utilisent les ids définis par le calendrier (parts/web/_calendrier.js) : voir la liste dans ta mission.

Tester : `python3 /home/claude/parts/tools/build_web.py --out /tmp/<toi>/index.html --only tonfichier.js[,autre.js]`
puis `node /home/claude/parts/tools/shot2d.js /tmp/<toi>/index.html /tmp/<toi>/shots "2027-01-01T00:30:00|nouvelan"`
(`--zoom=x,y,w,h` pour un gros plan en pixels de l'image de 1344×550). Regarde TOUJOURS tes images (outil Read) avant de conclure.
Si une fête n'a pas encore de date (nouvel événement), mets-la temporairement dans ta copie de test via
`--only /home/claude/parts/web/_calendrier.js,tonfichier.js` quand le calendrier existe, sinon ajoute à la fin de ton fichier de TEST
(pas du fichier final) une ligne qui force la fête.

## À la fin
Écris un court rapport : fichiers créés, ce que chaque fête affiche, chemins des captures finales, problèmes restants.
