# AMQ Trainer

Entraîne-toi pour [Anime Music Quiz](https://animemusicquiz.com) sur **ta propre liste d'animés** : le site te fait deviner les openings, endings et insert songs comme sur AMQ, retient ce que tu as raté et te le fait réviser jusqu'à ce que tu le connaisses, comme avec des flashcards.

**👉 Ouvrir le site** : `https://propleek.github.io/AMQ-Trainer/` 
Aucune installation, et le compte est facultatif : sans compte, tout se passe dans le navigateur ; avec Discord, ta progression te suit sur tous tes appareils.

## Fonctionnalités

- **Ta liste comme pool de musiques** : import par pseudo AniList, depuis un export XML MyAnimeList, ou **listes composées à la main** en cherchant des animés sur AniList.
- **Règles d'AMQ** : extrait lancé à un endroit aléatoire du morceau, temps de réponse limité, autocomplétion sur **tous les animés de la base**, réponse **stricte** (une autre saison du même animé est fausse ; nom romaji, anglais ou alternatif acceptés).
- **Trois modes de jeu** :
  - **Découverte** : découvre ta liste par paquets (100 musiques par défaut) au lieu de tout jouer d'un coup ; chaque musique jouée sort du pool de découverte.
  - **Révision** : rejoue tes musiques ratées, puis celles dont la révision est due.
  - **Test** : une partie comme sur AMQ, tirée parmi les musiques déjà vues, pour mesurer ton niveau.
- **Progression conservée** : chaque musique est *jamais vue*, *à réviser*, *à revoir* ou *connue* ; une partie abandonnée garde les réponses déjà données.
- **Répétition espacée** : chaque bonne réponse fait monter la musique d'une boîte (1 à 5) et repousse sa prochaine révision (1, 3, 7 puis 21 jours) ; une erreur la renvoie en boîte 1.
- **Statistiques** par liste : états des musiques, répartition par boîte, évolution des scores en Test, musiques les plus ratées.
- **Compte Discord (facultatif)** : ta progression, tes scores de Test et tes listes composées à la main sont synchronisés entre tes appareils.
- **Tableau de bord du compte** (clic sur ton avatar) : musiques connues, animés maîtrisés ou presque (80 % ou plus), état détaillé de la synchronisation.
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

Sans compte, ta liste et ta progression restent **dans ton navigateur**. Seuls ton pseudo AniList (pour l'import) et les identifiants et titres des animés sont transmis à AniList et AnisongDB.

Avec un compte, la connexion passe par Discord via [Supabase](https://supabase.com) : le site reçoit ton nom et ton avatar Discord, et enregistre ta progression (identifiants des musiques, compteurs, dates de révision), tes scores de Test et tes listes composées à la main (nom et animés).

## Limites connues

- Sans compte, la progression est liée au navigateur : vider les données du site l'efface.
- Après une déconnexion, la progression reste dans le navigateur ; un autre compte connecté ensuite sur ce même navigateur la récupérerait.
- Certains animés n'ont pas de musique dans AnisongDB, ou y sont enregistrés sous un autre nom ; ils sont listés sur l'écran de configuration.
- Connexion requise pour écouter les musiques.

## Crédits

Merci à AniList, AnisongDB et Anime Music Quiz, dont les données rendent ce site possible. Les musiques et les illustrations appartiennent à leurs ayants droit respectifs ; ce site est un projet personnel sans but commercial.

Réalisé avec React, Vite et Supabase.

## Déploiement (GitHub Pages)

Le workflow `.github/workflows/deploy.yml` compile `amq-trainer/` et le publie à chaque push sur `main`. Une seule fois :

1. *Settings → Pages → Build and deployment → Source : « GitHub Actions »*.
2. *Settings → Secrets and variables → Actions → Variables* : `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` (valeurs publiques ; sans elles, le site est compilé sans comptes).
3. Supabase : exécuter `supabase/schema.sql`, activer le fournisseur Discord et ajouter l'URL du site aux *Redirect URLs*.

Le workflow `keep-alive.yml` interroge la base tous les 3 jours pour éviter la mise en pause d'un projet Supabase gratuit.
