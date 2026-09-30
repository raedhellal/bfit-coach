import { endSentence, type Copy } from "./copy";
import { formatKcal } from "./format";

/**
 * EV-324 — the FRENCH dictionary. Same keys, same argument lists, different words.
 *
 * Read `src/lib/copy.ts` for WHY each sentence says what it says (and what it
 * deliberately does not say): every rationale there applies here, and repeating 1,500
 * lines of it would give two copies of each reason to drift. Where the French needed a
 * decision of its own, it is noted beside the key.
 *
 * `satisfies Copy` is AC4: a key missing here, or one that English does not have, fails
 * `tsc`. The enum-label maps (`Record<string, string>`) escape that check, so
 * `qa/coach-i18n.spec.ts` compares the two dictionaries' key sets at run time as well.
 *
 * House style, matching b-fit-mobile's `fr.json`:
 *   · "vous", professional; the person coached is "le client" (the demo script's word).
 *   · séance, programme, recette, semaine, repas, objectifs, pesée.
 *   · Quotes around a coach's or trainee's text are « guillemets » with no-break spaces
 *     (`q`); apostrophes are straight, as in the app.
 *   · French plural: 0 and 1 are singular (`s`).
 *   · Numbers inside a sentence go through `formatKcal(…, "fr")` so 1450 reads "1 450"
 *     (AC3). English sentences print the raw number, exactly as before (AC2).
 *   · A weekday embedded in a sentence is lower-cased ("le lundi"); `formatWeekday`
 *     returns the capitalised label for headings.
 *
 * Not translated, by design: "Evoli Pro", "Evoli Fit", "Evoli Fit Lite", people's names,
 * coach-authored text and anything the api serves as text (see the merge record).
 */

/** « text » with no-break spaces inside the guillemets. */
const q = (text: string) => `«\u00a0${text}\u00a0»`;
/** French plural suffix: 0 and 1 take the singular. */
const s = (n: number) => (n < 2 ? "" : "s");
/** A number inside a French sentence, grouped the French way. */
const n = (value: number) => formatKcal(value, "fr");

