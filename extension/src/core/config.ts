// Réglages techniques, volontairement absents des options.

/** Dépôt du projet, compte et nom. */
const REPO = "app-buildr/barrage";
export const REPO_URL = `https://github.com/${REPO}`;
/** Site public. */
export const SITE_URL = "https://app-buildr.github.io/barrage";
/** Adresse des demandes de retrait de la liste collaborative. */
export const CONTACT_EMAIL = "barrage.app@protonmail.com";
/** Compte X du projet, cité dans les textes de partage. */
export const X_ACCOUNT = "@BarrageApp";

/**
 * Délai entre deux blocages. X limite le nombre d'actions par compte et peut
 * restreindre un compte trop rapide : la valeur reste prudente.
 */
export const BLOCK_DELAY_MS = 8_000;

/** Variation aléatoire appliquée au délai, pour ne pas frapper à cadence fixe. */
export const DELAY_JITTER = 0.3;

/** Au-delà, un compte en échec n'est plus retenté sans action de l'utilisateur. */
export const MAX_ATTEMPTS = 3;

/** Attente par défaut quand X signale une limite sans dire jusqu'à quand. */
export const RATE_LIMIT_FALLBACK_MS = 15 * 60_000;

/**
 * Première pause après un soupçon d'automatisation (code 226 de X), doublée à
 * chaque rechute : c'est le signal le plus proche d'une restriction de compte.
 */
export const AUTOMATION_PAUSE_MS = 60 * 60_000;

/** Pause la plus longue, y compris quand X annonce une échéance plus lointaine. */
export const MAX_PAUSE_MS = 24 * 60 * 60_000;

/**
 * Comptes distincts refusés de suite par X avant d'arrêter le traitement : des
 * refus en série viennent de X, pas de ces comptes.
 */
export const MAX_CONSECUTIVE_FAILURES = 3;

/** Après un échec de vérification, délai avant de la retenter. */
export const CHECK_RETRY_MS = 15 * 60_000;

/** Attente après une coupure réseau. */
export const NETWORK_RETRY_MS = 60_000;

/** Une requête à X sans réponse au bout de ce délai est abandonnée, comme une coupure réseau. */
export const X_REQUEST_TIMEOUT_MS = 30_000;

/**
 * Une attente du traitement se découpe en tranches de cette durée : un script
 * orphelin, après un rechargement de l'extension, rend vite le verrou.
 */
export const SLEEP_SLICE_MS = 30_000;

/**
 * Après une erreur de session, délai avant de retenter avec la même session.
 * Un compte X verrouillé ou restreint garde son cookie : retenter à chaque
 * compte vu dans le fil le solliciterait au pire moment.
 */
export const AUTH_RETRY_MS = 60 * 60_000;

/**
 * Au-delà, la vérification « déjà bloqué ? » d'un compte est refaite avant de
 * le bloquer : l'utilisateur a pu le bloquer à la main entre-temps.
 */
export const CHECK_MAX_AGE_MS = 2 * 60_000;

/**
 * Un compte introuvable (suspendu, désactivé) qui réapparaît dans le fil est
 * retenté, mais pas avant ce délai : un compte suspendu un temps puis rétabli
 * finit bloqué, sans boucler sur une réponse de X qui ne changerait pas.
 */
export const NOT_FOUND_RETRY_MS = 24 * 60 * 60_000;

/**
 * Marge avant de considérer qu'aucun onglet ne traite la liste. Chrome ralentit
 * les minuteurs des onglets en arrière-plan jusqu'à une minute.
 */
export const RUNNER_GRACE_MS = 2 * 60_000;

/**
 * Regroupement des relectures de l'état : une rafale d'écritures ne provoque
 * qu'une lecture par onglet et par page d'options.
 */
export const STATE_COALESCE_MS = 100;

/** Comptes vérifiés par requête auprès de X, le maximum qu'accepte l'API. */
export const LOOKUP_BATCH = 100;

/**
 * Délai entre deux paquets de la vérification d'un compte X (voir
 * State.audit). X limite cette requête à une quinzaine par quart d'heure :
 * un peu moins d'une par minute laisse de la marge aux vérifications faites
 * avant un blocage.
 */
export const AUDIT_INTERVAL_MS = 70_000;

// Liste collaborative, publiée sur GitHub (dossier lists/ du dépôt, un fichier par réseau).

/**
 * Dossier en ligne des listes, sans barre finale, par exemple
 * "https://raw.githubusercontent.com/<compte>/<dépôt>/main/lists". Vide : pas de
 * téléchargement, seule la liste intégrée à l'extension sert.
 */
export const LISTS_URL = `https://raw.githubusercontent.com/${REPO}/main/lists`;
/** Intervalle entre deux téléchargements. */
export const LISTS_REFRESH_MINUTES = 6 * 60;
/** À l'ouverture des options, une vérification plus récente que ce délai n'est pas refaite. */
export const LISTS_RECHECK_MS = 10 * 60_000;
/** Au-delà, une liste reçue est jugée anormale et ignorée. */
export const LIST_MAX_SIZE = 5000;
/** Seuls hôtes acceptés pour une liste importée : ils répondent avec CORS ouvert, sans nouvelle permission. */
export const LIST_HOSTS: readonly string[] = ["raw.githubusercontent.com", "gist.githubusercontent.com"];
/** Extensions acceptées pour un fichier local. */
export const LIST_FILE_EXTENSIONS: readonly string[] = [".txt", ".csv"];
/** Taille maximale d'une liste importée, fichier ou adresse. */
export const LIST_MAX_BYTES = 1_000_000;
/** Au-delà de cette part d'entrées invalides, l'aperçu d'un import met en garde. */
export const IMPORT_MAX_INVALID_SHARE = 0.1;
/** Comptes montrés dans l'aperçu d'un import. */
export const IMPORT_PREVIEW_SIZE = 20;
/** Longueur maximale du nom d'une liste. */
export const LIST_NAME_MAX = 40;
/**
 * Part maximale de comptes retirés d'une liste en ligne, par rapport à sa
 * référence (voir LIST_BASELINE_MS). Au-delà, la liste reçue est mise de côté
 * jusqu'à confirmation dans les options.
 */
export const LIST_MAX_REMOVED_SHARE = 0.1;
/**
 * Part maximale de comptes ajoutés, sur la même base. Le plus gros ajout connu
 * de la liste collaborative est de 14 %.
 */
export const LIST_MAX_ADDED_SHARE = 0.25;
/** En dessous de ce nombre de comptes, un ajout ou un retrait passe toujours : une petite liste change vite en proportion. */
export const LIST_GUARD_FLOOR = 5;
/**
 * Durée de vie de la référence à laquelle les seuils se comparent. Comparer à
 * la dernière liste acceptée laisserait passer des retraits enchaînés, chacun
 * sous le seuil ; une référence stable limite le cumul sur cette durée.
 */
export const LIST_BASELINE_MS = 7 * 24 * 60 * 60_000;
/**
 * Délai avant de débloquer un compte retiré de la liste collaborative : un
 * retrait par erreur, corrigé entre-temps, ne débloque personne.
 */
export const RETIRE_GRACE_MS = 72 * 60 * 60_000;

// Mises à jour : Barrage est chargé en mode développeur, sans mise à jour
// automatique. La dernière version publiée sur GitHub est relevée en même
// temps que les listes, pour signaler qu'il faut mettre à jour.

/** Dernière version publiée de l'extension. Vide : pas de vérification. */
export const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
/** Guide de mise à jour, lien du bandeau des options. */
export const UPDATE_GUIDE_URL = `${SITE_URL}/#mise-a-jour`;
