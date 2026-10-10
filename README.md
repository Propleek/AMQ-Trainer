# AMQ Trainer

Entraîne-toi pour [Anime Music Quiz](https://animemusicquiz.com) sur **ta propre liste d'animés** : le site te fait deviner les openings, endings et insert songs comme sur AMQ, retient ce que tu as raté et te le fait réviser jusqu'à ce que tu le connaisses, comme avec des flashcards.

**👉 Ouvrir le site** : `https://<utilisateur>.github.io/<dépôt>/` *(lien à compléter après le premier déploiement)*

Aucune inscription, aucune installation : tout se passe dans le navigateur.

## Fonctionnalités

- **Ta liste comme pool de musiques** : import par pseudo AniList, depuis un export XML MyAnimeList, ou **listes composées à la main** en cherchant des animés sur AniList.
- **Règles d'AMQ** : extrait lancé à un endroit aléatoire du morceau, temps de réponse limité, autocomplétion sur **tous les animés de la base**, réponse **stricte** (une autre saison du même animé est fausse ; nom romaji, anglais ou alternatif acceptés).
- **Trois modes de jeu** :
  - **Découverte** : découvre ta liste par paquets (100 musiques par défaut) au lieu de tout jouer d'un coup ; chaque musique jouée sort du pool de découverte.
  - **Révision** : rejoue tes musiques ratées jusqu'à les trouver.
  - **Test** : une partie comme sur AMQ, tirée parmi les musiques déjà vues, pour mesurer ton niveau.
- **Progression conservée** : chaque musique est *jamais vue*, *à réviser* ou *connue* ; une partie abandonnée garde les réponses déjà données.
- **Réglages** : statuts de la liste, types de musiques (OP / ED / insert), nombre de musiques, durée de réponse, difficulté, point de départ de l'extrait.
- **Résultats** : score, réécoute de chaque musique, « Rejouer les ratés » et « Paquet suivant ».

## Utilisation

1. **Choisis une liste** : tape ton pseudo AniList (liste publique), dépose ton export XML MyAnimeList (*Profil → Import/Export → Export My List*, puis décompresse le `.xml.gz`), ou crée une liste dans *Mes listes*.
2. **Configure la partie** : le premier chargement d'une liste prend quelques secondes, les suivants sont quasi instantanés. Choisis le mode et les réglages.
3. **Joue** : tape le nom de l'animé et valide avec **Entrée** (ou clique une proposition ; **↑ / ↓** pour parcourir la liste). À la fin du temps, ce que tu as tapé est validé. **Entrée** passe à la musique suivante.

## D'où viennent les données ?

| Données | Source |
|---|---|
| Listes AniList, recherche d'animés, couvertures | [AniList](https://anilist.co) |
| Musiques, noms d'animés, difficulté | [AnisongDB](https://anisongdb.com) |
| Fichiers audio | [Anime Music Quiz](https://animemusicquiz.com) |

Le site n'a pas de serveur : ta liste et ta progression restent **dans ton navigateur**. Seuls ton pseudo AniList (pour l'import) et les identifiants et titres des animés sont transmis à AniList et AnisongDB.

## Limites connues

- La progression est liée au navigateur : vider les données du site l'efface.
- Certains animés n'ont pas de musique dans AnisongDB, ou y sont enregistrés sous un autre nom ; ils sont listés sur l'écran de configuration.
- Connexion requise pour écouter les musiques.

## Crédits

Merci à AniList, AnisongDB et Anime Music Quiz, dont les données rendent ce site possible. Les musiques et les illustrations appartiennent à leurs ayants droit respectifs ; ce site est un projet personnel sans but commercial.

Réalisé avec React et Vite.

## Déploiement (GitHub Pages)

Le workflow `.github/workflows/deploy.yml` compile `amq-trainer/` et le publie à chaque push sur `main`. Une seule fois : *Settings → Pages → Build and deployment → Source : « GitHub Actions »*.