export const fr = {
  locale: "fr",
  brand: "Evoli Pro",
  tagline: "Le back-office des coachs pour Evoli Fit.",

  login: {
    title: "Connexion",
    subtitle: "Accès coach à Evoli Pro.",
    email: "E-mail",
    emailPlaceholder: "vous@exemple.com",
    password: "Mot de passe",
    passwordPlaceholder: "••••••••",
    submit: "Se connecter",
    submitting: "Connexion…",
    notACoach: "Ce compte n'est pas un compte coach Evoli Pro",
    invalidCredentials: "E-mail ou mot de passe incorrect.",
    rateLimited: "Trop de tentatives. Patientez quelques secondes et réessayez.",
    mfaUnsupported:
      "Ce compte utilise la double authentification, qu'Evoli Pro ne prend pas encore en charge.",
    unavailable: "Impossible de joindre le serveur. Vérifiez que l'API est démarrée.",
    signedOut: "Votre session a été fermée.",
    pendingTrainee:
      "Ce compte n'est pas un compte coach Evoli Pro. Terminez sa configuration dans l'app Evoli Fit.",
    notInitialised:
      "Nous ne pouvons pas finaliser ce compte ici. Écrivez à support@evoli.fit et nous réglerons cela.",
  },

  activate: {
    title: "Finalisez votre compte",
    setUpBy: (initialiser: string) => `${initialiser} a créé ce compte Evoli Pro pour vous.`,
    finishBy: (when: string) =>
      `Finalisez-le avant le ${when}. Passé ce délai, le compte sera supprimé.`,
    temporaryPassword: "Mot de passe temporaire",
    temporaryHint: "Celui de l'e-mail d'invitation.",
    newPassword: "Nouveau mot de passe",
    newHint: "8 caractères minimum.",
    repeatPassword: "Confirmez le nouveau mot de passe",
    mismatch: "Les deux nouveaux mots de passe ne correspondent pas.",
    consent: "J'accepte les Conditions d'utilisation et la Politique de confidentialité.",
    termsLink: (version: string) => `Conditions d'utilisation (version ${version})`,
    privacyLink: (version: string) => `Politique de confidentialité (version ${version})`,
    readBefore: "Lisez-les avant d'accepter :",
    submit: "Finaliser mon compte",
    submitting: "Finalisation…",
    temporaryInvalid:
      "Ce mot de passe temporaire est incorrect. Vérifiez l'e-mail que nous vous avons envoyé.",
    temporaryReused: "Choisissez un nouveau mot de passe, différent du mot de passe temporaire.",
    rateLimited: (minutes: number) =>
      `Trop de tentatives. Réessayez dans ${minutes} ${minutes < 2 ? "minute" : "minutes"}.`,
    rateLimitedNoWait: "Trop de tentatives. Patientez quelques minutes et réessayez.",
    consentRequired:
      "Veuillez accepter les Conditions d'utilisation et la Politique de confidentialité pour finaliser votre compte.",
    consentUpdated:
      "Nos Conditions d'utilisation ou notre Politique de confidentialité ont changé. Veuillez les relire et accepter la nouvelle version.",
    consentReload:
      "Nos Conditions d'utilisation ou notre Politique de confidentialité ont changé. Rechargez cette page pour voir la nouvelle version.",
    validation: "Votre nouveau mot de passe doit contenir de 8 à 128 caractères.",
    blank: "Votre nouveau mot de passe ne peut pas être composé uniquement d'espaces.",
    notInitialised:
      "Nous ne pouvons pas finaliser ce compte ici. Écrivez à support@evoli.fit et nous réglerons cela.",
    alreadyActiveTitle: "Ce compte est déjà finalisé",
    alreadyActive: "Reconnectez-vous avec le mot de passe que vous avez choisi.",
    signInAgain: "Se reconnecter",
    expiredTitle: "Ce compte a expiré",
    expired: (when: string, initialiser: string) =>
      `Il devait être finalisé avant le ${when}, et ce délai est dépassé. Demandez à ${initialiser} de le créer à nouveau.`,
    expiredOnSubmit: (when: string, initialiser: string) =>
      `Ce compte devait être finalisé avant le ${when}, et ce délai est dépassé. Demandez à ${initialiser} de le créer à nouveau.`,
    traineeTitle: "Finalisez ce compte dans l'app",
    trainee:
      "Ce compte est configuré pour Evoli Fit, pas pour Evoli Pro. Finalisez-le dans l'app Evoli Fit.",
    loadFailedTitle: "Impossible de charger votre compte",
    loadFailed: "Rechargez la page pour réessayer.",
    legalUnavailable:
      "Nous ne pouvons pas afficher les Conditions d'utilisation et la Politique de confidentialité pour le moment, le compte ne peut donc pas encore être finalisé. Rechargez la page pour réessayer.",
    failed:
      "Nous n'avons pas pu confirmer la finalisation de votre compte. Rechargez cette page pour voir où il en est.",
    unavailable:
      "Nous n'avons pas pu confirmer la finalisation de votre compte. Rechargez cette page pour voir où il en est.",
    signedInAgain: "Votre compte est finalisé. Connectez-vous avec votre nouveau mot de passe.",
    yourGym: "Votre salle",
    yourCoach: "Votre coach",
  },

  shell: {
    nav: "Portail",
    roster: "Clients",
    signOut: "Se déconnecter",
    backToRoster: "Retour aux clients",
  },

  roster: {
    title: "Clients",
    subtitle: "Les profils Evoli Fit que vous coachez.",
    capacity: (active: number, capacity: number, tier: string) =>
      `${active} / ${capacity} profils · ${tier}`,
    capacityLabel: "Capacité",
    emptyTitle: "Aucun client pour l'instant",
    emptyBody:
      "Invitez une personne qui utilise déjà Evoli Fit. Elle accepte sur son téléphone et apparaît ici.",
    invite: "Inviter un client",
    inviteFull: (tier: string, capacity: number) =>
      `L'offre ${tier} inclut ${capacity} profil${s(capacity)}.`,
    colTrainee: "Client",
    colPlan: "Plan",
    colLastWorkout: "Dernière séance",
    colStreak: "Série",
    colStatus: "Statut",
    noPlan: "Aucun plan",
    noWorkout: "Aucune séance pour l'instant",
    streak: (days: number) => `${days} jour${s(days)}`,
    noStreak: "Aucune série",
    planChanged: "Plan modifié",
    statusActive: "ACTIF",
    loadError: "La liste des clients n'a pas pu être chargée.",
    retry: "Recharger",
    colFlags: "Alertes",
    flags: (count: number) => `${count} alerte${s(count)}`,
    sortLabel: "Trier",
    sortNeedsAttention: "À surveiller",
    sortRecentActivity: "Actifs récemment",
    flagsNotShared: "Non partagé",
  },

  invite: {
    title: "Inviter un client",
    subtitle: "Partagez ce lien, ou faites scanner le code.",
    creating: "Création de l'invitation…",
    linkLabel: "Lien d'invitation",
    copy: "Copier le lien",
    copied: "Copié",
    expiry: "Ce lien est à usage unique et expire dans 7 jours.",
    expiryChip: "Expire dans 7 jours · usage unique",
    qrAlt: "QR code du lien d'invitation",
    qrFailed: "Le QR code n'a pas pu être affiché. Le lien ci-dessus fonctionne toujours.",
    close: "Fermer",
    error: "L'invitation n'a pas pu être créée.",
    capacityReached: "La limite de profils de votre offre est atteinte.",
  },

  /** Trainee-facing (the invite QR's landing): "Evoli Fit", never "Evoli Pro". */
  invitePage: {
    brand: "Evoli Fit",
    title: "Votre coach vous invite sur Evoli",
    titleFrom: (coachName: string) => `${coachName} vous invite sur Evoli Fit`,
    body: "Ouvrez l'invitation dans l'app Evoli Fit pour voir qui vous invite. Rien n'est partagé tant que vous n'avez pas accepté.",
    openIn: (appName: string) => `Ouvrir dans ${appName}`,
    fallback: "Vous n'avez pas encore l'app ? Installez Evoli Fit, puis rouvrez ce lien.",
    storesComingSoon: "Liens App Store et Google Play bientôt disponibles.",
  },

  client: {
    coachedSince: (date: string) => `Suivi depuis le ${date}`,
    adherence: "Assiduité cette semaine",
    adherenceValue: (done: number, planned: number) => `${done} / ${planned}`,
    adherenceFoot: "séances réalisées sur les séances prévues",
    streak: "Série en cours",
    streakUnit: (days: number) => `${days} jour${s(days)}`,
    lastSession: "Dernière séance",
    noSession: "Aucune séance pour l'instant",
    noFeedback: "Aucun retour donné",
    feedback: { EASY: "Facile", OK: "Correct", HARD: "Difficile" },
    weight: "Poids",
    weightTrend: "Évolution du poids, 8 dernières semaines",
    noWeighIns: "Aucune pesée ces 8 dernières semaines",
    oneWeighIn: "1 pesée, pas encore de tendance",
    weighInDelta: (delta: string, count: number) => `${delta} sur ${count} pesées`,
    redFlags: "Signaux d'alerte",
    noRedFlags: "Aucun signal d'alerte",
    notShared: "Non partagé",
    notSharedProgress: "Ce client n'a pas partagé sa progression avec vous.",
    notSharedWeighIns: "Ce client n'a pas partagé ses pesées avec vous.",
    notSharedRedFlags:
      "Les signaux d'alerte ont besoin de la progression et des pesées de ce client, qu'il n'a pas partagées.",
    /** 🔴 The same two rules as English, and no third (EV-187 AC4, see copy.ts). */
    redFlagLabels: {
      MISSED_TWO_OR_MORE_SESSIONS: "2 séances prévues ou plus manquées cette semaine",
      NO_WEIGH_IN_14_DAYS: "Aucune pesée depuis 14 jours",
    } as Record<string, string>,

    adherenceSeries: "Assiduité, 8 dernières semaines",
    adherenceSeriesHeadline: (done: number, planned: number) =>
      `${done} séance${s(done)} réalisée${s(done)} sur ${planned} prévue${s(planned)} ces 8 dernières semaines`,
    weekSessions: (done: number, planned: number) => `${done} / ${planned} séance${s(planned)}`,
    weekNoPlan: "Aucun plan",
    noPlanInWindow: "Aucun plan enregistré sur ces 8 semaines",
    nothingScheduledIn8Weeks: "Aucune séance prévue ces 8 dernières semaines",

    sessionHistory: "Séances récentes",
    sessionSummary: (
      returned: number,
      easy: number,
      ok: number,
      hard: number,
      noFeedback: number
    ) =>
      `${returned < 2 ? "Sur la dernière séance" : `Sur les ${returned} dernières séances`} : ${easy} facile${s(easy)} · ${ok} correcte${s(ok)} · ${hard} difficile${s(hard)} · ${noFeedback} sans retour`,
    noCompletedSessions: "Aucune séance terminée pour l'instant",

    missedSessionsEvidence: "Séances manquées",
    lastWeighIn: (date: string, days: number) => `Dernière pesée le ${date} — il y a ${days} jours`,
    neverWeighedIn: "Aucune pesée enregistrée",
    menu: "Plus",
    revoke: "Révoquer l'accès",
    revokeTitle: "Révoquer l'accès ?",
    revokeBody: (name: string) =>
      `${name} sera retiré de votre liste de clients et vous ne verrez plus ses données d'entraînement. Son compte Evoli Fit et tout son historique sont conservés.`,
    revokeConfirm: "Révoquer l'accès",
    revokeCancel: "Annuler",
    revoking: "Révocation…",
    revokeError: "L'accès n'a pas pu être révoqué.",
    footNote: "La messagerie et la rédaction par IA ne font pas partie de cette préversion.",
    loadError: "Ce client n'a pas pu être chargé.",
    monitoringLoadError: "Ces blocs n'ont pas pu être chargés. Rechargez la page pour réessayer.",
    notFound: "Ce client ne fait pas partie de votre liste. Il a peut-être révoqué l'accès.",
  },

  progressGoal: {
    title: "Progression et objectif",
    weight: "Poids",
    bodyFat: "Masse grasse",
    start: (value: string) => `Départ ${value}`,
    current: (value: string) => `Actuel ${value}`,
    /** "Milestone" is "objectif" here: the number the coach and the client agreed. */
    milestone: (value: string) => `Objectif ${value}`,
    toGo: (value: string) => `Encore ${value}`,
    withDate: (value: string, date: string) => `${value} (${date})`,
    noReadingOnOrAfter: (date: string) => `Aucune mesure à partir du ${date}`,
    notRecorded: "Non renseigné",
    noWeightYet: (firstName: string) => `${firstName} n'a pas encore enregistré de poids.`,
    notShared: (firstName: string) => `${firstName} n'a pas partagé ses pesées avec vous.`,
    loadError: "Ce bloc n'a pas pu être chargé. Rechargez la page pour réessayer.",
    startedOn: (date: string) => `Début du coaching : ${date}`,
    startedOnCoach: "défini par un coach",
    startedOnLinkDefault: "aucune date de début définie, c'est donc la date d'acceptation du lien",
    milestoneSetBy: (name: string, date: string) => `Objectif défini par ${name} le ${date}`,
    milestoneSetByGone: "Objectif défini par un coach qui n'est plus là",
    startDateLabel: "Date de début du coaching",
    startDateHint: "Videz ce champ pour revenir à la date d'acceptation du lien.",
    milestoneLabel: "Objectif de poids (kg)",
    bodyFatMilestoneLabel: "Objectif de masse grasse (%)",
    /** 🔴 G-GOAL — the same witnessed negative claim as English, no stronger. */
    milestoneNote:
      "Un chiffre convenu entre vous et votre client. Les plans et les objectifs nutritionnels ne sont pas calculés à partir de celui-ci.",
    save: "Enregistrer",
    saving: "Enregistrement…",
    saved: "Enregistré.",
    invalidMilestone: "Saisissez un objectif de poids en kilogrammes, ou laissez le champ vide.",
    invalidDate: "Saisissez la date de début sous forme de date, ou laissez le champ vide.",
    invalidBodyFat: "Saisissez un pourcentage entre 3 et 60.",
    outOfRange: "Un objectif de poids doit être compris entre 25 et 300 kg. Rien n'a été enregistré.",
    outOfRangeBodyFat:
      "Un objectif de masse grasse doit être compris entre 3 et 60 %, avec une décimale au plus. Rien n'a été enregistré.",
    failed: "La date de début et l'objectif n'ont pas pu être enregistrés.",
  },

  profile: {
    fromProfile: "Issu du profil du client — vous ne pouvez pas le modifier ici.",
    none: "Rien d'enregistré.",
  },

  tabs: {
    label: "Sections du client",
    overview: "Vue d'ensemble",
    routine: "Programme",
    nutrition: "Nutrition",
  },

  /** No sentence here claims the plan is safe for the client's equipment (BUG-053, see copy.ts). */
  routine: {
    title: "Programme",
    injuries: "Blessures",
    equipment: "Matériel disponible",
    equipmentUnanswered: "Pas encore renseigné.",
    emptyTitle: "Aucun plan actif",
    emptyBody: "Rien n'est encore programmé pour ce client.",
    build: "Créer un plan",
    scopeMissing: "Ce client n'a pas partagé ses séances avec vous.",
    traineeChanged: (firstName: string, date: string) =>
      `${firstName} a modifié ce plan le ${date} (UTC). Vous voyez sa version.`,
    draftBadge: "Brouillon — pas encore publié",
    publishedBadge: "Plan publié",
    planNameLabel: "Nom du plan",
    dayLabel: (n: number) => `Jour ${n}`,
    exercises: (n: number) => `${n} exercice${s(n)}`,
    sets: "Séries",
    reps: "Répétitions",
    rest: "Repos",
    dayFocusLabel: "Focus du jour",
    dayFocusName: (n: number) => `Focus du jour ${n}`,
    replaceKeepsPrescription: "Remplacer conserve les séries, les répétitions et le repos.",
    moveUp: "Monter",
    moveDown: "Descendre",
    replace: "Remplacer",
    remove: "Retirer",
    addExercise: "Ajouter un exercice",
    addDay: "Ajouter un jour",
    removeDay: "Retirer le jour",
    newDayFocus: "Nouveau jour",
    trainingDaysHeading: "Jours d'entraînement — Evoli les applique.",
    trainingDaysNote:
      "Le client s'entraîne ces jours-là une fois le plan publié. Les autres jours sont des jours de repos, et sa nutrition suit.",
    weekdayLabel: (n: number) => `Jour de la semaine du jour ${n}`,
    weekdayTaken: (weekday: string) => `${weekday} est déjà un jour d'entraînement.`,
    allWeekdaysUsed: "Les sept jours sont déjà dans ce plan.",
    dayCountBound: "Un plan compte entre 2 et 6 jours d'entraînement.",
    unsavedBadge: "Modifications non enregistrées",
    leaveTitle: "Quitter sans enregistrer ?",
    leaveBody:
      "Vos modifications ne sont pas enregistrées. Si vous quittez maintenant, elles seront perdues.",
    leaveStay: "Rester sur cette page",
    leaveConfirm: "Quitter sans enregistrer",
    saveDraft: "Enregistrer le brouillon",
    saving: "Enregistrement…",
    savedAt: (date: string) => `Brouillon enregistré à ${date}`,
    saveFailed: "Le brouillon n'a pas pu être enregistré.",
    discardDraft: "Supprimer le brouillon",
    discardTitle: "Supprimer le brouillon ?",
    discardBody:
      "Le brouillon est supprimé et cette page revient au plan publié. Cette action est irréversible.",
    discardFailed: "Le brouillon n'a pas pu être supprimé.",
    cancel: "Annuler",
    publish: "Publier",
    publishing: "Publication…",
    publishShowsFirst:
      "Publier vous montre d'abord les ajustements de sécurité. Rien n'arrive au client avant votre confirmation.",
    repairsTitle: (n: number) =>
      `Nous avons fait ${n} modification${s(n)} pour que ce plan reste sûr`,
    repairLine: (exercise: string, replacedWith: string, rule: string) =>
      `${exercise} → ${replacedWith} · ${rule}`,
    publishWithChanges: "Publier avec ces modifications",
    noChanges: "Aucune modification nécessaire",
    noChangesBody: "Le client verra ce plan la prochaine fois qu'il ouvrira l'app.",
    published: "Publié. Le client le verra la prochaine fois qu'il ouvrira l'app.",
    publishFailed: "Le plan n'a pas pu être publié.",
    catalogUnavailable: "Le catalogue d'exercices est indisponible. Réessayez dans un instant.",
    planEmpty: "Un plan doit compter au moins un jour d'entraînement.",
    catalogTitle: "Ajouter un exercice",
    catalogReplaceTitle: "Remplacer l'exercice",
    catalogSearch: "Rechercher dans le catalogue",
    catalogMuscle: "Muscle",
    catalogEquipment: "Matériel",
    catalogAll: "Tous",
    catalogNoResults: "Aucun exercice ne correspond à ces filtres.",
    catalogTruncated: "Seuls les premiers résultats sont affichés. Affinez la recherche pour en voir plus.",
    catalogAdded: (name: string) => `${name} ajouté.`,
    catalogStaysOpen:
      "Choisissez-en autant que nécessaire — cette fenêtre reste ouverte. Fermez-la quand vous avez terminé.",
    catalogDone: "Terminé",
    catalogSearching: "Recherche…",
    catalogPickOnly: "Choisissez dans le catalogue. Les noms saisis ne sont pas acceptés.",
    loadError: "Le programme de ce client n'a pas pu être chargé.",

    /* ── BUG-195c ─────────────────────────────────────────────────────────── */
    estimatedMinutesLabel: "Minutes (estimation)",
    estimatedMinutesName: (n: number) => `Minutes estimées du jour ${n}`,
    subjectOnSave: "Repris de son profil à l'enregistrement.",
    subjectFromProfile:
      "L'objectif et le niveau sont les réponses du client, issues de son profil. Ils sont repris à l'enregistrement et vous ne pouvez pas les modifier ici.",
    progressionCarried: (n: number) =>
      n < 2
        ? "Ce plan contient 1 règle de progression hebdomadaire issue du plan du client. Elle est conservée telle quelle ; vous ne pouvez pas la modifier ici."
        : `Ce plan contient ${n} règles de progression hebdomadaire issues du plan du client. Elles sont conservées telles quelles ; vous ne pouvez pas les modifier ici.`,
    notSaveableYet: "Ce plan n'est pas encore prêt à être enregistré :",
    summaryHint: "Fait partie du plan que vous publiez. Laissez vide si vous n'avez rien à ajouter.",
    minutesRequired: "Indiquez la durée d'une séance en minutes.",
    setsBound: (day: number, exercise: string) =>
      `Jour ${day} : ${exercise} doit compter entre 1 et 20 séries.`,
    restRequired: (day: number, exercise: string) =>
      `Jour ${day} : indiquez un temps de repos pour ${exercise}.`,
    invalid:
      "Rien n'a été enregistré : le serveur n'a pas accepté une valeur de ce plan. Vérifiez que chaque jour a un focus et au moins un exercice, et que chaque exercice a des séries et un temps de repos.",
    subjectField: (field: string) =>
      `Rien n'a été enregistré : le brouillon contenait ${q(field)} du client, que lui seul peut renseigner. Rechargez la page et réessayez.`,
    repsOnDuration: (weekday: string, exercise: string) =>
      `Rien n'a été enregistré. ${exercise} (le ${weekday.toLowerCase()}) est chronométré, il ne peut donc pas avoir de répétitions. Effacez-les, ou suivez-le en charge et répétitions.`,
    repsOnDurationUnlocated:
      "Rien n'a été enregistré. Un exercice chronométré de ce plan a des répétitions. Effacez-les, ou suivez-le en charge et répétitions.",
    conflictTitle: "Ce brouillon a été modifié ailleurs",
    conflictBody:
      "Quelqu'un a enregistré le brouillon de ce client depuis un autre onglet ou un autre appareil après son ouverture ici. Vos modifications ne sont pas enregistrées.",
    conflictKeepEditing: "Continuer à modifier",
    conflictLoad: "Charger la version enregistrée",
    conflictLoadWarning: "La charger remplace ce qui est affiché sur cette page.",
    conflictLoaded:
      "Vous voyez la version enregistrée ailleurs. Vos modifications n'ont pas été enregistrées.",
    conflictLoadFailed: "La version enregistrée n'a pas pu être chargée. Rechargez la page.",
    conflictUnreadable:
      "Ce brouillon a changé pendant votre modification. Chargez la version enregistrée pour la voir.",
  },

  nutrition: {
    title: "Nutrition",
    targetsTitle: "Objectifs quotidiens",
    calories: "Calories",
    protein: "Protéines",
    carbs: "Glucides",
    fat: "Lipides",
    kcal: "kcal",
    grams: "g",
    activityBadge: (label: string) => `Niveau d'activité : ${label}`,
    activityLabels: {
      SEDENTARY: "Sédentaire",
      LIGHT: "Légèrement actif",
      MODERATE: "Modérément actif",
      ACTIVE: "Actif",
      VERY_ACTIVE: "Très actif",
    } as Record<string, string>,
    sourceAuto: "Calculés automatiquement",
    sourceManual: "Définis manuellement par le client",
    sourceCoach: (date: string) => `Définis par vous le ${date}`,
    sourceCoachOther: (date: string) => `Définis par un autre coach le ${date}`,
    emptyTitle: "Aucune nutrition configurée pour l'instant",
    emptyBody: "Définissez les objectifs, puis appliquez une semaine de repas.",
    scopeMissing: "Ce client n'a pas partagé sa nutrition avec vous.",
    allergies: "Allergies",
    rules: "Règles alimentaires",
    ruleLabels: { HALAL: "Halal", KOSHER: "Casher" } as Record<string, string>,
    dislikes: "Aversions",
    noRestrictions: "Aucune restriction alimentaire enregistrée.",
    saveTargets: "Enregistrer les objectifs",
    saving: "Enregistrement…",
    invalidNumber: "Saisissez un nombre supérieur à 0.",
    floorApplied: (kcal: number) => `Calories relevées au minimum sûr de ${n(kcal)} kcal.`,
    floorStanding:
      "Evoli vérifie les calories par rapport à un minimum sûr. Il ne vérifie pas encore les protéines ni les lipides.",
    macrosAbove: (macroKcal: string, delta: string) =>
      `Vos macros totalisent ${macroKcal} kcal — ${delta} au-dessus de l'objectif calorique.`,
    macrosBelow: (macroKcal: string, delta: string) =>
      `Vos macros totalisent ${macroKcal} kcal — ${delta} en dessous de l'objectif calorique.`,
    macrosMatch: (macroKcal: string) =>
      `Vos macros totalisent ${macroKcal} kcal — cela correspond à l'objectif calorique.`,
    targetsSaved: "Objectifs enregistrés.",
    targetsFailed: "Les objectifs n'ont pas pu être enregistrés.",
    saveTargetsTitle: "Enregistrer les objectifs ?",
    weekTitle: "Semaine de repas",
    weekOf: (date: string) => `Semaine du ${date}`,
    apply: (trainee: string) => `Appliquer à ${trainee}`,
    applying: "Application…",
    applyTitle: "Appliquer cette semaine de repas ?",
    applyBody: (trainee: string, weekStart: string) =>
      `Cela remplace la semaine de repas de ${trainee} qui commence le ${weekStart}.`,
    seesStraightAway: (trainee: string) => `${trainee} le verra immédiatement.`,
    applyConfirm: "Appliquer",
    cancel: "Annuler",
    applyFailed: "La semaine de repas n'a pas pu être appliquée.",
    weekOutOfRange: "Seule la semaine en cours peut être appliquée.",
    weekRateLimited:
      "Une semaine de repas peut être appliquée une fois par jour pour chaque client. Réessayez demain.",
    lockedMealsKept: "Les repas que le client a verrouillés sont conservés.",
    regenerate: "Régénérer le jour",
    regenerateSharesLimit: (trainee: string) =>
      `Les régénérations de jour partagent la limite quotidienne de ${endSentence(trainee)}`,
    swapIsFree: (trainee: string) =>
      `Remplacer un repas n'utilise pas les régénérations quotidiennes de ${endSentence(trainee)}`,
    regenerating: "Régénération…",
    regenerateFailed: "Le jour n'a pas pu être régénéré.",
    /** The demo script's word ("Remplacer"); the app says "Échanger" for the trainee's own swap. */
    swap: "Remplacer le repas",
    swapTitle: "Remplacer le repas",
    swapLoading: "Chargement des options…",
    swapNone: "Aucune option de remplacement n'est disponible pour ce repas.",
    swapFailed: "Le repas n'a pas pu être remplacé.",
    swapOptionsChanged: "Ces options ont changé. Voici les options actuelles.",
    noMeals: "Aucun repas prévu ce jour-là.",
    mealKept: "Conservé",
    mealKeptTitle: "Verrouillé par le client — conservé quand une semaine est appliquée",
    /** Still true in French, and more so: the generated meal names are English (EV-015). */
    englishOnly:
      "Les plans de repas sont générés en anglais. Les vérifications d'ingrédients portent sur les noms anglais.",
    mealSlots: {
      BREAKFAST: "Petit-déjeuner",
      LUNCH: "Déjeuner",
      DINNER: "Dîner",
      SNACK: "Collation",
    } as Record<string, string>,
    macros: (kcal: number, p: number, c: number, f: number) =>
      `${n(kcal)} kcal · ${n(p)} g de protéines · ${n(c)} g de glucides · ${n(f)} g de lipides`,
    loadError: "La nutrition de ce client n'a pas pu être chargée.",
  },

  foodLog: {
    title: "Journal alimentaire",
    window: (from: string, to: string) => `${from} – ${to}. Les jours sont comptés en UTC.`,
    nothingLogged: "Rien d'enregistré",
    calories: "Calories",
    protein: "Protéines",
    carbs: "Glucides",
    fat: "Lipides",
    pair: (eaten: string, target: string, unit: string) => `${eaten} / ${target} ${unit}`,
    noTarget: (eaten: string, unit: string) => `${eaten} ${unit} · Aucun objectif`,
    kcal: "kcal",
    grams: "g",
    source: {
      OFF: "Depuis la base alimentaire",
      QUICK: "Ajout rapide",
      MANUAL: "Saisi à la main",
    } as Record<string, string>,
    fromThePlan: "Depuis le plan",
    logged: "Enregistré",
    serving: (grams: string) => `${grams} g`,
    at: (time: string) => `${time} UTC`,
    loadError: "Le journal alimentaire n'a pas pu être chargé.",
  },

  placement: {
    loading: "Chargement de vos recettes…",
    loadFailed: "Vos recettes n'ont pas pu être chargées.",
    empty: "Vous n'avez encore aucune recette.",
    emptyLink: "Nouvelle recette",
    chooseNamed: (recipe: string) => `Choisir ${recipe}`,
    confirm: (meal: string, recipe: string, weekday: string) =>
      `Remplacer ${q(meal)} par ${q(recipe)} le ${weekday.toLowerCase()} ?`,
    placing: "Remplacement…",
    yourRecipe: "Votre recette",
    coachRecipe: "Recette du coach",
    yourRecipeTitle: "Vous avez placé une de vos recettes sur ce repas",
    coachRecipeTitle: "Un autre coach a placé une de ses recettes sur ce repas",
    excludedIngredient: (recipe: string, first: string, value: string) =>
      `${q(recipe)} ne peut pas être utilisée pour ${first} : ${value} est incompatible avec ses préférences alimentaires.`,
    excludedName: (recipe: string, first: string) =>
      `${q(recipe)} ne peut pas être utilisée pour ${first} : son nom contient un mot incompatible avec ses préférences alimentaires. Renommez la recette et réessayez.`,
    ruleUncheckable: (first: string) =>
      `Les recettes ne peuvent pas encore être utilisées pour ${first} : Evoli ne sait pas vérifier une recette écrite à la main pour les associations viande-lait de la cacherout. Ses repas générés ne sont pas concernés.`,
    allergiesUncheckable: (first: string) =>
      `Les recettes ne peuvent pas encore être utilisées pour ${first} : Evoli ne sait pas contrôler une recette écrite à la main au regard de ses préférences alimentaires. Ses repas générés ne sont pas concernés.`,
    belowFloor: (first: string, weekday: string, dayKcalAfter: number, floorKcal: number) =>
      `Cela ramènerait le ${weekday.toLowerCase()} de ${first} à ${n(dayKcalAfter)} kcal, sous son minimum de ${n(floorKcal)} kcal. Choisissez une recette plus calorique.`,
    mealEaten: (first: string) => `${first} a déjà mangé ce repas, il ne peut donc pas être remplacé.`,
    mealLocked: (first: string) => `${first} a verrouillé ce repas, il ne peut donc pas être remplacé.`,
    retiredIngredient: (recipe: string) =>
      `${q(recipe)} utilise un ingrédient qu'Evoli ne propose plus. Ouvrez la recette pour le remplacer, puis réessayez.`,
    openRecipe: "Ouvrir la recette",
    mealChanged: "Ce repas a changé. Sélectionnez-le à nouveau.",
    recipeGone: "Cette recette ne fait plus partie de votre bibliothèque.",
    accessDenied: (first: string) => `Cette recette n'a pas pu être utilisée pour ${endSentence(first)}`,
    placementOff: "Les recettes ne peuvent pas être placées sur les repas pour le moment.",
    failed: "La recette n'a pas pu être utilisée. Réessayez.",
    applyWarning: (count: number, first: string) =>
      `Cela remplace jusqu'à ${count} ${count < 2 ? "repas placé" : "repas placés"} à partir de recettes de coach. Les repas que ${first} a mangés sont conservés.`,
  },

  /** Deliberately no word saying suggestions come from a model ("IA"), as in English (R4). */
  swapSheet: {
    searchLabel: "Rechercher dans vos recettes",
    searchPlaceholder: "Nom de la recette",
    suggestions: "Suggestions",
    showSuggestions: "Voir des suggestions",
    noMatch: (query: string) => `Aucune recette ne correspond à ${q(query)}.`,
    cancel: "Annuler",
    confirm: "Confirmer",
  },

  /** Nothing here implies that using a template changes anything the client sees (see copy.ts). */
  templates: {
    nav: "Modèles",
    title: "Modèles",
    subtitle: "Des programmes à appliquer à n'importe quel client.",
    private: "Vos modèles vous appartiennent. Aucun client ne les voit.",
    emptyTitle: "Aucun modèle pour l'instant",
    emptyBody: "Créez un programme une fois et appliquez-le à n'importe quel client.",
    create: "Nouveau modèle",
    loadError: "Vos modèles n'ont pas pu être chargés.",
    notYours: "Ce modèle ne fait pas partie de votre bibliothèque.",
    backToLibrary: "Retour aux modèles",
    updatedJustNow: "Mis à jour à l'instant",
    updatedAt: (when: string) => `Mis à jour le ${when}`,
    rowSummary: (days: number, exercises: number) =>
      `${days} jour${s(days)} · ${exercises} exercice${s(exercises)}`,
    edit: "Modifier",
    duplicate: "Dupliquer",
    rename: "Renommer",
    remove: "Supprimer",
    use: "Utiliser pour un client",
    limitReached: (limit: number) =>
      `Vous pouvez conserver jusqu'à ${limit} modèles. Supprimez-en un pour faire de la place.`,
    remaining: (left: number, limit: number) => `${left} sur ${limit} restant${s(left)}`,
    renameTitle: "Renommer le modèle",
    renameLabel: "Nom du modèle",
    nameTaken: "Vous avez déjà un modèle portant ce nom.",
    nameRequired: "Donnez un nom au modèle.",
    nameTooLong: "Le nom d'un modèle ne dépasse pas 80 caractères.",
    renameFailed: "Le modèle n'a pas pu être renommé.",
    duplicateFailed: "Le modèle n'a pas pu être dupliqué.",
    deleteTitle: "Supprimer le modèle ?",
    deleteBody: (name: string) =>
      `${q(name)} est supprimé de votre bibliothèque. Les plans et brouillons créés à partir de ce modèle restent inchangés.`,
    deleteFailed: "Le modèle n'a pas pu être supprimé.",
    newTitle: "Nouveau modèle",
    editTitle: "Modifier le modèle",
    nameLabel: "Nom du modèle",
    documentNameLabel: "Nom du programme",
    documentNameRequired: "Donnez un nom au programme.",
    newDocumentName: "Nouveau programme",
    newDayFocus: "Nouveau jour",
    goalLabel: "Objectif",
    levelLabel: "Niveau",
    goalLabels: {
      BUILD_MUSCLE: "Prise de muscle",
      LOSE_WEIGHT: "Perte de poids",
      GET_STRONGER: "Force",
      ENDURANCE: "Endurance",
      MOBILITY: "Mobilité",
    } as Record<string, string>,
    levelLabels: {
      BEGINNER: "Débutant",
      INTERMEDIATE: "Intermédiaire",
      ADVANCED: "Avancé",
    } as Record<string, string>,
    minutesLabel: "Minutes par séance",
    summaryLabel: "Résumé",
    summaryHint: "Visible par vous seul. Laissez vide si vous n'avez rien à ajouter.",
    notesLabel: "Notes",
    tempoLabel: "Tempo",
    weightLabel: "Charge",
    trackingLabel: "Suivi en",
    trackingWeightReps: "Charge et répétitions",
    trackingDuration: "Durée",
    durationLabel: "Secondes",
    save: "Enregistrer le modèle",
    saving: "Enregistrement…",
    saved: "Modèle enregistré",
    saveFailed: "Le modèle n'a pas pu être enregistré.",
    unsavedBadge: "Modifications non enregistrées",
    notSaveableYet: "Ce modèle n'est pas encore prêt à être enregistré :",
    localOnly: "Rien n'est enregistré tant que vous n'avez pas cliqué sur Enregistrer le modèle.",
    dayCountBound: "Un modèle compte entre 2 et 6 jours d'entraînement.",
    dayEmpty: (n: number) => `Le jour ${n} n'a aucun exercice.`,
    dayFocusRequired: (n: number) => `Le jour ${n} a besoin d'un focus.`,
    duplicateWeekday: "Deux jours d'entraînement tombent le même jour de la semaine.",
    freeTextTooLong: "Un des champs de texte est trop long.",
    dayFull: "12 exercices au maximum par jour.",
    tooLarge: (day: number, count: number) =>
      `Un jour d'entraînement peut contenir jusqu'à 12 exercices. Le jour ${day} en a ${count}.`,
    saveAsTemplate: "Enregistrer comme modèle",
    saveAsTemplateTitle: "Enregistrer comme modèle",
    fromPlan: "À partir du plan publié",
    fromDraft: "À partir de votre brouillon non publié",
    sourceEmpty: "Ce client n'a pas encore de programme à copier.",
    saveAsTemplateDone: (name: string) => `${q(name)} est dans vos modèles.`,
    saveAsTemplateFailed: "Le modèle n'a pas pu être créé.",
    useTitle: "Utiliser pour un client",
    pickTrainee: "Client",
    guardrailsAtPublish: (trainee: string) =>
      `Les blessures et le matériel de ${trainee} sont pris en compte à la publication.`,
    useConfirm: (template: string, trainee: string) => `Appliquer ${q(template)} à ${trainee} ?`,
    replacesDraft: (trainee: string) =>
      `Cela remplace votre brouillon non publié pour ${endSentence(trainee)} Ce brouillon ne pourra pas être récupéré.`,
    useIt: "Utiliser ce modèle",
    replaceAndUse: "Remplacer le brouillon",
    cancel: "Annuler",
    noTrainees: "Aucun de vos clients n'a partagé ses séances avec vous.",
    applyFailed: "Le modèle n'a pas pu être appliqué à ce client.",
    repsOnDuration:
      "Un exercice chronométré de ce modèle a encore des répétitions de l'ancien éditeur. Ouvrez le modèle et enregistrez-le, puis réutilisez-le.",
    applyConflictUnreadable:
      "Le brouillon de ce client a changé pendant que cette fenêtre était ouverte. Rouvrez-la.",
    /** 🔴 Apply writes the coach's draft and nothing else — said before the confirm, as in English. */
    applyNotPublished:
      "Cela remplit votre brouillon pour ce client. Rien ne change pour lui tant que vous n'avez pas publié.",
    applied: (trainee: string) =>
      `Brouillon prêt pour ${endSentence(trainee)} Rien n'a encore changé pour ce client — publiez quand vous êtes prêt.`,
    startedFrom: (name: string) => `Créé à partir de ${name}`,
    unbindable: (n: number) =>
      n === 1
        ? "1 exercice n'est peut-être pas dans le catalogue d'exercices. Vérifiez-le avant de publier."
        : `${n} exercices ne sont peut-être pas dans le catalogue d'exercices. Vérifiez-les avant de publier.`,
    notInCatalogue: "Introuvable dans le catalogue",
  },

  /** Deliberately absent, as in English: any claim that a recipe is checked against a client. */
  recipes: {
    nav: "Recettes",
    title: "Recettes",
    subtitle: "Des repas que vous écrivez une seule fois.",
    private: "Vos recettes vous appartiennent. Aucun client ne voit votre bibliothèque.",
    count: (count: number, limit: number) => `${count} recette${s(count)} sur ${limit}`,
    emptyTitle: "Aucune recette pour l'instant.",
    emptyBody: "Écrivez une recette une fois, avec ses ingrédients, ses macros et ses étapes.",
    create: "Nouvelle recette",
    loadError: "Vos recettes n'ont pas pu être chargées.",
    recipeLoadError: "Cette recette n'a pas pu être chargée.",
    notYours: "Cette recette ne fait pas partie de votre bibliothèque.",
    backToLibrary: "Retour aux recettes",
    limitReached: (limit: number) =>
      `Vous pouvez conserver jusqu'à ${limit} recettes. Supprimez-en une pour faire de la place.`,
    /** P / G / L — protéines, glucides, lipides. */
    macroLine: (kcal: number, p: number, c: number, f: number) =>
      `${n(kcal)} kcal · P ${n(p)} g · G ${n(c)} g · L ${n(f)} g`,
    ingredientCount: (count: number) => `${count} ingrédient${s(count)}`,
    edit: "Modifier",
    remove: "Supprimer",
    deleteTitle: "Supprimer la recette ?",
    deleteBody: (name: string) =>
      `Supprimer ${q(name)} ? Les repas déjà placés sur le plan d'un client conservent cette recette.`,
    deleteFailed: "La recette n'a pas pu être supprimée.",
    cancel: "Annuler",
    newTitle: "Nouvelle recette",
    editTitle: "Modifier la recette",
    futureUsesOnly:
      "Les modifications ne s'appliquent qu'aux prochaines utilisations. Les repas déjà placés conservent la version placée.",
    nameLabel: "Nom de la recette",
    ingredientsHeading: "Ingrédients",
    ingredientsNote: "Une portion. Choisissez chaque ingrédient dans la liste d'Evoli.",
    searchLabel: "Trouver un ingrédient",
    /**
     * Evoli's ingredient list is searched by its ENGLISH names (the same vocabulary the
     * exclusion checks run on — see `nutrition.englishOnly`), so the example words stay
     * English and the placeholder says so. A French example would send the coach typing
     * "poulet" into a search that cannot find it.
     */
    searchPlaceholder: "En anglais : chicken, rice, oats…",
    searching: "Recherche…",
    found: (count: number) => `${count} ingrédient${s(count)} trouvé${s(count)}`,
    noIngredientMatch: (query: string) =>
      `Evoli ne liste que les ingrédients qu'il sait contrôler, et ${q(query)} n'en fait pas encore partie.`,
    searchFailed: "La liste d'ingrédients n'a pas pu être consultée. Réessayez.",
    alreadyAdded: "Ajouté",
    addIngredientNamed: (label: string) => `Ajouter ${label}`,
    quantityLabel: "Quantité",
    unitLabel: "Unité",
    unitNames: { g: "g", ml: "ml", piece: "pièce" } as Record<string, string>,
    removeIngredient: "Retirer",
    removeIngredientNamed: (label: string) => `Retirer ${label}`,
    ingredientsFull: "Une recette compte au maximum 25 ingrédients.",
    macrosHeading: "Macros par portion",
    kcalLabel: "Calories (kcal)",
    proteinLabel: "Protéines (g)",
    carbsLabel: "Glucides (g)",
    fatLabel: "Lipides (g)",
    stepsHeading: "Étapes",
    stepsNote: "Facultatif. Elles restent dans l'ordre où vous les écrivez.",
    stepLabel: (n: number) => `Étape ${n}`,
    addStep: "Ajouter une étape",
    removeStep: "Retirer",
    removeStepNamed: (n: number) => `Retirer l'étape ${n}`,
    stepsFull: "Une recette compte au maximum 15 étapes.",
    save: "Enregistrer la recette",
    saving: "Enregistrement…",
    saved: "Recette enregistrée.",
    saveFailed: "La recette n'a pas pu être enregistrée.",
    unsavedBadge: "Modifications non enregistrées",
    notReady: "Complétez les champs signalés ci-dessus pour enregistrer.",
    required: "Obligatoire.",
    nameRequired: "Donnez un nom à la recette.",
    nameTooLong: "Le nom d'une recette ne dépasse pas 80 caractères.",
    nameInvalid: "Vérifiez le nom : de 1 à 80 caractères, sur une seule ligne.",
    noLineBreaks: "Écrivez ceci sur une seule ligne, sans caractères spéciaux.",
    ingredientsRequired: "Ajoutez au moins un ingrédient.",
    quantityRequired: "Saisissez une quantité.",
    quantityRange: "Une quantité est supérieure à 0 et au plus égale à 5000, avec 2 décimales au plus.",
    wholeNumbersOnly: (below: number, above: number) =>
      `Nombres entiers uniquement. Utilisez ${below} ou ${above}.`,
    numberRange: (label: string, min: number, max: number) =>
      `${label} : un nombre entier de ${min} à ${max}.`,
    stepEmpty: "Écrivez cette étape ou retirez-la.",
    stepTooLong: "Une étape ne dépasse pas 300 caractères.",
    stepInvalid: "Vérifiez cette étape : de 1 à 300 caractères, sur une seule ligne.",
    macrosInconsistent: (computedKcal: number, kcal: number) =>
      `Ces macros totalisent ${n(computedKcal)} kcal, et non ${n(kcal)}. Vérifiez les chiffres.`,
    nameTaken: "Vous avez déjà une recette portant ce nom.",
    ingredientRetired: (label: string) =>
      `${q(label)} ne figure plus dans la liste d'ingrédients d'Evoli. Retirez-le pour enregistrer.`,
    retiredBadge: "Ne figure plus dans la liste d'Evoli",
    ingredientTwice: "Cet ingrédient est déjà dans la recette.",
    ingredientInvalid: "Vérifiez la quantité et l'unité de cet ingrédient.",
    ingredientsBound: "Une recette compte entre 1 et 25 ingrédients.",
  },

  /** EV-321b — les défis de pas. Les nombres arrivent déjà formatés (`formatSteps`). */
  challenges: {
    nav: "Défis",
    title: "Défis",
    subtitle: "Des objectifs de pas que vos clients rejoignent depuis l'app Evoli Fit.",
    create: "Nouveau défi",
    emptyTitle: "Aucun défi pour l'instant",
    emptyBody:
      "Fixez un objectif de pas quotidien sur une semaine et invitez vos clients. Vous voyez leur progression dès qu'ils acceptent.",
    loadError: "Vos défis n'ont pas pu être chargés.",
    notYours: "Ce défi ne fait pas partie de votre liste.",
    backToList: "Retour aux défis",
    phase: {
      UPCOMING: "À venir",
      ACTIVE: "En cours",
      ENDED: "Terminé",
    },
    window: (start: string, end: string) => `Du ${start} au ${end}`,
    days: (days: number) => `${days} jour${s(days)}`,
    stepsGoal: (steps: string) => `${steps} pas par jour`,
    workoutsGoal: (count: string) => `${count} séances au total`,
    counts: (participants: number, accepted: number) =>
      `${participants} invité${s(participants)} · ${accepted} ${accepted < 2 ? "a rejoint" : "ont rejoint"}`,
    previous: "Précédent",
    next: "Suivant",
    pageOf: (page: number, pages: number) => `Page ${page} sur ${pages}`,

    dialogTitle: "Nouveau défi",
    dialogSub: "Vos clients reçoivent une invitation dans l'app Evoli Fit.",
    titleLabel: "Titre",
    titlePlaceholder: "ex. 10\u202f000 pas par jour",
    metricLabel: "Type",
    metricSteps: "Pas quotidiens",
    targetLabel: "Objectif de pas par jour",
    targetHint: (min: string, max: string) => `Entre ${min} et ${max} pas.`,
    startLabel: "Début",
    endLabel: "Fin",
    windowHint: "93 jours maximum, avec un début au plus tôt il y a 14 jours et au plus tard dans 60 jours.",
    clientsLabel: "Clients à inviter",
    clientsHint: "Vous ne voyez les pas d'un client qu'après qu'il a accepté l'invitation.",
    selectAll: "Tout sélectionner",
    selectNone: "Effacer",
    selected: (count: number) => `${count} sélectionné${s(count)}`,
    noClients: "Vous n'avez encore aucun client lié. Invitez d'abord un client depuis la liste des clients.",
    clientsLoadError: "Vos clients n'ont pas pu être chargés. Rechargez la page pour réessayer.",
    submit: "Créer et inviter",
    submitting: "Création…",
    cancel: "Annuler",
    problems: {
      titleRequired: "Donnez un titre au défi.",
      titleTooLong: (max: string) => `Un titre fait ${max} caractères au maximum.`,
      titleControl: "Un titre tient sur une seule ligne.",
      titleInvalid: (max: string) => `Un titre fait de 1 à ${max} caractères, sur une seule ligne.`,
      targetInvalid: "Saisissez l'objectif en nombre entier de pas.",
      targetRange: (min: string, max: string) => `L'objectif quotidien est compris entre ${min} et ${max} pas.`,
      dateInvalid: "Choisissez une date.",
      endBeforeStart: "La date de fin est le jour du début ou après.",
      windowTooLong: (days: string) => `Un défi dure ${days} jours au maximum.`,
      startTooEarly: (days: string) => `Le début est au plus tôt il y a ${days} jours.`,
      startTooLate: (days: string) => `Le début est au plus tard dans ${days} jours.`,
      startRange: (past: string, ahead: string) =>
        `Le début est compris entre il y a ${past} jours et dans ${ahead} jours.`,
      endRange: (days: string) => `La fin est le jour du début ou après, et un défi dure ${days} jours au maximum.`,
      clientsRequired: "Choisissez au moins un client.",
      clientsTooMany: (max: string) => `Vous pouvez inviter ${max} clients au maximum.`,
      clientsRange: (max: string) => `Choisissez entre 1 et ${max} clients.`,
    },
    failures: {
      accessDenied:
        "L'un de ces clients n'est plus lié à vous. Rien n'a été créé. Rechargez la page et choisissez à nouveau.",
      limitReached: (max: string) =>
        `Vous avez déjà ${max} défis qui ne sont pas terminés. Supprimez-en un pour en créer un autre.`,
      invalid: "Le défi n'a pas pu être créé. Vérifiez le formulaire et réessayez.",
      failed: "Le défi n'a pas pu être créé. Réessayez dans un instant.",
    },
    created: "Défi créé. Vos clients voient l'invitation dans l'app Evoli Fit.",

    refresh: "Actualiser",
    refreshing: "Actualisation…",
    autoRefresh: "Mise à jour toutes les 45 secondes tant que cette page est ouverte.",
    loadedAt: (time: string) => `Mis à jour à ${time}`,
    consent: "En acceptant l'invitation, le client accepte de partager ses pas avec vous.",
    progressLabel: "Progression des participants",
    colRank: "Rang",
    colClient: "Client",
    colStatus: "Statut",
    colToday: "Aujourd'hui",
    colDaysMet: "Jours réussis",
    colTotal: "Total",
    colSynced: "Dernière synchro",
    colDays: "Jour par jour",
    status: {
      INVITED: "Invitation envoyée",
      ACCEPTED: "Participe",
    },
    unnamed: "Client sans nom",
    invitedNote: "Ses pas apparaîtront ici après acceptation.",
    rank: (rank: number) => `${rank}${rank === 1 ? "er" : "e"}`,
    todaySteps: (value: string, target: string) => `${value} / ${target} pas`,
    todayWorkouts: (value: string) => `${value} aujourd'hui`,
    todayBar: (name: string) => `${name} : pas du jour par rapport à l'objectif quotidien`,
    daysMet: (met: number, elapsed: number) => `${met} sur ${elapsed}`,
    daysMetLabel: (met: number, elapsed: number) =>
      `${met} jour${s(met)} sur ${elapsed} ${met < 2 ? "a atteint" : "ont atteint"} l'objectif jusqu'ici`,
    totalSteps: (steps: string) => `${steps} pas`,
    totalWorkouts: (count: string, target: string) => `${count} / ${target} séances`,
    source: {
      HEALTH_CONNECT: "Health Connect",
      HEALTHKIT: "Apple Santé",
      PEDOMETER: "Podomètre",
      MANUAL: "Saisie manuelle",
    },
    dayStatus: {
      MET: "objectif atteint",
      MISSED: "objectif manqué",
      IN_PROGRESS: "en cours",
      NO_DATA: "aucune donnée",
      FUTURE: "à venir",
    },
    dayLabel: (day: string, status: string) => `${day} : ${status}`,
    dayLabelSteps: (day: string, steps: string, status: string) => `${day} : ${steps} pas, ${status}`,
    daysList: (name: string) => `${name}, jour par jour`,
    legend: "Légende",
    noParticipants:
      "Personne n'apparaît sur ce défi. Un client qui a refusé, qui est parti ou qui n'est plus lié à vous n'est pas affiché.",

    remove: "Supprimer le défi",
    deleteTitle: "Supprimer ce défi ?",
    deleteBody: (title: string) =>
      `${q(title)} est supprimé et disparaît de l'app de vos clients. Les pas enregistrés par vos clients leur appartiennent et sont conservés.`,
    deleteConfirm: "Supprimer",
    deleteFailed: "Le défi n'a pas pu être supprimé. Réessayez dans un instant.",
  },

  unavailable: {
    title: "Impossible de joindre Evoli pour le moment",
    body: "Rien n'a été modifié et votre session est toujours ouverte. Réessayez dans un instant.",
    retry: "Réessayer",
  },

  common: {
    loading: "Chargement…",
    unexpectedError: "Une erreur est survenue.",
    tryAgain: "Réessayer",
    dash: "—",
    close: "Fermer",
  },

  /** EV-324 AC5b, verbatim. */
  legalFooter:
    "Plans alimentaires destinés à des personnes en bonne santé. Ils ne remplacent pas un avis médical ni le suivi d'un diététicien.",
  legalFooterLabel: "Mention légale",

  guardrails: {
    /** b-fit-mobile's `fr.json` `equipment.*`, verbatim. */
    equipment: {
      NONE: "Poids du corps uniquement",
      BODYWEIGHT: "Poids du corps uniquement",
      DUMBBELLS: "Haltères",
      BARBELL: "Barre",
      BANDS: "Élastiques",
      GYM: "Salle de sport complète",
      KETTLEBELL: "Kettlebell",
      PULL_UP_BAR: "Barre de traction",
      BENCH: "Banc",
      CABLE_MACHINE: "Machine à câbles",
      SQUAT_RACK: "Rack à squat",
    } as Record<string, string>,
    injuries: {
      KNEE: "Genoux",
      LOWER_BACK: "Bas du dos",
      SHOULDER: "Épaules",
      NECK: "Nuque",
      WRIST: "Poignets",
      HIP: "Hanches",
      ANKLE: "Chevilles",
      ELBOW: "Coudes",
    } as Record<string, string>,
  },
} satisfies Copy;
