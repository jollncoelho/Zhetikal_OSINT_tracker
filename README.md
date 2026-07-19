# 🕵️‍♂️ Ghostint Tracker - Ultimate OSINT Hybrid Investigation Platform

Ghostint Tracker est une application web d'investigation et de cartographie OSINT de nouvelle génération. Conçue pour centraliser, visualiser et enrichir vos enquêtes, elle combine un graphe relationnel dynamique (React Flow), une cartographie mondiale synchronisée (React-Leaflet) et une double intelligence artificielle hybride (Locale & Avancée).

🎥 **Regarder le tutoriel vidéo complet sur YouTube :** [Ghostint Tracker - Nouvel outil ultime pour l'OSINT](https://www.youtube.com/watch?v=mQl5btUpOwc)

---

## ⚡ Caractéristiques Principales

* **Graphe d'Investigation Dynamique :** Ajoutez, connectez et manipulez vos entités (Emails, Noms, Domaines, Adresses IP, Téléphones, Photos, ASN, Hashs, Certificats SSL, Hostnames, TTP) de manière fluide.
* **Barre d'Actions Flottante (Hover) :** Une interface épurée où les boutons d'analyse (loupes, pivots) apparaissent uniquement au survol du nœud pour ne jamais chevaucher vos textes.
* **Entité Adresse Automatique :** Plus de bouton de correction fastidieux. Saisissez une adresse, le nœud se met à jour tout seul et se synchronise instantanément avec le module cartographique.
* **Ghostint Tools Intégré :** Accès direct en un clic à un catalogue centralisé de plus de 450 outils d'investigation OSINT externes (moteurs de recherche, réseaux sociaux, reverse image).
* **Sauvegarde & Rapports :** Exportez et importez vos graphiques au format JSON pour ne jamais perdre votre progression, ou générez des rapports visuels complets en PNG ou PDF.

---

## 🧠 Mode Hybride IA : Choisissez votre OPSEC

### 1. Mode 100% Local (Sécurité Maximale) 🔒
Propulsé par **Ollama**, ce mode fonctionne en isolation totale, sans connexion Internet. Vos données d'enquête restent strictement sur votre machine.
* **Modèle requis :** `gemma2:9b` (~9 Go).
* **Commande d'installation :** `ollama run gemma2:9b` (via PowerShell ou Terminal).

### 2. Mode Avancé (Puissance Augmentée via Agent Hermes) 🚀
Propulsé par l'agent autonome **Hermes (Nous Research)** via l'infrastructure **Nous Portal**. Ce mode permet à l'IA de requêter le web en temps réel pour dénicher des corrélations avancées et extraire de nouvelles entités. 

Pour assurer l'anonymat et le routage des requêtes de l'agent sans exposer le tracker, le système utilise un **couplage réseau par double console locale**.

---

## 🛠️ Installation et Prérequis

### Configuration de l'IA Locale (Ollama)
1. Téléchargez et installez Ollama depuis [ollama.com](https://ollama.com).
2. Lancez l'application (assurez-vous que l'icône de l'ossature / lama est présente dans la barre des tâches).
3. Ouvrez un terminal et récupérez le modèle :
   ```bash
   ollama run gemma2:9b
