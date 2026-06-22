# 🛡️ Zhétical OSINT Case Tracker v2.0

Lien vers l'outil en ligne : [https://tracker.prohacking77.me](https://tracker.prohacking77.me)

## 🔍 À propos
Le **Zhétical OSINT Tracker** est un outil d'investigation numérique conçu pour aider les enquêteurs à structurer leurs recherches. Il permet de créer des graphes de liens interactifs entre différentes entités (Usernames, IP, Domaines, etc.) tout en garantissant une confidentialité totale.

# Ghostint Tracker v2 - Plateforme d'Investigation OSINT 🕵️‍♂️🛡️

Ghostint Tracker est un outil complet de cartographie et d'analyse d'investigation numérique (OSINT). 

L'application est **hybride** : la majeure partie des fonctionnalités de cartographie, de pivot et de géolocalisation fonctionne instantanément au clic (sans rien installer). Seul le module d'analyse automatique textuelle nécessite l'activation d'une IA locale.

---

## ⚡ Utilisation Immédiate (Sans installation requise)

Dès l'ouverture du lien de l'application, les fonctionnalités suivantes sont **100 % opérationnelles et prêtes à l'emploi** :

* **Cartographie Dynamique :** Création, liaison et structuration des nœuds d'investigation à la main.
* **Pivot Géographique 🗺️ :** Un simple double-clic sur un nœud de type "Lieu" ou contenant une adresse ouvre instantanément **Google Maps** dans un nouvel onglet.
* **Audit d'Infrastructure IP 🌐 :** Un clic sur un nœud "Adresse IP" ouvre automatiquement une plateforme d'analyse externe (ex: IPinfo / Criminal IP) pour localiser l'hébergeur et le pays de l'IP.
* **Navigation Web :** Les nœuds de type URL ou Réseaux Sociaux intègrent un bouton "Open Link" pour visiter directement la cible.
* **Extraction Locale Basique :** Copie et survol à la souris des entités découvertes (textes complets sans coupure `...` pour les e-mails et les **IBAN**).

---

## 🧠 Activation de l'Analyse Automatique par IA (Optionnel)

Si vous souhaitez utiliser le bouton d'analyse automatique 🧬 pour extraire intelligemment des données textuelles complexes, vous devez coupler l'application à votre environnement local :

### Prérequis
1. **Ollama** installé sur votre machine -> [Télécharger Ollama](https://ollama.com/)
2. Télécharger le modèle de votre choix dans votre terminal :
   ```bash
   ollama run gemma
