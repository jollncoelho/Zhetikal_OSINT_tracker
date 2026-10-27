⭐ If you find Ghostint Tracker useful, please give it a star on GitHub!

# 🕵️‍♂️ Ghostint Tracker - Ultimate OSINT Hybrid Investigation Platform

Ghostint Tracker est une application web d'investigation et de cartographie OSINT de nouvelle génération. Conçue pour centraliser, visualiser et enrichir vos enquêtes, elle combine un graphe relationnel dynamique (React Flow), une cartographie mondiale synchronisée (React-Leaflet) et une double intelligence artificielle hybride (Locale & Avancée).

🎥 **Regarder le tutoriel vidéo complet sur YouTube :** [Ghostint Tracker - Nouvel outil ultime pour l'OSINT](https://www.youtube.com/watch?v=mQl5btUpOwc)

---<img width="1920" height="963" alt="image" src="https://github.com/user-attachments/assets/b48e8882-5c77-4733-afcc-e19ec9385e4d" />

<img width="1920" height="963" alt="image" src="https://github.com/user-attachments/assets/4e016523-26c7-4712-ab1e-b7fad19176e4" />

## ⚡ Caractéristiques Principales

- **Graphe d'Investigation Dynamique :** Ajoutez, connectez et manipulez vos entités (Emails, Noms, Domaines, Adresses IP, Téléphones, Photos) de manière fluide.
- **Cartographie Mondiale Synchronisée :** Localisez instantanément vos cibles sur une carte interactive grâce à un outil de géocodage intégré.
- **Bouton de Correction d'Adresse :** Un outil intelligent pour redresser à la volée les titres d'entités "location" et envoyer l'adresse propre directement au module de cartographie.
- **Ghostint Tools Intégré :** Accès direct en un clic à un catalogue centralisé de plus de 450 outils d'investigation OSINT externes (moteurs de recherche, réseaux sociaux, reverse image).
- **Module d'Enquête & Navigateur Intégré :** Créez des dossiers, capturez des pages web (HTML complet, texte, métadonnées, liens, images) et explorez-les directement dans l'application, sans jamais quitter l'outil.
- **Sauvegarde & Rapports :** Exportez et importez vos graphiques au format JSON pour ne jamais perdre votre progression, ou générez des rapports visuels complets en PNG ou PDF.

---

## 🗂️ Module d'Enquête, Capture Locale & Navigateur

Le module **Cas** (onglet « Cas ») permet de créer des dossiers d'enquête et d'y verser des preuves horodatées et hachées (SHA-512).

### Moteur de capture 100 % local

La capture de pages ne dépend d'**aucun service tiers**. Un petit moteur embarqué (`vite-plugin-local-capture.ts`) est servi par le serveur de développement sur `POST /api/capture`. Il récupère la page côté machine, puis extrait :

| Donnée               | Détail                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| **HTML complet**     | Document brut (plafonné à 3 Mo), conservé comme pièce à conviction                                  |
| **Texte de la page** | Chaque ligne visible, dans l'ordre de lecture, avec recherche et copie                              |
| **Métadonnées**      | Toutes les balises `<meta>` (description, OpenGraph, Twitter Card…), `canonical`, `lang`, `charset` |
| **Liens**            | Tous les `<a href>` résolus en URL absolues                                                         |
| **Images**           | Toutes les `<img src>` / `<source src>` détectées                                                   |
| **Empreinte**        | Statut HTTP, Content-Type, taille, durée de capture, redirections, digest SHA-512                   |

> ℹ️ Le moteur fonctionne dans `npm run dev` **et** dans `npm run preview`. Si vous déployez le dossier `dist/` sur un hébergeur statique sans le plugin, la capture locale est indisponible : la preuve est alors tout de même enregistrée (URL, horodatage, empreinte) et vous pouvez y joindre une capture d'écran manuelle.

### Onglet « Navigateur »

Chaque dossier dispose de deux vues : **Preuves** (la table des éléments collectés) et **Navigateur**.

Le navigateur d'enquête permet de :

1. Saisir une URL (ou une recherche — une URL non reconnue part vers DuckDuckGo).
2. Charger la page en local et l'explorer via six onglets : **Aperçu** (rendu local, scripts neutralisés), **Texte**, **HTML**, **Métadonnées**, **Liens**, **Images**.
3. **Ajouter comme preuve** : l'ensemble (HTML + texte + métadonnées + liens + images) est archivé dans le dossier actif.
4. **Capture d'écran** : capture l'écran via l'API navigateur (`getDisplayMedia`) et joint l'image à la preuve — entièrement local.
5. Accéder aux **liens OSINT** contextuels du domaine courant : Google, Bing, DuckDuckGo, Wayback Machine, urlscan.io, crt.sh, Who.is, VirusTotal.
6. Naviguer avec historique (précédent / suivant / recharger).

### Outil de capture d'écran (barre supérieure)

Le bouton **Capture d'écran** de la barre supérieure ouvre une sélection de zone à l'écran, recadre le résultat et l'attache au dossier actif comme preuve de type *Screenshot*.

### Preuves : relecture et mise à jour

Dans le détail d'une preuve, les onglets **Aperçu / Texte / HTML / Liens / Métadonnées** donnent accès à tout ce qui a été collecté. Le bouton **Relancer la capture** réinterroge la cible et rafraîchit le HTML, le texte, les liens et les images sans perdre l'historique ni l'empreinte d'origine. Le bouton **Joindre une image** ajoute une capture manuelle.

<img width="1920" height="963" alt="image" src="https://github.com/user-attachments/assets/7140568a-2a19-490f-9442-a6844108db53" />

<img width="1920" height="963" alt="image" src="https://github.com/user-attachments/assets/64964228-fe9f-4fff-81b1-5c1e701ed4ea" />


## 🧠 Mode Hybride IA : Choisissez votre OPSEC

### 1. Mode 100% Local (Sécurité Maximale) 🔒

Propulsé par **Ollama**, ce mode fonctionne en isolation totale, sans connexion Internet. Vos données d'enquête restent strictement sur votre machine.

- **Modèle requis :** `gemma2:9b` (~9 Go).
- **Commande d'installation :** `ollama run gemma2:9b` (via PowerShell ou Terminal).


### 2. Mode Avancé (Puissance Augmentée) 🚀

Propulsé par **FreeLLMAPI** ([freellmapi.co](https://freellmapi.co)), un routeur open-source qui agrège les paliers gratuits de dizaines de fournisseurs derrière un seul endpoint compatible OpenAI.

> ⚠️ **Important : FreeLLMAPI n'est pas un service hébergé.** `freellmapi.co` est le site vitrine : il ne fournit pas d'API d'inférence. Vous devez faire tourner le routeur vous-même (application de bureau Windows, Docker ou Node.js), puis renseigner son adresse dans le champ **URL de base** de la barre d'analyse (l'application de bureau écoute sur `http://127.0.0.1:31415/v1`, c'est la valeur par défaut du champ ; un routeur Docker/Node autonome utilise `http://localhost:3001/v1`), avec la clé API créée dans le tableau de bord du routeur.

Renseignez la **clé API**, l'**URL de base** de votre routeur et le **modèle** souhaité directement dans la barre d'analyse pour enrichir votre dossier avec des suggestions d'entités avancées à injecter.

#### Mettre en route le routeur FreeLLMAPI

1. **Option la plus simple (Windows)** — téléchargez l'installateur `.exe` depuis les [releases GitHub](https://github.com/tashfeenahmed/freellmapi/releases) et lancez-le.
2. **Docker** — `docker compose up -d` depuis le dépôt (l'API est exposée sur le port `3001`).
3. **Node.js (>= 20.18)** — clonez le dépôt, puis `npm install` et `npm run start`.
4. Ajoutez vos clés de fournisseurs gratuits dans le tableau de bord du routeur.
5. Récupérez l'**URL de base** et la **clé** à utiliser :
   - **Application de bureau** : ouvrez la section **« Keys »** (ou l'écran **« Connect your app »**), puis cliquez sur **« Copy base URL »** (adresse du type `http://127.0.0.1:31415/v1`) et sur **« Copy API key »** pour récupérer la **Unified key**. C'est cette clé — et non une clé de fournisseur — qu'il faut coller dans Ghostint Tracker.
   - **Routeur auto-hébergé** : l'URL de base est `http://localhost:3001/v1`.
6. Dans Ghostint Tracker, sélectionnez **Avancé (FreeLLMAPI)**, collez l'URL de base et la clé, puis vérifiez que le voyant passe au vert.

> 💡 L'URL de base doit se terminer par **`/v1`**. Sans le `/v1`, le routeur renvoie la page HTML de son interface web, ce qui provoque une erreur JSON.

#### ⚠️ Ouvrir Ghostint Tracker depuis un site hébergé (`https://…`) — les deux autorisations

**Symptôme :** le mode Avancé affiche « **FreeLLMAPI est injoignable** » alors que le routeur tourne et répond (`curl` fonctionne). Le voyant reste rouge.

Depuis un site hébergé, **deux verrous indépendants** peuvent bloquer l'accès à un backend local — Ollama **comme** FreeLLMAPI. Les deux se règlent une seule fois, **sur la machine de l'utilisateur**.

##### Verrou 1 — l'autorisation du navigateur (« Local Network Access »)

Chrome 138 et suivants interdisent à une page servie en `https://` de joindre `127.0.0.1` sans l'accord explicite de l'utilisateur. Sans cet accord, la requête échoue **avant même de partir** :

```
Access to fetch at 'http://127.0.0.1:31415/…' from origin 'https://…'
has been blocked by CORS policy: Permission was denied for this request
to access the `loopback` address space.
```

→ À la première analyse, Chrome demande **« Accéder aux appareils de votre réseau local ? »** : répondez **Autoriser**. Le réglage se modifie ensuite dans `chrome://settings/content/localNetworkAccess`.

> ⚠️ Ce verrou frappe **aussi Ollama**. Si Ollama semblait fonctionner, c'est qu'il était testé avec un navigateur plus ancien — avec Chrome 155, les deux sont concernés.

##### Si le navigateur ne demande jamais rien (cas de Comet)

Certains navigateurs à base de Chromium **n'affichent pas l'invite** : la requête est refusée en silence, et le message parle d'`unknown` au lieu de `loopback` — signe que le verrou est bien là mais qu'aucune fenêtre ne s'ouvrira jamais :

```
has been blocked by CORS policy: Permission was denied for this request
to access the `unknown` address space.
```

**Comet 143** est dans ce cas. Le réglage existe pourtant, il faut simplement **autoriser le site à la main**. C'est un réglage unique, et **il survit aux redémarrages du navigateur** :

1. Paramètres → **Confidentialité et sécurité** → **Accès au réseau local**
   (ou `chrome://settings/content/localNetworkAccess`) ;
2. dans **« Autorisés à se connecter à n'importe quel appareil sur votre réseau local »**, cliquez **Ajouter** ;
3. collez l'origine **exacte** de la page, par exemple `https://tracker.query-intel.com`.

Vérifié en pilotant Comet : avec ce réglage, la requête atteint le routeur (`401` sans clé, `200` avec), et cela **tient après redémarrage**.

> À l'inverse, **Brave 155 n'applique pas ce verrou** : la requête de bouclage passe directement. Le navigateur change donc le résultat — si l'IA marche dans l'un et pas dans l'autre, c'est exactement ici qu'il faut regarder.

##### Verrou 2 — la liste blanche du routeur FreeLLMAPI

Le routeur applique une **liste blanche d'origines CORS**. Par défaut, cette liste ne contient que les ports de développement :

```
http://localhost:5173   http://127.0.0.1:5173   http://[::1]:5173
```

Quand la page qui appelle le routeur ne fait pas partie de cette liste, le routeur **n'envoie aucun en-tête `Access-Control-Allow-Origin`** et le navigateur jette la réponse. JavaScript ne voit alors qu'une erreur réseau générique — d'où le message trompeur « injoignable ». C'est pour cela que tout marchait en `npm run dev` (port 5173 autorisé) et que rien ne passait depuis `https://tracker.prohacking77.me`.

**Correction :** déclarez l'origine de votre site dans la variable d'environnement `DASHBOARD_ORIGINS`, puis **relancez le routeur** (la variable n'est lue qu'au démarrage).

```bash
# Windows (PowerShell ou cmd) — persistant, vaut pour tous les lancements suivants
setx DASHBOARD_ORIGINS "https://tracker.prohacking77.me"

# macOS / Linux — avant de lancer le routeur
export DASHBOARD_ORIGINS="https://tracker.prohacking77.me"
```

Plusieurs origines se séparent par des virgules : `"https://tracker.prohacking77.me,https://www.prohacking77.me"`.

Ensuite, **quittez complètement FreeLLMAPI** (icône de la zone de notification → *Quit*, pas seulement fermer la fenêtre) et relancez-le. Vérification :

```bash
curl -i -X OPTIONS http://127.0.0.1:31415/v1/chat/completions \
  -H "Origin: https://tracker.prohacking77.me" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,authorization"
```

La réponse doit contenir `Access-Control-Allow-Origin: https://tracker.prohacking77.me`. Si cet en-tête est absent, le navigateur bloquera — quoi que fasse l'application.

> ℹ️ Cette variable se règle **sur la machine de chaque utilisateur**, pas sur le serveur qui héberge l'application : c'est le navigateur du visiteur qui contrôle l'accès à son propre routeur local. Pensez à mentionner **les deux verrous** dans le tutoriel vidéo — l'autorisation « réseau local » de Chrome d'abord, `DASHBOARD_ORIGINS` ensuite.
>
> 💡 **Aucune de ces deux étapes n'est nécessaire avec un fournisseur hébergé.** Le panneau Avancé accepte n'importe quelle URL compatible OpenAI : `https://openrouter.ai/api/v1`, `https://api.groq.com/openai/v1`, `https://api.deepseek.com/v1`, `https://api.mistral.ai/v1`, `https://api.together.xyz/v1`… Ces services renvoient des en-têtes CORS corrects, donc l'appel fonctionne depuis le site public **sans rien installer**. C'est le modèle « je colle une clé et ça marche », celui d'Hermes à l'époque.

#### Mode Auto (recommandé)

Par défaut, Ghostint Tracker n'envoie **aucun nom de modèle** : le routeur choisit lui-même lequel utiliser et **bascule automatiquement** vers le suivant lorsqu'un quota gratuit est épuisé (mécanisme de « Fallback Chain » de FreeLLMAPI). Vous n'avez donc rien à connaître des noms de modèles, et l'analyse ne casse pas quand un fournisseur atteint sa limite.

Pour que cela fonctionne, l'application FreeLLMAPI doit avoir au moins une clé de fournisseur et une Fallback Chain configurée. Si vous préférez forcer un modèle précis, décochez **Auto** puis utilisez le bouton **« Charger les modèles »** pour lister ceux réellement disponibles avec votre clé.

#### Quelle(s) application(s) laisser ouverte(s) ?

Seule l'**application de bureau FreeLLMAPI** doit tourner en arrière-plan : c'est elle qui héberge le routeur (`http://127.0.0.1:31415/v1`). **Hermes n'est pas nécessaire** — c'est un simple client parmi ceux que l'app sait configurer (comme Cursor ou Crush), pas un composant du routeur. Ollama n'est requis que pour le mode « Local ».

> 🔒 **OPSEC — à lire avant de traiter un dossier sensible**
>   
> Le mode Avancé **n'est pas local**. Le routeur tourne bien sur votre machine, mais il **transmet vos entités d'enquête par Internet** aux fournisseurs gratuits qu'il agrège (Google, Groq, NVIDIA, OpenRouter, DeepSeek…). Seul le mode **Local (Ollama)** garantit qu'aucune donnée ne quitte votre poste.
>
> Le stockage (cas, graphe, preuves) reste local dans tous les cas. Un avertissement permanent s'affiche dans la barre d'analyse et dans le panneau de configuration dès que le mode Avancé est actif.

---

## 🛠️ Installation et Prérequis

### Côté IA Locale (Ollama)

1. Téléchargez et installez Ollama depuis [ollama.com](https://ollama.com).
2. Lancez l'application (assurez-vous que l'icône de l'ossature / lama est bien présente dans votre barre des tâches).
3. Ouvrez un terminal et récupérez le modèle :
   ```bash
   ollama run gemma2:9b
   ```
