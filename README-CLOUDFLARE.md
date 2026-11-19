# IPTV Reader — migration Cloudflare Pages

Cette version est préparée pour Cloudflare Pages + Pages Functions. Elle n'utilise pas Vercel, le Media Gateway ni Docker. Elle n'embarque pas de service FFmpeg : les Cloudflare Containers qui pourraient héberger un transcodeur relèvent du plan Workers Paid, pas de l'offre gratuite Pages/Workers Free.

## Contenu
- `public/` : interface statique.
- `functions/api/` : API Cloudflare Pages (`/api/session`, `/api/xtream`, `/api/stream`, `/api/image`).
- `lib/session.js` : cookie de session chiffré AES-GCM, HttpOnly, Secure, SameSite=Lax, renouvelé par activité et expirant après 20 minutes sans activité.

## Déploiement navigateur uniquement
1. Extraire le ZIP avec l'Explorateur Windows (fonction intégrée).
2. Créer un dépôt GitHub privé, par exemple `iptv-reader-cloudflare`.
3. Dans GitHub > Add file > Upload files, ouvrir le dossier extrait `iptv-reader-cloudflare` et téléverser son CONTENU en conservant `public`, `functions` et `lib` à la racine du dépôt, puis Commit changes. Ne pas téléverser seulement le ZIP.
4. Dans Cloudflare Dashboard > Workers & Pages > Create application > Pages > Connect to Git.
5. Connecter GitHub et choisir le dépôt.
6. Configuration : Framework preset `None`; Build command `exit 0`; Build output directory `public`; Root directory `/`. Utiliser Git integration : le Direct Upload par glisser-déposer du tableau de bord ne compile pas le dossier `functions`.
7. Déployer.
8. Dans le projet Pages > Settings > Variables and Secrets, ajouter une variable secrète `SESSION_SECRET` contenant une valeur aléatoire d'au moins 32 caractères. Ne pas la mettre dans le dépôt ni dans le code. Redéployer après l'ajout.
9. Ouvrir l'URL `https://<projet>.pages.dev` et se connecter avec les identifiants Xtream.

## Limites fonctionnelles importantes
- Cette édition Pages/Workers Free ne fait aucun transcodage FFmpeg. Les Cloudflare Containers sont facturés dans le cadre du plan Workers Paid (à partir de 5 USD/mois, avec des quotas inclus et des coûts supplémentaires possibles).
- Les flux HLS (`.m3u8`) et les médias déjà compatibles avec le navigateur peuvent être relayés. Un flux dont le codec vidéo n'est pas décodable par le navigateur restera sans image; il faudra un flux compatible fourni par Xtream ou un service de transcodage externe.
- Le proxy HLS réécrit les segments du même domaine/origine que le serveur Xtream. Les playlists dont les segments sont servis par un autre domaine peuvent nécessiter une adaptation.
- Les appels API et les segments vidéo consomment le quota Workers. Le plan gratuit a une limite de 100 000 requêtes Worker par jour et 10 ms CPU par requête (vérifier les limites Cloudflare au moment du d��ploiement).
- Le serveur Xtream en HTTP reste non chiffré entre Cloudflare et le fournisseur : le mot de passe et les flux peuvent être observés sur ce trajet. Utiliser HTTPS côté fournisseur si disponible.
- Utiliser uniquement des accès et contenus auxquels vous êtes autorisé.

## Sécurité
- `SESSION_SECRET` est obligatoire. Sans lui, l'API de session refuse de fonctionner.
- Les identifiants ne sont plus placés dans les URL du navigateur ni stockés dans localStorage; ils sont conservés dans un cookie chiffré HttpOnly et Secure.
- Le cookie expire après 20 minutes sans activité. Les interactions et la lecture active renouvellent la session.
- Les URLs locales/privées sont rejetées par le proxy. Les playlists HLS qui pointent vers une origine différente sont refusées/non réécrites.
