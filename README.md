 ⭐ If you find Ghostint Tracker useful, please give it a star on GitHub!
# 🕵️‍♂️ Ghostint Tracker - Ultimate OSINT Hybrid Investigation Platform

Ghostint Tracker est une application web d'investigation et de cartographie OSINT de nouvelle génération. Conçue pour centraliser, visualiser et enrichir vos enquêtes, elle combine un graphe relationnel dynamique (React Flow), une cartographie mondiale synchronisée (React-Leaflet) et une double intelligence artificielle hybride (Locale & Avancée).

🎥 **Regarder le tutoriel vidéo complet sur YouTube :** [Ghostint Tracker - Nouvel outil ultime pour l'OSINT](https://www.youtube.com/watch?v=mQl5btUpOwc)

---

## ⚡ Caractéristiques Principales

* **Graphe d'Investigation Dynamique :** Ajoutez, connectez et manipulez vos entités (Emails, Noms, Domaines, Adresses IP, Téléphones, Photos) de manière fluide.
* **Cartographie Mondiale Synchronisée :** Localisez instantanément vos cibles sur une carte interactive grâce à un outil de géocodage intégré.
* **Bouton de Correction d'Adresse :** Un outil intelligent pour redresser à la volée les titres d'entités "location" et envoyer l'adresse propre directement au module de cartographie.
* **Ghostint Tools Intégré :** Accès direct en un clic à un catalogue centralisé de plus de 450 outils d'investigation OSINT externes (moteurs de recherche, réseaux sociaux, reverse image).
* **Module d'Enquête & Navigateur Intégré :** Créez des dossiers, capturez des pages web (HTML complet, texte, métadonnées, liens, images) et explorez-les directement dans l'application, sans jamais quitter l'outil.
* **Sauvegarde & Rapports :** Exportez et importez vos graphiques au format JSON pour ne jamais perdre votre progression, ou générez des rapports visuels complets en PNG ou PDF.

---

## 🗂️ Module d'Enquête, Capture Locale & Navigateur

Le module **Cas** (onglet « Cas ») permet de créer des dossiers d'enquête et d'y verser des preuves horodatées et hachées (SHA-512).

### Moteur de capture 100 % local
La capture de pages ne dépend d'**aucun service tiers**. Un petit moteur embarqué (`vite-plugin-local-capture.ts`) est servi par le serveur de développement sur `POST /api/capture`. Il récupère la page côté machine, puis extrait :

| Donnée | Détail |
| --- | --- |
| **HTML complet** | Document brut (plafonné à 3 Mo), conservé comme pièce à conviction |
| **Texte de la page** | Chaque ligne visible, dans l'ordre de lecture, avec recherche et copie |
| **Métadonnées** | Toutes les balises `<meta>` (description, OpenGraph, Twitter Card…), `canonical`, `lang`, `charset` |
| **Liens** | Tous les `<a href>` résolus en URL absolues |
| **Images** | Toutes les `<img src>` / `<source src>` détectées |
| **Empreinte** | Statut HTTP, Content-Type, taille, durée de capture, redirections, digest SHA-512 |

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

---

## 🧠 Mode Hybride IA : Choisissez votre OPSEC

### 1. Mode 100% Local (Sécurité Maximale) 🔒
Propulsé par **Ollama**, ce mode fonctionne en isolation totale, sans connexion Internet. Vos données d'enquête restent strictement sur votre machine.
* **Modèle requis :** `gemma2:9b` (~9 Go).
* **Commande d'installation :** `ollama run gemma2:9b` (via PowerShell ou Terminal).

### 2. Mode Avancé (Puissance Augmentée) 🚀
Propulsé par **FreeLLMAPI** ([freellmapi.co](https://freellmapi.co)), un routeur open-source qui agrège les paliers gratuits de dizaines de fournisseurs derrière un seul endpoint compatible OpenAI.

> ⚠️ **Important : FreeLLMAPI n'est pas un service hébergé.** `freellmapi.co` est le site vitrine : il ne fournit pas d'API d'inférence. Vous devez faire tourner le routeur vous-même (application de bureau Windows, Docker ou Node.js), puis renseigner son adresse dans le champ **URL de base** de la barre d'analyse (par défaut `http://localhost:3001/v1`), avec la clé API créée dans le tableau de bord du routeur.

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

#### Mode Auto (recommandé)
Par défaut, Ghostint Tracker n'envoie **aucun nom de modèle** : le routeur choisit lui-même lequel utiliser et **bascule automatiquement** vers le suivant lorsqu'un quota gratuit est épuisé (mécanisme de « Fallback Chain » de FreeLLMAPI). Vous n'avez donc rien à connaître des noms de modèles, et l'analyse ne casse pas quand un fournisseur atteint sa limite.

Pour que cela fonctionne, l'application FreeLLMAPI doit avoir au moins une clé de fournisseur et une Fallback Chain configurée. Si vous préférez forcer un modèle précis, décochez **Auto** puis utilisez le bouton **« Charger les modèles »** pour lister ceux réellement disponibles avec votre clé.

#### Quelle(s) application(s) laisser ouverte(s) ?
Seule l'**application de bureau FreeLLMAPI** doit tourner en arrière-plan : c'est elle qui héberge le routeur (`http://127.0.0.1:31415/v1`). **Hermes n'est pas nécessaire** — c'est un simple client parmi ceux que l'app sait configurer (comme Cursor ou Crush), pas un composant du routeur. Ollama n'est requis que pour le mode « Local ».

> 🔒 **OPSEC — à lire avant de traiter un dossier sensible**
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
