import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings, ModelData, PlanningEvent, PosteSuiviData, HRWorker, Operation } from '../../types';
import { deriveHourGrid } from './shared/hours';
import { pauseOverlapMinutes, horairesDuJour } from '../../lib/horaires';
import { tx } from '../../lib/i18n';
import { configPrimeEffective, palierAtteint } from '../../lib/primeEngine';
import { useLang } from '../../src/context/LanguageContext';
import { useIsMobile } from '../planning/shared/useIsMobile';
import { Clock, User, Play, Pause, Square, Save, CheckCircle2, Loader2, ChevronDown, MoreVertical, Trash2, Image as ImageIcon, Timer, TrendingUp, TrendingDown } from 'lucide-react';
import AjoutPosteRapide from './AjoutPosteRapide';
import ChampOuvrier from './ChampOuvrier';
import FicheOuvrier from './FicheOuvrier';
import { signalerMesureTemps } from '../../lib/mesuresTemps';

interface Props {
    models: ModelData[];
    planningEvents: PlanningEvent[];
    settings: AppSettings;
    chainsList: string[];
    selectedChaineId: string;
    setSelectedChaineId: (id: string) => void;
    globalDate?: string;
    setGlobalDate?: (d: string) => void;
    /** Ouvre l'atelier des methodes sur l'etape Gamme du modele donne. */
    onOpenGamme?: (modelId: string) => void;
    /** Ajoute une operation a la gamme du modele et la persiste. */
    onAddPoste?: (modelId: string, ops: Operation | Operation[]) => Promise<void>;
    /** Retire une operation de la gamme du modele. Les releves deja faits restent. */
    onRemovePoste?: (modelId: string, posteId: string) => Promise<void>;
    /** Fixe le temps standard d'un poste du releve, en MINUTES par piece. */
    onSetPosteTemps?: (modelId: string, posteId: string, tempsMin: number) => Promise<void>;
    /** OF a ouvrir en arrivant (Bibliotheque > Lancer Suivi), avant la memoire locale. */
    focusPlanningId?: string | null;
    /** Appele une fois l'OF ouvert, pour ne pas rejouer le focus a chaque rendu. */
    onFocusPlanningConsumed?: () => void;
    /** Ramene l'OF a aujourd'hui en gardant sa duree, quand il a ete lance trop loin. */
    onDeplacerOFAujourdhui?: (planningId: string) => void;
}

const L = {
    title: { fr: 'Suivi par poste / ouvrier', ar: 'التتبع حسب المحطة والعامل', en: 'Poste / worker tracking', es: 'Seguimiento por puesto/operario', pt: 'Acompanhamento por posto/operário', tr: 'İstasyon/işçi takibi' },
    subtitle: { fr: "Un releve par poste, par ouvrier, range automatiquement dans l'heure en cours", ar: 'تسجيل لكل محطة ولكل عامل، يُصنَّف تلقائياً في الساعة الجارية', en: 'One entry per poste, per worker, auto-filed to the current hour', es: 'Un registro por puesto y operario, clasificado automáticamente en la hora actual', pt: 'Um registo por posto e operário, arquivado automaticamente na hora atual', tr: 'İstasyon ve işçi başına bir kayıt, otomatik olarak geçerli saate yazılır' },
    ofsAilleurs: { fr: 'Cette chaine porte ces OF a d\u2019autres dates :', ar: '\u0647\u0630\u0627 \u0627\u0644\u062e\u0637 \u0639\u0644\u064a\u0647 \u0647\u0630\u0647 \u0627\u0644\u0623\u0648\u0627\u0645\u0631 \u0641\u064a \u062a\u0648\u0627\u0631\u064a\u062e \u0623\u062e\u0631\u0649:', en: 'This line carries these orders on other dates:', es: 'Esta l\u00ednea lleva estas OF en otras fechas:', pt: 'Esta linha tem estas OF noutras datas:', tr: 'Bu hat, ba\u015fka tarihlerde bu i\u015f emirlerini ta\u015f\u0131yor:' },
    noModel: { fr: 'Aucun modèle planifié sur cette chaîne pour cette date', ar: 'لا يوجد نموذج مخطط لهذه السلسلة في هذا التاريخ', en: 'No model planned on this line for this date', es: 'Ningún modelo planificado en esta línea para esta fecha', pt: 'Nenhum modelo planeado nesta linha para esta data', tr: 'Bu tarihte bu hatta planlanmış model yok' },
    noModelIntrouvable: { fr: "L'OF selectionne pointe vers un modele introuvable (il a ete supprime ou renomme). Ouvrez le Planning et rattachez l'OF a un modele.", ar: 'الـ OF المحدَّد يشير إلى موديل غير موجود (حُذف أو غُيّر). افتح Planning وأعد ربط الـ OF بموديل.', en: 'The selected OF points to a missing model (deleted or renamed). Open Planning and re-attach the OF to a model.', es: 'La OF seleccionada apunta a un modelo inexistente (eliminado o renombrado). Abra Planning y vuelva a vincular la OF.', pt: 'A OF selecionada aponta para um modelo inexistente (eliminado ou renomeado). Abra o Planning e volte a associar a OF.', tr: 'Secili OF eksik bir modele isaret ediyor (silinmis veya yeniden adlandirilmis). Planning ekranindan OF u bir modele yeniden baglayin.' },
    noGamme: { fr: "Ce modele n'a pas encore de gamme operatoire : il n'y a donc aucun poste a relever. Ingenierie › Gamme operatoire.", ar: 'هذا الموديل ما عندوش گام عملياتي بعد: ما كاين حتى منصب باش نسجّلو. Ingénierie › Gamme opératoire.', en: 'This model has no operation sheet yet, so there is no poste to record. Engineering › Gamme.', es: 'Este modelo aun no tiene gama operativa: no hay ningun puesto que registrar. Ingenieria › Gama.', pt: 'Este modelo ainda nao tem gama operatoria: nao ha nenhum posto a registar. Engenharia › Gama.', tr: 'Bu modelin henuz operasyon listesi yok, bu yuzden kaydedilecek istasyon da yok. Muhendislik › Gamme.' },
    ouvrirGamme: { fr: 'Remplir la gamme de ce modele', ar: 'عمّر الگام ديال هاد الموديل', en: 'Fill this model’s gamme', es: 'Completar la gama de este modelo', pt: 'Preencher a gama deste modelo', tr: 'Bu modelin gamme’ini doldur' },
    poste: { fr: 'Poste', ar: 'المحطة', en: 'Poste', es: 'Puesto', pt: 'Posto', tr: 'İstasyon' },
    worker: { fr: 'Ouvrier', ar: 'العامل', en: 'Worker', es: 'Operario', pt: 'Operário', tr: 'İşçi' },
    chooseWorker: { fr: 'Choisir un ouvrier…', ar: 'اختر عاملاً…', en: 'Choose a worker…', es: 'Elegir un operario…', pt: 'Escolher um operário…', tr: 'İşçi seçin…' },
    hourNow: { fr: 'Créneau', ar: 'الفترة', en: 'Slot', es: 'Franja', pt: 'Faixa', tr: 'Zaman dilimi' },
    chrono: { fr: 'Chronométrer', ar: 'حساب الزمن', en: 'Time it', es: 'Cronometrar', pt: 'Cronometrar', tr: 'Kronometre' },
    start: { fr: 'Démarrer', ar: 'ابدأ', en: 'Start', es: 'Iniciar', pt: 'Iniciar', tr: 'Başlat' },
    stop: { fr: 'Arrêter', ar: 'إيقاف', en: 'Stop', es: 'Detener', pt: 'Parar', tr: 'Durdur' },
    reset: { fr: 'Réinitialiser', ar: 'إعادة تعيين', en: 'Reset', es: 'Reiniciar', pt: 'Repor', tr: 'Sıfırla' },
    timePerPiece: { fr: 'Temps / pièce', ar: 'الزمن / قطعة', en: 'Time / piece', es: 'Tiempo / pieza', pt: 'Tempo / peça', tr: 'Parça başı süre' },
    loading: { fr: 'Chargement…', ar: 'جار التحميل…', en: 'Loading…', es: 'Cargando…', pt: 'A carregar…', tr: 'Yükleniyor…' },
    score: { fr: 'Score', ar: 'النتيجة', en: 'Score', es: 'Puntuación', pt: 'Pontuação', tr: 'Puan' },
    progression: { fr: 'Progression des ouvriers', ar: 'تقدّم العمّال', en: 'Worker progression', es: 'Progresión de operarios', pt: 'Progressão dos operários', tr: 'İşçi gelişimi' },
    progressionVide: { fr: "Pas encore de relevé chronométré : le score apparaît dès qu'un temps est mesuré.", ar: 'لا يوجد تسجيل مُوقَّت بعد: النتيجة تظهر بمجرّد قياس زمن.', en: 'No timed entry yet: the score appears as soon as a time is measured.', es: 'Aún no hay registro cronometrado: la puntuación aparece en cuanto se mide un tiempo.', pt: 'Ainda sem registo cronometrado: a pontuação aparece assim que um tempo for medido.', tr: 'Henüz süre ölçümü yok: bir süre ölçülür ölçülmez puan görünür.' },
    scoreEstime: { fr: 'Score estime depuis la quantite (pas de chronometrage)', ar: 'نتيجة مُقدَّرة من الكمية (بلا كرونومتراج)', en: 'Score estimated from quantity (no timing)', es: 'Puntuacion estimada por la cantidad (sin cronometraje)', pt: 'Pontuacao estimada pela quantidade (sem cronometragem)', tr: 'Miktardan tahmin edilen puan (olcum yok)' },
    postesTenus: { fr: 'postes tenus', ar: 'مناصب مشغولة', en: 'stations held', es: 'puestos cubiertos', pt: 'postos ocupados', tr: 'tutulan istasyon' },
    modeleActif: { fr: 'Modèle actif', ar: 'الموديل النشط', en: 'Active model', es: 'Modelo activo', pt: 'Modelo ativo', tr: 'Aktif model' },
    total: { fr: 'Total', ar: 'المجموع', en: 'Total', es: 'Total', pt: 'Total', tr: 'Toplam' },
    cadence: { fr: 'Cadence', ar: 'الوتيرة', en: 'Rate', es: 'Cadencia', pt: 'Cadência', tr: 'Tempo' },
    cadenceMesuree: { fr: 'Cadence mesurée au chronomètre', ar: 'وتيرة مقيسة بالكرونومتر', en: 'Rate measured with the stopwatch', es: 'Cadencia medida con cronómetro', pt: 'Cadência medida com cronómetro', tr: 'Kronometreyle ölçülen tempo' },
    cadenceGamme: { fr: 'Cadence prévue par la gamme (pas encore chronométrée)', ar: 'الوتيرة المتوقّعة من الگام (مازال بلا كرونومتراج)', en: 'Rate expected from the gamme (not timed yet)', es: 'Cadencia prevista por la gama (aún sin cronometrar)', pt: 'Cadência prevista pela gama (ainda sem cronometragem)', tr: 'Gamme’ın öngördüğü tempo (henüz ölçülmedi)' },
    creneauEnCours: { fr: 'Creneau en cours', ar: 'الفترة الجارية', en: 'Current slot', es: 'Franja actual', pt: 'Faixa atual', tr: 'Gecerli dilim' },
    productionHeure: { fr: 'Production de ce creneau', ar: 'إنتاج هاد الفترة', en: 'Output of this slot', es: 'Produccion de esta franja', pt: 'Producao desta faixa', tr: 'Bu dilimin uretimi' },
    creneauPrecedent: { fr: 'Creneau precedent', ar: 'الفترة السابقة', en: 'Previous slot', es: 'Franja anterior', pt: 'Faixa anterior', tr: 'Onceki dilim' },
    creneauSuivant: { fr: 'Creneau suivant', ar: 'الفترة الموالية', en: 'Next slot', es: 'Franja siguiente', pt: 'Faixa seguinte', tr: 'Sonraki dilim' },
    sansOuvrier: { fr: 'Sans ouvrier', ar: 'بلا عامل', en: 'No worker', es: 'Sin operario', pt: 'Sem operario', tr: 'Isci yok' },
    repos: { fr: 'Aucun suivi — jour de repos', ar: 'ما كاين حتى سويفي — نهار ريبو', en: 'No tracking — rest day', es: 'Sin seguimiento — dia de descanso', pt: 'Sem acompanhamento — dia de descanso', tr: 'Takip yok — dinlenme gunu' },
    reposHint: { fr: 'Ce jour est ferme dans l’horaire (Admin › Horaires). Rien n’est enregistre tant que vous n’avez pas confirme qu’on a produit.', ar: 'هاد النهار مسدود فالتوقيت (Admin › Horaires). ما كيتسجّل والو حتى تأكّد بلي خدمتو فيه.', en: 'This day is closed in the schedule (Admin › Hours). Nothing is recorded until you confirm production happened.', es: 'Este dia esta cerrado en el horario (Admin › Horarios). No se registra nada hasta que confirme que se produjo.', pt: 'Este dia esta fechado no horario (Admin › Horarios). Nada e registado ate confirmar que houve producao.', tr: 'Bu gun mesaide kapali (Admin › Saatler). Uretim yapildigini onaylayana kadar hicbir sey kaydedilmez.' },
    reposConfirmer: { fr: 'On a produit ce jour — ouvrir le releve', ar: 'خدمنا هاد النهار — حلّ التسجيل', en: 'We produced this day — open the entry', es: 'Se produjo este dia — abrir el registro', pt: 'Houve producao neste dia — abrir o registo', tr: 'Bu gun uretim yapildi — kaydi ac' },
    reposForce: { fr: 'Jour de repos ouvert manuellement : l’horaire du reglage reste inchange.', ar: 'نهار ريبو محلول يدوياً: التوقيت فالإعدادات ما تبدّلش.', en: 'Rest day opened manually: the configured schedule is unchanged.', es: 'Dia de descanso abierto manualmente: el horario configurado no cambia.', pt: 'Dia de descanso aberto manualmente: o horario configurado nao muda.', tr: 'Dinlenme gunu elle acildi: ayarlanan mesai degismedi.' },
    voirOuvrier: { fr: 'Ouvrir la fiche de l’ouvrier', ar: 'افتح بطاقة العامل', en: 'Open the worker sheet', es: 'Abrir la ficha del operario', pt: 'Abrir a ficha do operario', tr: 'Isci kartini ac' },
    tendanceTitre: { fr: 'Ecart avec le poste precedent de la chaine', ar: 'الفرق مع المنصب اللي قبلو فالشين', en: 'Gap with the previous poste on the line', es: 'Diferencia con el puesto anterior de la linea', pt: 'Diferenca com o posto anterior da linha', tr: 'Hattaki onceki istasyonla fark' },
    pauseTag: { fr: 'pause', ar: 'استراحة', en: 'break', es: 'pausa', pt: 'pausa', tr: 'mola' },
    piecesJour: { fr: 'pcs aujourd’hui', ar: 'قطعة اليوم', en: 'pcs today', es: 'pzs hoy', pt: 'pcs hoje', tr: 'bugun adet' },
    releves: { fr: 'Releves du jour', ar: 'تسجيلات اليوم', en: 'Day entries', es: 'Registros del dia', pt: 'Registos do dia', tr: 'Gun kayitlari' },
    relevesHint: { fr: 'Une ligne par poste. Chaque case est ce que le poste a sorti dans ce creneau — elle se corrige.', ar: 'سطر لكل منصب. كل خانة هي اللي خرّج المنصب فديك الفترة — وكتّصحّح.', en: 'One row per poste. Each cell is what the poste produced in that slot — it can be corrected.', es: 'Una fila por puesto. Cada casilla es lo que el puesto produjo en ese tramo — se puede corregir.', pt: 'Uma linha por posto. Cada celula e o que o posto produziu nessa faixa — pode ser corrigida.', tr: 'Istasyon basina bir satir. Her hucre, istasyonun o dilimde urettigidir — duzeltilebilir.' },
    tsPrevu: { fr: 'TS (s)', ar: 'TS (ث)', en: 'TS (s)', es: 'TS (s)', pt: 'TS (s)', tr: 'TS (sn)' },
    tsPrevuTitre: { fr: 'Temps standard par piece, de la gamme', ar: 'الزمن المعياري للقطعة، من الگام', en: 'Standard time per piece, from the gamme', es: 'Tiempo estandar por pieza, de la gama', pt: 'Tempo padrao por peca, da gama', tr: 'Gamme’dan parca basi standart sure' },
    sortieChaine: { fr: 'Sortie chaine', ar: 'خروج الشين', en: 'Line output', es: 'Salida de linea', pt: 'Saida da linha', tr: 'Hat cikisi' },
    sortieChaineTitre: { fr: 'Ce que sort le dernier poste : additionner tous les postes compterait la meme piece a chaque operation.', ar: 'اللي كيخرّج آخر منصب: جمع كل المناصب كيحسب نفس القطعة فكل عملية.', en: 'What the last poste outputs: summing every poste would count the same piece at each operation.', es: 'Lo que saca el ultimo puesto: sumar todos los puestos contaria la misma pieza en cada operacion.', pt: 'O que o ultimo posto produz: somar todos os postos contaria a mesma peca em cada operacao.', tr: 'Son istasyonun cikardigi: tum istasyonlari toplamak ayni parcayi her operasyonda sayardi.' },
    goulot: { fr: 'Goulot', ar: 'عنق الزجاجة', en: 'Bottleneck', es: 'Cuello de botella', pt: 'Estrangulamento', tr: 'Dar bogaz' },
    goulotTitre: { fr: 'Le poste qui produit le moins : c’est lui qui plafonne la chaine.', ar: 'المنصب اللي كينتج أقل: هو اللي كيحدّ الشين.', en: 'The poste producing the least: it caps the whole line.', es: 'El puesto que menos produce: es el que limita la linea.', pt: 'O posto que menos produz: e ele que limita a linha.', tr: 'En az ureten istasyon: hatti o sinirlar.' },
    totalGeneral: { fr: 'Total general', ar: 'المجموع العام', en: 'Grand total', es: 'Total general', pt: 'Total geral', tr: 'Genel toplam' },
    defCourt: { fr: 'Def.', ar: 'عيوب', en: 'Def.', es: 'Def.', pt: 'Def.', tr: 'Hata' },
    defTitre: { fr: 'Defauts du creneau en cours', ar: 'عيوب الفترة الجارية', en: 'Defects of the current slot', es: 'Defectos de la franja actual', pt: 'Defeitos da faixa atual', tr: 'Gecerli dilimin hatalari' },
    reprendreGamme: { fr: 'Reprendre la gamme', ar: 'جيب مناصب الگام', en: 'Take the gamme postes', es: 'Traer los puestos de la gama', pt: 'Trazer os postos da gama', tr: 'Gamme istasyonlarini al' },
    aucunPoste: { fr: 'Aucun poste sur ce releve. Ajoutez ceux que vous suivez : eux seuls apparaitront ici.', ar: 'ما كاين حتى منصب فهاد التسجيل. زيد اللي كتتبّع: غير هوما اللي غادي يبانو هنا.', en: 'No poste on this entry sheet. Add the ones you track: only those will appear here.', es: 'Ningun puesto en este registro. Anada los que sigue: solo esos apareceran aqui.', pt: 'Nenhum posto neste registo. Adicione os que acompanha: so esses aparecerao aqui.', tr: 'Bu kayitta istasyon yok. Takip ettiklerinizi ekleyin: yalnizca onlar gorunur.' },
    definirTS: { fr: 'Definir le temps standard', ar: 'حدّد الزمن المعياري', en: 'Set the standard time', es: 'Definir el tiempo estandar', pt: 'Definir o tempo padrao', tr: 'Standart sureyi belirle' },
    tsAide: { fr: 'Secondes par piece. Sans lui, ni rendement ni prime : il n’y a pas de reference a comparer.', ar: 'ثواني للقطعة. بلاه، لا مردودية لا علاوة: ما كاين مرجع للمقارنة.', en: 'Seconds per piece. Without it, no efficiency and no bonus: there is no reference to compare with.', es: 'Segundos por pieza. Sin el, ni rendimiento ni prima: no hay referencia con la que comparar.', pt: 'Segundos por peca. Sem ele, nem rendimento nem premio: nao ha referencia para comparar.', tr: 'Parca basi saniye. Onsuz ne verim ne prim: karsilastirilacak referans yoktur.' },
    adopterMesure: { fr: 'Adopter le temps mesure', ar: 'اعتمد الزمن المقيس', en: 'Adopt the measured time', es: 'Adoptar el tiempo medido', pt: 'Adotar o tempo medido', tr: 'Olculen sureyi benimse' },
    sansTS: { fr: 'Sans TS', ar: 'بلا زمن معياري', en: 'No standard time', es: 'Sin TE', pt: 'Sem TP', tr: 'Standart sure yok' },
    sansTSTitre: { fr: 'Ce poste n’a pas de temps standard : son rendement et sa prime ne peuvent pas se calculer. Menu ⋮ › Definir le temps standard.', ar: 'هاد المنصب ما عندو زمن معياري: المردودية والعلاوة ما كيتحسبوش. القائمة ⋮ › حدّد الزمن المعياري.', en: 'This poste has no standard time: its efficiency and bonus cannot be computed. Menu ⋮ › Set the standard time.', es: 'Este puesto no tiene tiempo estandar: su rendimiento y prima no se pueden calcular. Menu ⋮ › Definir el tiempo estandar.', pt: 'Este posto nao tem tempo padrao: o rendimento e o premio nao podem ser calculados. Menu ⋮ › Definir o tempo padrao.', tr: 'Bu istasyonun standart suresi yok: verim ve prim hesaplanamaz. Menu ⋮ › Standart sureyi belirle.' },
    menuPoste: { fr: 'Actions du poste', ar: 'إجراءات المنصب', en: 'Poste actions', es: 'Acciones del puesto', pt: 'Acoes do posto', tr: 'Istasyon islemleri' },
    changerOuvrier: { fr: 'Changer l’ouvrier', ar: 'بدّل العامل', en: 'Change the worker', es: 'Cambiar el operario', pt: 'Mudar o operario', tr: 'Isciyi degistir' },
    supprimerPoste: { fr: 'Supprimer le poste', ar: 'مسح المنصب', en: 'Delete the poste', es: 'Eliminar el puesto', pt: 'Eliminar o posto', tr: 'Istasyonu sil' },
    supprimerConfirme: { fr: 'Retirer ce poste de la gamme ? Les releves deja saisis sont conserves, mais le poste disparait de cette liste.', ar: 'تمسح هاد المنصب من الگام؟ التسجيلات اللي دايرين كيبقاو، ولكن المنصب غادي يختافى من هاد اللائحة.', en: 'Remove this poste from the gamme? Entries already recorded are kept, but the poste disappears from this list.', es: '¿Quitar este puesto de la gama? Los registros ya introducidos se conservan, pero el puesto desaparece de esta lista.', pt: 'Remover este posto da gama? Os registos ja feitos sao mantidos, mas o posto desaparece desta lista.', tr: 'Bu istasyon gammeden kaldirilsin mi? Girilen kayitlar korunur, ancak istasyon bu listeden kaybolur.' },
    tendanceChaineTitre: { fr: 'Dernier creneau termine face a la moyenne des precedents', ar: 'آخر فترة سالات مقارنة بمعدّل اللي قبلها', en: 'Last completed slot against the average of the previous ones', es: 'Ultimo tramo terminado frente a la media de los anteriores', pt: 'Ultima faixa terminada face a media das anteriores', tr: 'Tamamlanan son dilim, oncekilerin ortalamasina karsi' },
    jourFutur: { fr: 'Jour a venir — rien a relever encore', ar: 'نهار جاي — مازال ما كاين ما يتسجّل', en: 'Future day — nothing to record yet', es: 'Dia futuro — todavia nada que registrar', pt: 'Dia futuro — ainda nada a registar', tr: 'Gelecek gun — henuz kaydedilecek bir sey yok' },
    jourFuturHint: { fr: 'On ne note que ce qui est deja sorti de la chaine : les cases s’ouvriront le jour venu. Cet OF a ete lance a cette date — passez a aujourd’hui pour saisir la production du jour.', ar: 'كنسجّلو غير اللي خرج من الشين: الخانات غادي يتحلّو ملي يجي النهار. هاد الأمر تلانصا فهاد التاريخ — دوز لليوم باش تسجّل إنتاج النهار.', en: 'Only what has already come off the line is recorded: the cells open when the day comes. This order was launched on that date — switch to today to enter today’s output.', es: 'Solo se anota lo que ya ha salido de la linea: las casillas se abriran ese dia. Esta OF se lanzo en esa fecha — pase a hoy para registrar la produccion.', pt: 'So se regista o que ja saiu da linha: as celulas abrem no proprio dia. Esta OF foi lancada nessa data — passe para hoje para registar a producao.', tr: 'Yalnizca hattan cikmis olan kaydedilir: hucreler o gun gelince acilir. Bu is emri o tarihte baslatildi — bugunun uretimini girmek icin bugune gecin.' },
    ramenerOF: { fr: 'Commencer cet OF aujourd’hui', ar: 'بدا هاد الأمر اليوم', en: 'Start this order today', es: 'Empezar esta OF hoy', pt: 'Comecar esta OF hoje', tr: 'Bu is emrini bugun baslat' },
    ramenerOFConfirme: { fr: 'Decaler cet OF pour qu’il commence aujourd’hui ? Sa duree est conservee, la date de livraison (DDS) ne bouge pas.', ar: 'تزحزح هاد الأمر باش يبدا اليوم؟ المدة كتبقى كيف ما هي، وتاريخ التسليم (DDS) ما كيتبدلش.', en: 'Shift this order so it starts today? Its duration is kept, the due date (DDS) does not move.', es: '¿Desplazar esta OF para que empiece hoy? Se conserva su duracion, la fecha de entrega (DDS) no cambia.', pt: 'Deslocar esta OF para comecar hoje? A duracao e mantida, a data de entrega (DDS) nao muda.', tr: 'Bu is emri bugun baslayacak sekilde kaydirilsin mi? Suresi korunur, teslim tarihi (DDS) degismez.' },
    allerAujourdhui: { fr: 'Aller a aujourd’hui', ar: 'سير لليوم', en: 'Go to today', es: 'Ir a hoy', pt: 'Ir para hoje', tr: 'Bugune git' },
    creneauFutur: { fr: 'Creneau pas encore passe', ar: 'الفترة مازال ما دازت', en: 'Slot has not happened yet', es: 'Tramo aun no transcurrido', pt: 'Faixa ainda nao decorrida', tr: 'Dilim henuz gecmedi' },
    creationInterdite: { fr: 'Votre compte ne peut pas creer de fiche ouvrier — demandez a Gestion RH.', ar: 'حسابك ما يقدرش يخلق بطاقة عامل — طلب من Gestion RH.', en: 'Your account cannot create worker files — ask HR.', es: 'Su cuenta no puede crear fichas de operario — pida a RRHH.', pt: 'A sua conta nao pode criar fichas de operario — peca ao RH.', tr: 'Hesabiniz isci karti olusturamaz — IK ile gorusun.' },
    creationRefusee: { fr: 'Creation refusee — verifiez le matricule et le CIN.', ar: 'الإنشاء مرفوض — تحقق من رقم التسجيل والبطاقة الوطنية.', en: 'Creation refused — check the staff number and ID.', es: 'Creacion rechazada — compruebe la matricula y el DNI.', pt: 'Criacao recusada — verifique a matricula e o BI.', tr: 'Olusturma reddedildi — sicil no ve kimligi kontrol edin.' },
    aucunOuvrier: { fr: 'Aucun ouvrier enregistre — Gestion RH', ar: 'ما كاين حتى عامل مسجّل — Gestion RH', en: 'No worker registered — HR', es: 'Ningun operario registrado — RRHH', pt: 'Nenhum operario registado — RH', tr: 'Kayitli isci yok — IK' },
    chronoPieces: { fr: 'Pieces / tour', ar: 'قطع / دورة', en: 'Pieces / lap', es: 'Piezas / vuelta', pt: 'Pecas / volta', tr: 'Parca / tur' },
    chronoPiecesTitre: { fr: 'Combien de pieces sortent d’un cycle chronometre. Deux pieces par cycle valent un temps par piece deux fois plus court.', ar: 'شحال من قطعة كتخرج من سيكل واحد. جوج قطع فالسيكل = الزمن للقطعة نص.', en: 'How many pieces come out of one timed cycle. Two pieces per cycle halves the time per piece.', es: 'Cuantas piezas salen de un ciclo cronometrado. Dos piezas por ciclo reducen a la mitad el tiempo por pieza.', pt: 'Quantas pecas saem de um ciclo cronometrado. Duas pecas por ciclo reduzem para metade o tempo por peca.', tr: 'Olculen bir dongude kac parca cikar. Dongu basina iki parca, parca suresini yariya indirir.' },
    chronoMaj: { fr: 'Majoration', ar: 'المجورة', en: 'Allowance', es: 'Mayoracion', pt: 'Majoracao', tr: 'Pay' },
    chronoMajTitre: { fr: 'Coefficient d’aisance du textile (repos, fatigue, aleas) : temps majore = temps mesure × majoration.', ar: 'معامل السماح فالنسيج (راحة، تعب، طوارئ): الزمن المجوّر = الزمن المقيس × المجورة.', en: 'Textile allowance coefficient (rest, fatigue, contingencies): allowed time = measured time × allowance.', es: 'Coeficiente de holgura textil (descanso, fatiga, imprevistos): tiempo mayorado = tiempo medido × mayoracion.', pt: 'Coeficiente de folga textil (descanso, fadiga, imprevistos): tempo majorado = tempo medido × majoracao.', tr: 'Tekstil pay katsayisi (dinlenme, yorgunluk, aksama): payli sure = olculen sure × pay.' },
    chronoTMaj: { fr: 'T. majore', ar: 'الزمن المجوّر', en: 'Allowed time', es: 'T. mayorado', pt: 'T. majorado', tr: 'Payli sure' },
    chronoPH: { fr: 'P / H', ar: 'قطعة / ساعة', en: 'P / H', es: 'P / H', pt: 'P / H', tr: 'P / S' },
    chronoPHTitre: { fr: '3600 / temps majore par piece : ce que le poste sort en une heure a ce rythme.', ar: '3600 / الزمن المجوّر للقطعة: شنو كيخرّج المنصب فساعة بهاد الوتيرة.', en: '3600 / allowed time per piece: what the poste outputs in an hour at this pace.', es: '3600 / tiempo mayorado por pieza: lo que el puesto saca en una hora a este ritmo.', pt: '3600 / tempo majorado por peca: o que o posto produz numa hora a este ritmo.', tr: '3600 / parca basi payli sure: istasyonun bu tempoda saatte urettigi.' },
    objectif: { fr: 'Objectif', ar: 'الهدف', en: 'Target', es: 'Objetivo', pt: 'Objetivo', tr: 'Hedef' },
    objectifTitre: { fr: 'Ce que le poste doit sortir : 3600 / temps standard majore, ramene a la duree du creneau.', ar: 'اللي خاص المنصب يخرّج: 3600 / الزمن المعياري المجوّر، منسوب لمدّة الفترة.', en: 'What the poste must output: 3600 / allowed standard time, scaled to the slot duration.', es: 'Lo que el puesto debe sacar: 3600 / tiempo estandar mayorado, ajustado a la duracion del tramo.', pt: 'O que o posto deve produzir: 3600 / tempo padrao majorado, ajustado a duracao da faixa.', tr: 'Istasyonun uretmesi gereken: 3600 / payli standart sure, dilim suresine oranlanir.' },
    objectifCreneau: { fr: 'Objectif du creneau', ar: 'هدف الفترة', en: 'Slot target', es: 'Objetivo del tramo', pt: 'Objetivo da faixa', tr: 'Dilim hedefi' },
    chronoGarder: { fr: 'Enregistrer ce chrono', ar: 'حفظ هاد الكرونو', en: 'Save this timing', es: 'Guardar este cronometraje', pt: 'Guardar esta cronometragem', tr: 'Bu olcumu kaydet' },
    chronoRefaire: { fr: 'Refaire', ar: 'عاود', en: 'Redo', es: 'Repetir', pt: 'Repetir', tr: 'Yeniden' },
    chronoGarde: { fr: 'Chrono enregistre — temps standard et cadence a jour', ar: 'الكرونو تسجّل — الزمن المعياري والوتيرة تحدّثو', en: 'Timing saved — standard time and rate updated', es: 'Cronometraje guardado — tiempo estandar y cadencia actualizados', pt: 'Cronometragem guardada — tempo padrao e cadencia atualizados', tr: 'Olcum kaydedildi — standart sure ve tempo guncel' },
    chronoQuestion: { fr: 'Garder cette mesure comme temps du poste ?', ar: 'نحفظو هاد القياس كزمن المنصب؟', en: 'Keep this measure as the poste time?', es: 'Guardar esta medida como tiempo del puesto?', pt: 'Guardar esta medida como tempo do posto?', tr: 'Bu olcumu istasyon suresi olarak sakla?' },
    chronoTour: { fr: 'Tour', ar: 'دورة', en: 'Lap', es: 'Vuelta', pt: 'Volta', tr: 'Tur' },
    chronoTTour: { fr: 'T. tour', ar: 'زمن الدورة', en: 'Lap time', es: 'T. vuelta', pt: 'T. volta', tr: 'Tur suresi' },
    chronoTTotal: { fr: 'T. total', ar: 'الزمن الكلي', en: 'Total time', es: 'T. total', pt: 'T. total', tr: 'Toplam sure' },
    chronoEffacer: { fr: 'Effacer', ar: 'مسح', en: 'Clear', es: 'Borrar', pt: 'Limpar', tr: 'Temizle' },
    chronoAnnuler: { fr: 'Annuler', ar: 'تراجع', en: 'Undo', es: 'Deshacer', pt: 'Anular', tr: 'Geri al' },
    chronoArret: { fr: 'Arret', ar: 'وقف', en: 'Stop', es: 'Parar', pt: 'Parar', tr: 'Dur' },
    chronoDebut: { fr: 'Debut', ar: 'ابدأ', en: 'Start', es: 'Iniciar', pt: 'Iniciar', tr: 'Basla' },
    chronoMoyenne: { fr: 'Moyenne / piece', ar: 'المعدّل / قطعة', en: 'Average / piece', es: 'Media / pieza', pt: 'Media / peca', tr: 'Ortalama / parca' },
    chronoAide: { fr: 'Un tour = un cycle du poste. La moyenne des tours devient le temps par piece mesure.', ar: 'دورة = سيكل ديال المنصب. معدّل الدورات كيولّي هو الزمن المقيس للقطعة.', en: 'One lap = one cycle of the poste. The lap average becomes the measured time per piece.', es: 'Una vuelta = un ciclo del puesto. La media de vueltas es el tiempo medido por pieza.', pt: 'Uma volta = um ciclo do posto. A media das voltas torna-se o tempo medido por peca.', tr: 'Bir tur = istasyonun bir dongusu. Tur ortalamasi olculen parca suresi olur.' },
    chronoTitre: { fr: 'Chronometrer ce poste', ar: 'قيس زمن هاد المنصب', en: 'Time this poste', es: 'Cronometrar este puesto', pt: 'Cronometrar este posto', tr: 'Bu istasyonu olc' },
    chronoSansPieces: { fr: 'Notez d’abord des pieces dans le creneau en cours : le temps mesure s’y rattache.', ar: 'سجّل الأول القطع فالفترة الجارية: الزمن المقيس كيتربط بيها.', en: 'Record pieces in the current slot first: the measured time attaches to it.', es: 'Registre primero piezas en la franja actual: el tiempo medido se asocia a ella.', pt: 'Registe primeiro pecas na faixa atual: o tempo medido associa-se a ela.', tr: 'Once gecerli dilime parca girin: olculen sure ona baglanir.' },
    primeJour: { fr: 'Jour', ar: 'اليوم', en: 'Day', es: 'Día', pt: 'Dia', tr: 'Gün' },
    primeSemaine: { fr: 'Semaine', ar: 'الأسبوع', en: 'Week', es: 'Semana', pt: 'Semana', tr: 'Hafta' },
    prime: { fr: 'Prime', ar: 'العلاوة', en: 'Bonus', es: 'Prima', pt: 'Prémio', tr: 'Prim' },
    primeAucuneRegle: { fr: "Aucune règle de prime réglée — Admin › Paramètres entreprise.", ar: 'ما كايناش قاعدة ديال العلاوة — Admin › إعدادات الشركة.', en: 'No bonus rule set — Admin › Company settings.', es: 'Sin regla de prima definida — Admin › Ajustes de empresa.', pt: 'Sem regra de prémio definida — Admin › Definições da empresa.', tr: 'Prim kuralı ayarlanmadı — Admin › Şirket ayarları.' },
    postesMaitrises: { fr: 'Postes tenus (meilleur score en tête)', ar: 'المناصب اللي كيتقنها (الأحسن أولاً)', en: 'Postes held (best score first)', es: 'Puestos cubiertos (mejor puntuación primero)', pt: 'Postos ocupados (melhor pontuação primeiro)', tr: 'Tutulan istasyonlar (en iyi puan önce)' },
};

// Retourne le bloc horaire (cle+label) qui contient l'heure courante, ou le dernier bloc passe.
function currentHourBlock(hours: string[], keys: string[]): { key: string; label: string } {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    let idx = 0;
    for (let i = 0; i < hours.length; i++) {
        const [h, m] = hours[i].split(':').map(Number);
        const startMin = (h || 0) * 60 + (m || 0);
        if (startMin <= nowMin) idx = i; else break;
    }
    return { key: keys[idx] || keys[0] || 'h0800', label: hours[idx] || hours[0] || '08:00' };
}

function todayStr(): string {
    return new Date().toISOString().split('T')[0];
}

export default function SuiviPostes({ models, planningEvents, settings, chainsList, selectedChaineId, setSelectedChaineId, globalDate, setGlobalDate, onOpenGamme, onAddPoste, onRemovePoste, onSetPosteTemps, focusPlanningId, onFocusPlanningConsumed, onDeplacerOFAujourdhui }: Props) {
    const { lang } = useLang();
    /* Le releve se fait au pied de la chaine, telephone en main : un tableau
       de douze colonnes n'y tient pas. Sur petit ecran, les creneaux se lisent
       donc en liste sous chaque poste — la forme du Suivi. */
    const isMobile = useIsMobile();
    const date = globalDate || todayStr();

    const [posteSuivis, setPosteSuivis] = useState<PosteSuiviData[]>([]);
    const [workers, setWorkers] = useState<HRWorker[]>([]);
    const [loading, setLoading] = useState(true);
    const [chronoOpenFor, setChronoOpenFor] = useState<string | null>(null);
    /* Creneau montre sur telephone : celui de MAINTENANT, comme le carnet qu'on
       tient au pied de la chaine. Deplacable d'une fleche pour rattraper l'heure
       d'avant sans changer de page. `null` = suivre l'heure qui tourne. */
    const [creneauVise, setCreneauVise] = useState<string | null>(null);

    /** Poste dont le menu « ⋮ » est ouvert. */
    const [menuPosteId, setMenuPosteId] = useState<string | null>(null);
    /** Poste dont on est en train de changer l'ouvrier (le selecteur s'affiche). */
    const [changementOuvrier, setChangementOuvrier] = useState<string | null>(null);

    /** Ouvrier dont la fiche est ouverte (son historique complet). */
    const [ficheOuvrierId, setFicheOuvrierId] = useState<string | null>(null);

    // Chargement initial : releves poste_suivi + liste des ouvriers actifs (Gestion RH)
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const [rSuivi, rWorkers] = await Promise.all([
                    fetch('/api/poste-suivi', { credentials: 'include' }),
                    fetch('/api/hr/workers?active=1', { credentials: 'include' }),
                ]);
                const dataSuivi = rSuivi.ok ? await rSuivi.json() : [];
                const dataWorkers = rWorkers.ok ? await rWorkers.json() : [];
                if (!cancelled) {
                    setPosteSuivis(Array.isArray(dataSuivi) ? dataSuivi : []);
                    setWorkers(Array.isArray(dataWorkers) ? dataWorkers : []);
                }
            } catch (e) {
                console.error('SuiviPostes: chargement error', e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    /* Les creneaux sont ceux du jour saisi : sinon un vendredi personnalise
       proposerait les heures des autres jours, et l'objectif du creneau (donc le
       score de l'ouvrier) serait calcule sur une duree qui n'existe pas. */
    /* Jours de repos que l'utilisateur a confirmes comme travailles (rattrapage,
       samedi exceptionnel). Garde par navigateur : c'est une decision d'affichage,
       pas une donnee de production — celle-ci vit dans les releves eux-memes. */
    const [joursForces, setJoursForces] = useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem('bera_suivi_postes_jours_forces') || '[]'); } catch { return []; }
    });
    const forcerJour = (jour: string) => {
        setJoursForces(prev => {
            if (prev.includes(jour)) return prev;
            const suite = [...prev, jour];
            try { localStorage.setItem('bera_suivi_postes_jours_forces', JSON.stringify(suite)); } catch { /* navigation privee */ }
            return suite;
        });
    };

    /* Un jour ferme qui porte DEJA des releves est ouvert de lui-meme : la
       donnee prouve qu'on y a produit, la redemander serait absurde. */
    const jourDejaReleve = useMemo(
        () => posteSuivis.some(r => r.date === date && (r.pieces_sorties || 0) > 0),
        [posteSuivis, date],
    );
    const jourForce = joursForces.includes(date) || jourDejaReleve;
    /* Date posterieure a aujourd'hui : aucune case n'acceptera de chiffre, car on
       ne releve que ce qui est deja sorti de la chaine. Compare en jours, pas en
       heures : aujourd'hui n'est jamais « a venir », meme a 6 h du matin. */
    const jourAVenir = useMemo(() => {
        if (!date) return false;
        return date > todayStr();
    }, [date]);

    const hourGrid = useMemo(
        () => deriveHourGrid(settings, date ? new Date(date) : undefined, { ignorerFermeture: jourForce }),
        [settings, date, jourForce],
    );
    const nowBlock = useMemo(() => currentHourBlock(hourGrid.hours, hourGrid.keys), [hourGrid]);

    /* TOUS les OF de la chaine qui couvrent la date, et on en choisit un — comme
       sur la grille horaire. Avant, le premier trouve gagnait en silence : deux OF
       sur la meme chaine et le second etait tout simplement introuvable ici. Un OF
       marque `Terminé` ne se propose plus : il n'a plus rien a relever. */
    const planningsChaine = useMemo(() => planningEvents.filter(p => {
        if (p.chaineId !== selectedChaineId) return false;
        if (p.status === 'DONE') return false;
        const start = (p.startDate || p.dateLancement || '').split('T')[0];
        const end = (p.estimatedEndDate || p.dateExport || p.dateFin || start).split('T')[0];
        return start <= date && end >= date;
    }), [planningEvents, selectedChaineId, date]);

    /* Aucun OF ce jour-la ne veut pas dire aucun OF. Sans cette liste, la page
       s'arretait sur « aucun modele planifie » et ne disait pas OU les trouver :
       il fallait deviner la bonne date en la changeant a l'aveugle. */
    const jourDeLOF = (p: PlanningEvent) => (p.startDate || p.dateLancement || '').split('T')[0];
    const ofsAutresDates = useMemo(() => {
        const ancre = Date.parse(date);
        return planningEvents
            .filter(p => p.chaineId === selectedChaineId && p.status !== 'DONE' && jourDeLOF(p))
            .sort((a, b) => Math.abs(Date.parse(jourDeLOF(a)) - ancre) - Math.abs(Date.parse(jourDeLOF(b)) - ancre))
            .slice(0, 4);
    }, [planningEvents, selectedChaineId, date]);

    /* OF de la chaine qui ne couvrent PAS la date affichee. Le selecteur de
       modele ne montrait que ceux du jour : un seul OF ce jour-la, et le menu
       n'offrait qu'une entree — impossible de changer de modele sans deviner la
       bonne date au calendrier. Les voici, avec leur jour ; les choisir y emmene. */
    const ofsHorsDate = useMemo(() => {
        const ici = new Set(planningsChaine.map(p => p.id));
        return planningEvents
            .filter(p => p.chaineId === selectedChaineId && p.status !== 'DONE' && !ici.has(p.id) && jourDeLOF(p))
            .sort((a, b) => jourDeLOF(a).localeCompare(jourDeLOF(b)));
    }, [planningEvents, selectedChaineId, planningsChaine]);

    /* Dernier OF sur lequel on a releve : c'est celui qu'on rouvre. Sans cette
       memoire, revenir sur la page reprenait le premier OF de la liste — et on
       saisissait la production d'un modele sous un autre. */
    const CLE_DERNIER_OF = 'bera_suivi_postes_dernier_of';
    const [selectedPlanningId, setSelectedPlanningId] = useState<string>('');
    const [modeleOuvert, setModeleOuvert] = useState(false);

    const choisirPlanning = (id: string) => {
        setSelectedPlanningId(id);
        setModeleOuvert(false);
        try { localStorage.setItem(CLE_DERNIER_OF, id); } catch { /* navigation privee */ }
    };

    /* Une arrivee directe depuis la Bibliotheque impose SON OF : la memoire locale
       du dernier releve, elle, ne vaut que pour un retour ordinaire sur la page. */
    useEffect(() => {
        if (!focusPlanningId) return;
        if (!planningsChaine.some(p => p.id === focusPlanningId)) return;
        choisirPlanning(focusPlanningId);
        onFocusPlanningConsumed?.();
    }, [focusPlanningId, planningsChaine]);

    useEffect(() => {
        if (planningsChaine.length === 0) { setSelectedPlanningId(''); return; }
        if (focusPlanningId && planningsChaine.some(p => p.id === focusPlanningId)) return;
        if (planningsChaine.some(p => p.id === selectedPlanningId)) return;
        let dernier = '';
        try { dernier = localStorage.getItem(CLE_DERNIER_OF) || ''; } catch { /* ignore */ }
        const repris = planningsChaine.find(p => p.id === dernier);
        setSelectedPlanningId((repris || planningsChaine[0]).id);
    }, [planningsChaine, selectedPlanningId]);

    const activePlanning = useMemo(
        () => planningsChaine.find(p => p.id === selectedPlanningId) || planningsChaine[0] || null,
        [planningsChaine, selectedPlanningId],
    );

    const activeModel = useMemo(() => {
        if (!activePlanning) return null;
        return models.find(m => m.id === activePlanning.modelId) || null;
    }, [models, activePlanning]);

    /* Les postes du releve, et eux seuls. La gamme n'alimente plus cette liste
       automatiquement : elle sert au prix de revient et contient des operations
       qu'on ne releve pas au pied de la chaine. Tant que `suiviPostes` n'existe
       pas, on reprend une fois ce qui avait ete pose dans la gamme depuis cette
       page — sans quoi les postes deja crees disparaitraient. */
    const postes: Operation[] = useMemo(() => {
        if (!activeModel) return [];
        if (activeModel.suiviPostes) return activeModel.suiviPostes;
        /* Repli, le temps qu'un premier ajout fixe la liste : uniquement les
           operations de la gamme QUI ONT DEJA ETE RELEVEES. Prendre la gamme
           entiere remplirait l'ecran d'operations qu'on ne suit pas au pied de
           la chaine ; n'en prendre aucune ferait disparaitre les postes deja
           crees ici. Ce qui a servi reste, le reste se reprend a la demande. */
        const relevees = new Set(posteSuivis.filter(r => r.modelId === activeModel.id).map(r => r.posteId));
        return (activeModel.gamme_operatoire || []).filter(op => relevees.has(op.id));
    }, [activeModel, posteSuivis]);

    /** Operations de la gamme qu'on pourrait encore reprendre dans ce releve. */
    const gammeNonReprise: Operation[] = useMemo(() => {
        if (!activeModel) return [];
        const presents = new Set(postes.map(p => p.id));
        return (activeModel.gamme_operatoire || []).filter(op => !presents.has(op.id));
    }, [activeModel, postes]);

    // Ouvriers proposes : ceux de la chaine en priorite, puis les autres, tries par nom.
    const workersSorted = useMemo(() => {
        const list = [...workers];
        list.sort((a, b) => {
            const aChain = a.chaine_id === selectedChaineId ? 0 : 1;
            const bChain = b.chaine_id === selectedChaineId ? 0 : 1;
            if (aChain !== bChain) return aChain - bChain;
            return (a.full_name || '').localeCompare(b.full_name || '');
        });
        return list;
    }, [workers, selectedChaineId]);

    // Releves du jour pour la chaine active, regroupes par poste.
    const suivisByPoste = useMemo(() => {
        const map = new Map<string, PosteSuiviData[]>();
        posteSuivis.forEach(s => {
            if (s.date !== date || !activePlanning || s.planningId !== activePlanning.id) return;
            const arr = map.get(s.posteId) || [];
            arr.push(s);
            map.set(s.posteId, arr);
        });
        return map;
    }, [posteSuivis, date, activePlanning]);

    // Etat de saisie courant par poste : ouvrier choisi, quantite, defauts, temps chrono.
    const [draftByPoste, setDraftByPoste] = useState<Record<string, { workerId: string; workerName: string; qty: number | ''; defauts: number | ''; tempsMs: number | null }>>({});

    const getDraft = (posteId: string) => draftByPoste[posteId] || { workerId: '', workerName: '', qty: '', defauts: '', tempsMs: null };
    const setDraft = (posteId: string, patch: Partial<{ workerId: string; workerName: string; qty: number | ''; defauts: number | ''; tempsMs: number | null }>) => {
        setDraftByPoste(prev => ({ ...prev, [posteId]: { ...getDraft(posteId), ...patch } }));
    };

    /* ─── Grille du jour : un poste par ligne, les creneaux du jour en colonnes ───
       Le releve rapide ci-dessous ne remplit que le creneau EN COURS : on ne
       pouvait donc pas rattraper une heure passee, ni relire la journee poste par
       poste. La grille, elle, montre et accepte les heures du jour entier, avec
       exactement les creneaux de CE jour (donc l'exception du vendredi comprise). */
    const idCellule = (posteId: string, hourKey: string) => `${activePlanning?.id}-${posteId}-${date}-${hourKey}`;

    const celluleDe = (posteId: string, hourKey: string): PosteSuiviData | undefined =>
        posteSuivis.find(s => s.id === idCellule(posteId, hourKey));

    /* L'ouvrier tenu sur un poste vaut pour la journee : on prend celui du premier
       releve du jour, sinon celui choisi dans la saisie rapide. */
    const ouvrierDuPoste = (posteId: string): string => {
        const rows = suivisByPoste.get(posteId) || [];
        const avecOuvrier = rows.find(r => r.workerId);
        return String(avecOuvrier?.workerId || getDraft(posteId).workerId || '');
    };

    /** Nom libre saisi pour ce poste, quand l'ouvrier n'a pas de fiche RH. */
    const nomLibreDuPoste = (posteId: string): string => {
        const rows = suivisByPoste.get(posteId) || [];
        return rows.find(r => r.workerName)?.workerName || getDraft(posteId).workerName || '';
    };

    /* Creation d'une fiche RH depuis le pied de la chaine. Le fichier du
       personnel se remplit rarement d'avance : la personne est la, elle produit,
       et l'envoyer saisir son dossier dans Gestion RH ferait perdre le releve en
       cours. La fiche creee ici est une fiche RH ordinaire — elle porte donc son
       matricule (obligatoire et unique, c'est lui qui identifie la personne dans
       la paie) et son CIN si on l'a. */
    const creerOuvrier = async (fiche: { full_name: string; matricule: string; cin?: string; chaine_id?: string }): Promise<HRWorker> => {
        const res = await fetch('/api/hr/workers', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                full_name: fiche.full_name,
                matricule: fiche.matricule,
                // Champ UNIQUE : une chaine vide ferait doublon d'une fiche a l'autre.
                cin: fiche.cin || undefined,
                chaine_id: fiche.chaine_id || undefined,
                role: 'OPERATOR',
                is_active: true,
            }),
        });
        const corps = await res.json().catch(() => ({} as any));
        if (!res.ok) {
            /* Un refus de DROITS ne renvoie pas de message (`{ ok, code }`) : sans
               ce cas, on accusait le matricule d'un probleme qui n'a rien a voir,
               et l'utilisateur corrigeait indefiniment une saisie correcte. */
            if (res.status === 403 || corps?.code === 'PERMISSION_DENIED') {
                throw new Error(tx(lang, L.creationInterdite));
            }
            // Sinon le serveur distingue matricule deja pris et CIN en double : son
            // message est le seul a dire laquelle des deux contraintes a cede.
            throw new Error(corps?.message || tx(lang, L.creationRefusee));
        }
        const creee: HRWorker = {
            id: String(corps?.id || ''),
            matricule: fiche.matricule,
            full_name: fiche.full_name,
            cin: fiche.cin,
            role: 'OPERATOR',
            chaine_id: fiche.chaine_id,
            date_embauche: new Date().toISOString(),
            type_contrat: 'CDI',
            is_active: true,
        } as HRWorker;
        // La liste locale l'accueille tout de suite : la relecture RH n'a lieu
        // qu'au montage de la page, et on choisit la personne dans la seconde.
        setWorkers(prev => [...prev, creee]);
        return creee;
    };

    /* Ajout d'un poste depuis cette page. L'operation part dans la gamme du
       modele (source unique), et l'ouvrier choisi a la creation prend la main
       tout de suite sur la saisie du poste — sinon il faudrait le re-choisir. */
    const ajouterPoste = async (op: Operation, nomSaisi: string) => {
        if (!activeModel || !onAddPoste) return;
        await onAddPoste(activeModel.id, op);
        const saisi = nomSaisi.trim();
        if (!saisi) return;
        const fiche = workers.find(w => (w.full_name || '').trim().toLowerCase() === saisi.toLowerCase());
        setDraft(op.id, { workerId: fiche ? String(fiche.id) : '', workerName: saisi });
    };

    /* Reprise explicite : on verse dans le releve les operations de la gamme qui
       n'y sont pas encore. Une par une, dans l'ordre, pour que chacune garde son
       identifiant — c'est lui qui relie les releves deja faits. */
    const reprendreGamme = async () => {
        if (!activeModel || !onAddPoste) return;
        await onAddPoste(activeModel.id, gammeNonReprise);
    };

    /* Retirer un poste NE detruit aucun releve : les lignes de poste_suivi
       gardent leur trace, seule la gamme perd la ligne. On le dit avant, sinon
       l'utilisateur croit effacer sa journee. */
    const supprimerPoste = async (poste: Operation) => {
        if (!activeModel || !onRemovePoste) return;
        setMenuPosteId(null);
        await onRemovePoste(activeModel.id, poste.id);
    };

    /* Objectif d'un poste : ce qu'il DOIT sortir, deduit du temps standard.
           pieces / heure  = 3600 / TS (secondes, majoration comprise)
           objectif creneau = pieces/heure x duree du creneau / 60
       Le TS porte deja l'aisance, donc l'objectif est tenable une journee
       entiere — c'est la difference entre une cadence de pointe et une cadence
       de production. Sans TS, aucun objectif : on n'en invente pas. */
    const objectifPoste = (poste: Operation): { parHeure: number; parCreneau: number } | null => {
        if (!(poste.time > 0)) return null;
        const tsSec = poste.time * 60;
        const parHeure = Math.round(3600 / tsSec);
        const bloc = hourGrid.blocks.find(b => b.key === nowBlock.key);
        const minutes = bloc ? Math.max(5, bloc.duration) : 60;
        return { parHeure, parCreneau: Math.round((parHeure * minutes) / 60) };
    };

    /** Temps mesure au chrono sur ce poste (secondes/piece), s'il en existe un. */
    const mesureChronoSec = (posteId: string): number | null => {
        const rows = suivisByPoste.get(posteId) || [];
        const mesure = rows.find(r => r.temps_reel_par_piece && r.temps_reel_par_piece > 0)?.temps_reel_par_piece;
        return mesure ? Number((mesure * 60).toFixed(1)) : null;
    };

    /** Nom de l'ouvrier qui tient le poste aujourd'hui, vide s'il n'y en a pas. */
    const nomOuvrier = (posteId: string): string => {
        const id = ouvrierDuPoste(posteId);
        const fiche = id ? workers.find(w => String(w.id) === String(id)) : undefined;
        return fiche?.full_name || nomLibreDuPoste(posteId);
    };

    /**
     * Ecart d'un poste avec le poste qui le PRECEDE dans la gamme.
     *
     * Comparer un poste a sa propre heure d'avant ne dit rien d'utile : une
     * heure creuse suit une heure pleine sans que rien n'aille mal. Sur une
     * chaine, la question est ailleurs — ce poste suit-il celui qui l'alimente ?
     * En dessous, il accumule un encours ; au-dessus, il a rattrape du retard.
     *
     * Le premier poste n'a personne devant lui : pas d'ecart, et on n'invente
     * rien. Deux postes sans production non plus.
     */
    const ecartPostePrecedent = (poste: Operation): { sens: 'hausse' | 'baisse'; pct: number } | null => {
        const rang = postes.findIndex(p => p.id === poste.id);
        if (rang <= 0) return null;
        const precedent = postes[rang - 1];
        const mien = bilanPosteBrut(poste.id);
        const amont = bilanPosteBrut(precedent.id);
        if (amont <= 0 || mien <= 0) return null;
        const pct = Math.round(((mien - amont) / amont) * 100);
        if (pct === 0) return null;
        return { sens: pct > 0 ? 'hausse' : 'baisse', pct: Math.abs(pct) };
    };

    /* Ce qui SORT de la chaine : le dernier poste de la gamme. Additionner tous
       les postes comptait la meme piece a chaque operation qu'elle traverse —
       cinq postes, cinq pieces pour une seule. */
    const sortieChaineJour = (): number => {
        const dernier = postes[postes.length - 1];
        return dernier ? bilanPosteBrut(dernier.id) : 0;
    };
    const sortieChaineCreneau = (hourKey: string): number => {
        const dernier = postes[postes.length - 1];
        return dernier ? (celluleDe(dernier.id, hourKey)?.pieces_sorties || 0) : 0;
    };

    /* Le SENS DE MARCHE de la chaine, affiche en tete du modele : ce que sort le
       dernier creneau termine, face a la MOYENNE des creneaux termines avant lui.

       La moyenne, et non le seul creneau precedent : une heure creuse isolee
       (panne, changement de coloris, pause decalee) ferait alors basculer la
       fleche a chaque relevé, et une fleche qui change tout le temps ne dit plus
       rien. La moyenne, elle, repond a la question posee — la journee monte-t-elle
       ou descend-elle ?

       On ne compte QUE les creneaux termines : un creneau en cours est incomplet
       par nature, et le retenir ferait plonger la tendance au debut de chaque
       heure, pour remonter a sa fin. */
    const tendanceChaine = useMemo(() => {
        const dernier = postes[postes.length - 1];
        if (!dernier) return null;
        const finis = hourGrid.blocks.filter(b => new Date(date).setHours(0, b.endMin, 0, 0) <= Date.now());
        if (finis.length < 2) return null;
        const valeurs = finis.map(b => celluleDe(dernier.id, b.key)?.pieces_sorties || 0);
        const courant = valeurs[valeurs.length - 1];
        const precedents = valeurs.slice(0, -1);
        const moyenne = precedents.reduce((a, b) => a + b, 0) / precedents.length;
        // Sans reference (rien produit avant), il n'y a pas de tendance : on
        // n'invente pas une hausse a partir de zero.
        if (moyenne <= 0) return null;
        const pct = Math.round(((courant - moyenne) / moyenne) * 100);
        if (pct === 0) return null;
        return { hausse: pct > 0, pct: Math.abs(pct), courant, moyenne: Math.round(moyenne) };
    }, [postes, posteSuivis, hourGrid.blocks, date]);

    /* Le goulot : le poste qui produit le moins parmi ceux qui ont produit.
       C'est lui qui plafonne la chaine — le reste ne sortira jamais plus vite. */
    const goulotDuJour = (): { poste: Operation; pieces: number } | null => {
        const candidats = postes
            .map(p => ({ poste: p, pieces: bilanPosteBrut(p.id) }))
            .filter(x => x.pieces > 0);
        if (candidats.length < 2) return null;
        return candidats.reduce((min, x) => (x.pieces < min.pieces ? x : min), candidats[0]);
    };

    /** Pieces sorties du poste aujourd'hui — la base de l'ecart ci-dessus. */
    const bilanPosteBrut = (posteId: string): number =>
        (suivisByPoste.get(posteId) || []).reduce((somme, r) => somme + (r.pieces_sorties || 0), 0);

    /** Ce qu'il faut savoir d'un poste pour la journee, sous les deux mises en page. */
    const bilanPoste = (poste: Operation) => {
        const rows = suivisByPoste.get(poste.id) || [];
        const total = rows.reduce((somme, r) => somme + (r.pieces_sorties || 0), 0);
        const scores = rows.map(scoreReleve).filter((x): x is number => x !== null);
        const score = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
        return { rows, total, score, mesure: rows.some(scoreChronometre) };
    };

    const [cellSavingId, setCellSavingId] = useState<string | null>(null);

    const persisterCellules = async (payloads: PosteSuiviData[]) => {
        if (payloads.length === 0) return;
        try {
            const res = await fetch('/api/poste-suivi', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ suivis: payloads }),
            });
            if (!res.ok) console.error('SuiviPostes: enregistrement refuse', res.status);
        } catch (e) {
            console.error('SuiviPostes: save cellule error', e);
        }
    };

    /* Une case de la grille porte une valeur ABSOLUE (ce que le poste a sorti
       dans ce creneau), pas un cumul : c'est une correction.

       `ecrireCellule` est le seul chemin d'ecriture d'un creneau — pieces,
       defauts ou temps mesure passent par lui. Avoir deux chemins, c'etait deux
       facons de rater le meme champ. */
    const ecrireCellule = async (poste: Operation, hourKey: string, patch: Partial<PosteSuiviData>) => {
        if (!activePlanning || !activeModel) return;
        const rowId = idCellule(poste.id, hourKey);
        const existing = celluleDe(poste.id, hourKey);
        const workerId = ouvrierDuPoste(poste.id);

        const pieces = patch.pieces_sorties ?? existing?.pieces_sorties ?? 0;
        const defauts = patch.pieces_defaut ?? existing?.pieces_defaut ?? 0;
        const temps = patch.temps_reel_par_piece ?? existing?.temps_reel_par_piece;
        /* Rien a garder : ni pieces, ni defauts, ni mesure. On n'ecrit pas une
           ligne vide qui ferait croire a un releve fait a zero piece. */
        if (!existing && pieces === 0 && defauts === 0 && !temps) return;

        const payload: PosteSuiviData = {
            ...(existing || {} as PosteSuiviData),
            id: rowId,
            planningId: activePlanning.id,
            modelId: activeModel.id,
            posteId: poste.id,
            workerId: workerId || existing?.workerId,
            workerName: nomLibreDuPoste(poste.id) || existing?.workerName,
            date,
            heure_debut: hourKey,
            heure_fin: existing?.heure_fin,
            pieces_entrees: pieces,
            pieces_sorties: pieces,
            pieces_defaut: defauts,
            temps_reel_par_piece: temps,
            temps_prevu_par_piece: poste.time,
            notes: existing?.notes,
            problemes: existing?.problemes || [],
        };

        setCellSavingId(rowId);
        setPosteSuivis(prev => [...prev.filter(s => s.id !== rowId), payload]);
        await persisterCellules([payload]);
        setCellSavingId(cur => (cur === rowId ? null : cur));
    };

    const saveCellule = (poste: Operation, hourKey: string, valeur: number | null) =>
        ecrireCellule(poste, hourKey, { pieces_sorties: valeur ?? 0, pieces_entrees: valeur ?? 0 });

    /* Fixer le temps standard d'un poste.
       On en profite pour combler les releves deja faits qui n'en portaient
       aucun : sans cela, la production d'avant resterait sans rendement pour
       toujours. Un standard DEJA inscrit n'est jamais remplace — on comble un
       vide, on ne reecrit pas une reference. */
    const fixerTempsPoste = async (poste: Operation, tempsSec: number) => {
        if (!activeModel || !onSetPosteTemps) return;
        const tempsMin = tempsSec > 0 ? Number((tempsSec / 60).toFixed(4)) : 0;
        setMenuPosteId(null);
        await onSetPosteTemps(activeModel.id, poste.id, tempsMin);
        if (tempsMin <= 0) return;
        const aCombler = posteSuivis.filter(r =>
            r.posteId === poste.id
            && r.modelId === activeModel.id
            && !(r.temps_prevu_par_piece && r.temps_prevu_par_piece > 0));
        if (aCombler.length === 0) return;
        const majs = aCombler.map(r => ({ ...r, temps_prevu_par_piece: tempsMin }));
        setPosteSuivis(prev => prev.map(x => majs.find(m => m.id === x.id) || x));
        await persisterCellules(majs);
    };

    /* Le chrono mesure UN CYCLE du poste (la moyenne de ses tours) : c'est deja
       un temps par piece. Il ne se divise donc par rien — auparavant on le
       partageait par les pieces du creneau, ce qui donnait un temps d'autant
       plus court qu'on avait produit, et un score qui montait tout seul.

       La gamme et le score comptent en MINUTES ; le chrono en millisecondes. La
       conversion se fait ici, une seule fois : une seconde prise pour une minute
       fausserait le score d'un facteur 60. */
    const appliquerChrono = async (poste: Operation, msParPiece: number, secMajorees?: number) => {
        if (msParPiece <= 0) return;
        const tpp = Number((msParPiece / 60000).toFixed(4));
        await ecrireCellule(poste, nowBlock.key, { temps_reel_par_piece: tpp });

        /* Le temps MAJORE devient le temps standard du poste : c'est la
           definition de la confection — le standard porte l'aisance (repos,
           fatigue, aleas), la mesure brute non. De la sort la cadence :
           3600 / temps majore = pieces par heure.

           On ne remplace un standard deja fixe que si l'utilisateur le redemande
           explicitement (menu ⋮), pour qu'une mesure ponctuelle ne redefinisse
           pas seule la reference d'un poste. */
        if (secMajorees && secMajorees > 0 && !(poste.time > 0)) {
            await fixerTempsPoste(poste, secMajorees);
        }
    };

    /* Changer l'ouvrier d'un poste rejaillit sur TOUS ses releves du jour :
       sinon la moitie de la journee resterait creditee a la personne precedente. */
    const changerOuvrierPoste = async (poste: Operation, nom: string) => {
        const saisi = nom.trim();
        /* Un nom qui correspond exactement a une fiche RH est rattache a elle :
           le releve rejoint alors l'historique de cette personne. Sinon on garde
           le nom tel quel — mieux vaut un prenom qu'un « Sans ouvrier ». */
        const fiche = workers.find(w => (w.full_name || '').trim().toLowerCase() === saisi.toLowerCase());
        const workerId = fiche ? String(fiche.id) : '';
        setDraft(poste.id, { workerId, workerName: saisi });
        const rows = suivisByPoste.get(poste.id) || [];
        if (rows.length === 0) return;
        const majs = rows
            .filter(r => String(r.workerId || '') !== workerId || (r.workerName || '') !== saisi)
            .map(r => ({ ...r, workerId: workerId || undefined, workerName: saisi || undefined }));
        if (majs.length === 0) return;
        setPosteSuivis(prev => prev.map(s => majs.find(m => m.id === s.id) || s));
        await persisterCellules(majs);
    };

    /* Cadence visee d'un poste, en pieces/heure : le temps mesure au chrono s'il
       existe (c'est la realite du poste), sinon le temps prevu par la gamme. */
    const cadencePoste = (poste: Operation): { valeur: number | null; mesuree: boolean } => {
        const rows = suivisByPoste.get(poste.id) || [];
        const mesure = rows.find(r => r.temps_reel_par_piece && r.temps_reel_par_piece > 0)?.temps_reel_par_piece;
        const tpp = mesure || poste.time;
        if (!tpp || tpp <= 0) return { valeur: null, mesuree: false };
        return { valeur: Math.round(60 / tpp), mesuree: !!mesure };
    };

    /* Minutes reellement travaillables dans un creneau : une heure pleine, moins
       ce que la pause lui prend. Sans cela l'objectif d'un creneau coupe par la
       pause serait surevalue et l'ouvrier note trop bas. */
    const minutesCreneau = (heureKey?: string): number => {
        if (!heureKey) return 60;
        /* La grille du jour donne deja la duree REELLE du creneau : elle est
           coupee a la pause (ex. 13:30/14:00 = 30 min), donc pas de soustraction
           a refaire ici. */
        const bloc = hourGrid.blocks.find(b => b.key === heureKey);
        if (bloc) return Math.max(5, bloc.duration);
        // Releve d'une ancienne grille : on retombe sur l'heure pleine moins la pause.
        const hh = Number(heureKey.replace('h', '').slice(0, 2));
        const mm = Number(heureKey.replace('h', '').slice(2, 4));
        if (!Number.isFinite(hh)) return 60;
        const debut = hh * 60 + (Number.isFinite(mm) ? mm : 0);
        const fin = debut + 60;
        // Source unique des pauses (lib/horaires.ts) : évite de dupliquer ici
        // la logique de chevauchement pause/créneau.
        /* Les pauses du JOUR saisi, pas celles du reglage general : un vendredi
           avec une coupure plus longue reduit d'autant l'objectif du creneau. */
        const pause = pauseOverlapMinutes(horairesDuJour(settings, date ? new Date(date) : undefined).pauses, debut, fin);
        return Math.max(5, 60 - pause);
    };

    /* Score d'un releve, par ordre de fiabilite :
       1. Chronometre : temps prevu / temps mesure — c'est la mesure la plus juste.
       2. A defaut, la quantite : ce que le poste a sorti face a ce que la gamme
          permettait de sortir dans le creneau (minutes disponibles / temps prevu).
       Sans temps prevu dans la gamme il n'y a pas de reference, donc pas de note :
       on n'invente jamais un score. */
    const scoreReleve = (r: PosteSuiviData): number | null => {
        if (!r.temps_prevu_par_piece || r.temps_prevu_par_piece <= 0) return null;
        if (r.temps_reel_par_piece && r.temps_reel_par_piece > 0) {
            return Math.round((r.temps_prevu_par_piece / r.temps_reel_par_piece) * 100);
        }
        const pieces = r.pieces_sorties || 0;
        if (pieces <= 0) return null;
        const objectif = minutesCreneau(r.heure_debut) / r.temps_prevu_par_piece;
        if (objectif <= 0) return null;
        return Math.round((pieces / objectif) * 100);
    };

    /* Vrai quand la note vient d'un chronometrage : l'utilisateur doit savoir si
       la note est mesuree ou seulement deduite de la quantite. */
    const scoreChronometre = (r: PosteSuiviData): boolean =>
        !!(r.temps_reel_par_piece && r.temps_reel_par_piece > 0);

    const classeScore = (sc: number) =>
        sc >= 100 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
            : sc >= 80 ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';

    /* Progression : moyenne des scores de chaque ouvrier sur TOUT l'historique
       charge, pas seulement la journee — c'est la raison d'etre du releve. */
    const progression = useMemo(() => {
        type Acc = {
            somme: number; n: number; pieces: number;
            postes: Map<string, { somme: number; n: number }>;
            jour: { somme: number; n: number };
            semaine: { somme: number; n: number };
        };
        /* Bornes de la semaine du jour affiche (lundi → dimanche), pour la prime
           hebdomadaire : sans elles on melangerait des semaines entieres. */
        const ref = new Date(date);
        const dow = ref.getDay() === 0 ? 7 : ref.getDay();
        const lundi = new Date(ref); lundi.setDate(ref.getDate() - (dow - 1));
        const dimanche = new Date(lundi); dimanche.setDate(lundi.getDate() + 6);
        const debutSemaine = lundi.toISOString().split('T')[0];
        const finSemaine = dimanche.toISOString().split('T')[0];

        const parOuvrier = new Map<string, Acc>();
        posteSuivis.forEach(r => {
            if (!r.workerId) return;
            const id = String(r.workerId);
            const acc = parOuvrier.get(id) || {
                somme: 0, n: 0, pieces: 0,
                postes: new Map<string, { somme: number; n: number }>(),
                jour: { somme: 0, n: 0 },
                semaine: { somme: 0, n: 0 },
            };
            const sc = scoreReleve(r);
            if (sc !== null) {
                acc.somme += sc; acc.n += 1;
                /* Le score par poste est ce qui dit quel poste l'ouvrier TIENT
                   vraiment : c'est lui qu'on regarde pour l'affecter la fois
                   suivante, pas sa moyenne generale tous postes confondus. */
                const p = acc.postes.get(r.posteId) || { somme: 0, n: 0 };
                p.somme += sc; p.n += 1;
                acc.postes.set(r.posteId, p);
                if (r.date === date) { acc.jour.somme += sc; acc.jour.n += 1; }
                if (r.date >= debutSemaine && r.date <= finSemaine) { acc.semaine.somme += sc; acc.semaine.n += 1; }
            }
            acc.pieces += r.pieces_sorties || 0;
            if (!acc.postes.has(r.posteId)) acc.postes.set(r.posteId, { somme: 0, n: 0 });
            parOuvrier.set(id, acc);
        });

        const nomPoste = (posteId: string) => {
            for (const m of models) {
                const op = (m.gamme_operatoire || []).find(o => o.id === posteId);
                if (op) return op.description || posteId;
            }
            return posteId;
        };

        const config = configPrimeEffective(settings);
        return Array.from(parOuvrier.entries())
            .map(([id, a]) => {
                const scoreJour = a.jour.n > 0 ? Math.round(a.jour.somme / a.jour.n) : null;
                const scoreSemaine = a.semaine.n > 0 ? Math.round(a.semaine.somme / a.semaine.n) : null;
                /* Prime : on n'en calcule une que si une regle a ete decidee ET que
                   la periode a vraiment ete mesuree. Pas de regle, pas de prime —
                   on n'invente pas un montant que personne n'a fixe. */
                let prime = 0;
                const detailPrime: string[] = [];
                /* Le palier de la periode reglee, et lui seul : deux montants
                   cumules ici alors que la page Primes n'en verse qu'un, c'est
                   une promesse que la paie ne tiendra pas. */
                const scorePeriode = config?.periode === 'jour' ? scoreJour : scoreSemaine;
                const palier = palierAtteint(config?.paliers || [], scorePeriode);
                if (palier) {
                    prime = palier.montant;
                    detailPrime.push(`${tx(lang, config?.periode === 'jour' ? L.primeJour : L.primeSemaine)} ${scorePeriode}% ≥ ${palier.min}%`);
                }
                return {
                    id,
                    nom: workers.find(w => String(w.id) === String(id))?.full_name || id,
                    moyenne: a.n > 0 ? Math.round(a.somme / a.n) : null,
                    pieces: a.pieces,
                    postes: a.postes.size,
                    scoreJour,
                    scoreSemaine,
                    prime,
                    detailPrime,
                    /* Postes maitrises : les mieux tenus d'abord, c'est la reponse a
                       « qui je mets sur ce poste demain ». */
                    postesMaitrises: Array.from(a.postes.entries())
                        .filter(([, v]) => v.n > 0)
                        .map(([pid, v]) => ({ id: pid, nom: nomPoste(pid), score: Math.round(v.somme / v.n) }))
                        .sort((x, y) => y.score - x.score)
                        .slice(0, 4),
                };
            })
            .sort((a, b) => (b.moyenne ?? -1) - (a.moyenne ?? -1));
    }, [posteSuivis, workers, models, date, settings, lang]);

    return (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Barre d'entete : chaines + date, dans le meme esprit que la grille horaire */}
            <div className="shrink-0 bg-white dark:bg-dk-surface border-b border-slate-200 dark:border-dk-border/60 px-3 py-2.5 sm:px-6 sm:py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                    <h2 className="text-[13px] sm:text-sm font-black text-slate-800 dark:text-dk-text truncate">{tx(lang, L.title)}</h2>
                    <p className="hidden sm:block text-[11px] text-slate-400 dark:text-dk-muted font-medium">{tx(lang, L.subtitle)}</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="bg-slate-100 dark:bg-dk-elevated/80 p-0.5 rounded-xl border border-slate-200 dark:border-dk-border/50 flex gap-0.5 overflow-x-auto max-w-[240px] sm:max-w-[400px] no-scrollbar">
                        {chainsList.map(cId => (
                            <button
                                key={cId}
                                type="button"
                                onClick={() => setSelectedChaineId(cId)}
                                className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all shrink-0 min-h-[40px] sm:min-h-0 ${selectedChaineId === cId ? 'bg-white dark:bg-dk-surface text-indigo-900 dark:text-indigo-200 shadow-sm border border-indigo-100 dark:border-indigo-800/50' : 'text-slate-500 dark:text-dk-muted'}`}
                            >
                                {cId}
                            </button>
                        ))}
                    </div>
                    <input
                        type="date"
                        value={date}
                        onChange={(e) => setGlobalDate && setGlobalDate(e.target.value)}
                        className="h-10 sm:h-9 text-[12px] font-bold text-slate-700 dark:text-dk-text bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-2 outline-none"
                    />
                </div>
            </div>

            {/* Modele actif : on CHOISIT l'OF de la chaine, comme sur la grille horaire.
                Sans ce choix, deux OF sur la meme chaine et le second etait invisible. */}
            {planningsChaine.length > 0 && (
                <div className="shrink-0 px-2 sm:px-6 py-1.5 flex items-center gap-2 border-b border-slate-100 dark:border-dk-border/40 bg-white dark:bg-dk-surface">
                    <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-dk-muted">
                        {tx(lang, L.modeleActif)}
                    </span>

                    {/* Le sens de marche, EN TETE du modele : d'un coup d'oeil, la
                        chaine monte ou descend. Le detail chiffre est dans l'infobulle,
                        pour qui veut savoir contre quoi la comparaison se fait. */}
                    {tendanceChaine && (
                        <span
                            title={`${tx(lang, L.tendanceChaineTitre)} : ${tendanceChaine.courant} / ${tendanceChaine.moyenne} pcs`}
                            className={`shrink-0 flex items-center gap-0.5 px-1.5 py-1 rounded-lg text-[10px] font-black tabular-nums ${
                                tendanceChaine.hausse
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                    : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                            }`}
                        >
                            {tendanceChaine.hausse ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {tendanceChaine.pct}%
                        </span>
                    )}

                    {/* Meme repere qu'a la Grille horaire : la photo du modele, sa
                        reference, son nom. On reconnait un modele a sa photo bien
                        avant de lire sa reference. */}
                    <div className="relative min-w-0">
                        <button
                            type="button"
                            onClick={() => setModeleOuvert(o => !o)}
                            className="flex items-center gap-2 max-w-[280px] rounded-xl bg-indigo-50 dark:bg-dk-accent/20 border border-indigo-100 dark:border-dk-border px-2 py-1.5"
                        >
                            {activeModel?.image ? (
                                <img src={activeModel.image} alt="" className="w-7 h-7 rounded-lg object-cover border border-indigo-100 dark:border-dk-border shrink-0" />
                            ) : (
                                <span className="w-7 h-7 rounded-lg border border-indigo-100 dark:border-dk-border bg-white dark:bg-dk-surface flex items-center justify-center shrink-0 text-indigo-300 dark:text-dk-muted">
                                    <ImageIcon className="w-3.5 h-3.5" />
                                </span>
                            )}
                            <span className="min-w-0 text-left">
                                <span className="block text-[12px] font-black text-indigo-900 dark:text-dk-accent-text truncate">
                                    {activeModel?.meta_data?.reference || activePlanning?.modelName || activeModel?.meta_data?.nom_modele || '—'}
                                </span>
                                <span className="block text-[9px] font-bold text-indigo-500/80 dark:text-dk-muted truncate">
                                    {activeModel?.meta_data?.nom_modele || ''}
                                    {activePlanning?.qteTotal ? ` · ${activePlanning.qteTotal} pcs` : ''}
                                </span>
                            </span>
                            <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-indigo-400 dark:text-dk-muted transition-transform ${modeleOuvert ? 'rotate-180' : ''}`} />
                        </button>

                        {modeleOuvert && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setModeleOuvert(false)} />
                                <div className="absolute top-full left-0 mt-2 z-50 w-72 max-h-80 overflow-y-auto rounded-2xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface shadow-xl p-1.5">
                                    {planningsChaine.map(p => {
                                        const m = models.find(x => x.id === p.modelId);
                                        const ref = m?.meta_data?.reference || p.modelName || p.id.slice(0, 8);
                                        const actif = activePlanning?.id === p.id;
                                        return (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => choisirPlanning(p.id)}
                                                className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-xl text-left transition-colors ${
                                                    actif ? 'bg-indigo-50 dark:bg-dk-accent/20 ring-1 ring-indigo-200 dark:ring-dk-border' : 'hover:bg-slate-50 dark:hover:bg-dk-elevated/60'
                                                }`}
                                            >
                                                {m?.image ? (
                                                    <img src={m.image} alt="" className="w-9 h-9 rounded-lg object-cover border border-slate-100 dark:border-dk-border/60 shrink-0" />
                                                ) : (
                                                    <span className="w-9 h-9 rounded-lg border border-slate-100 dark:border-dk-border/60 bg-slate-50 dark:bg-dk-bg flex items-center justify-center shrink-0 text-slate-300 dark:text-dk-muted">
                                                        <ImageIcon className="w-4 h-4" />
                                                    </span>
                                                )}
                                                <span className="min-w-0 flex-1">
                                                    <span className="block text-[12px] font-black text-slate-800 dark:text-dk-text truncate">{ref}</span>
                                                    <span className="block text-[10px] font-bold text-slate-400 dark:text-dk-muted truncate">
                                                        {m?.meta_data?.nom_modele || ''}
                                                        {p.qteTotal ? ` · ${p.qteTotal} pcs` : ''}
                                                    </span>
                                                </span>
                                            </button>
                                        );
                                    })}
                                    {/* Les OF de la chaine qui tournent d'autres jours : les
                                        choisir emmene a leur date, puisqu'un releve appartient
                                        toujours a un jour. Sans eux, changer de modele imposait
                                        de retrouver la date a l'aveugle. */}
                                    {ofsHorsDate.length > 0 && (
                                        <>
                                            <p className="px-2 pt-2 pb-1 mt-1 border-t border-slate-100 dark:border-dk-border/40 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-dk-muted">
                                                {tx(lang, L.ofsAilleurs)}
                                            </p>
                                            {ofsHorsDate.map(p => {
                                                const m = models.find(x => x.id === p.modelId);
                                                const ref = m?.meta_data?.reference || p.modelName || p.id.slice(0, 8);
                                                return (
                                                    <button
                                                        key={p.id}
                                                        type="button"
                                                        onClick={() => { setGlobalDate?.(jourDeLOF(p)); choisirPlanning(p.id); setModeleOuvert(false); }}
                                                        className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-xl text-left hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors"
                                                    >
                                                        {m?.image ? (
                                                            <img src={m.image} alt="" className="w-9 h-9 rounded-lg object-cover border border-slate-100 dark:border-dk-border/60 shrink-0 opacity-80" />
                                                        ) : (
                                                            <span className="w-9 h-9 rounded-lg border border-slate-100 dark:border-dk-border/60 bg-slate-50 dark:bg-dk-bg flex items-center justify-center shrink-0 text-slate-300 dark:text-dk-muted">
                                                                <ImageIcon className="w-4 h-4" />
                                                            </span>
                                                        )}
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block text-[12px] font-black text-slate-600 dark:text-dk-text-soft truncate">{ref}</span>
                                                            <span className="block text-[10px] font-bold text-slate-400 dark:text-dk-muted truncate">
                                                                {jourDeLOF(p)}
                                                                {p.qteTotal ? ` · ${p.qteTotal} pcs` : ''}
                                                            </span>
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Creneau horaire courant (auto), rappel pour l'utilisateur */}
            {/* Le creneau est deja en tete de la liste sur telephone : ce rappel
                n'y ferait que pousser la saisie vers le bas. */}
            <div className={`shrink-0 px-3 sm:px-6 py-2 items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-dk-muted bg-[#fafbfe] dark:bg-dk-bg border-b border-slate-100 dark:border-dk-border/40 ${isMobile ? 'hidden' : 'flex'}`}>
                <Clock className="w-3.5 h-3.5" />
                {tx(lang, L.hourNow)} : <span className="text-slate-800 dark:text-dk-text">{nowBlock.label}</span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-6">
                {/* Jour de repos : la grille de secours affichait 08:00 → 17:00 et
                    acceptait de la production sous un horaire qui n'existe pas.
                    On dit ce qu'il en est ; la date reste changeable en haut. */}
                {hourGrid.closed && !loading && (
                    <div className={`mb-3 rounded-2xl border px-4 py-3 ${
                        jourForce
                            ? 'border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/20'
                            : 'border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-900/20'
                    }`}>
                        {jourForce ? (
                            <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400">{tx(lang, L.reposForce)}</p>
                        ) : (
                            <>
                                <p className="text-[12px] font-black text-rose-700 dark:text-rose-300">{tx(lang, L.repos)}</p>
                                <p className="text-[10px] font-bold text-rose-600/80 dark:text-rose-400/80">{tx(lang, L.reposHint)}</p>
                                {/* Ouvrir la saisie reste une decision explicite : sur un jour
                                    ferme, une case pre-ouverte finirait par recevoir des chiffres
                                    qu'aucun horaire ne justifie. */}
                                <button
                                    type="button"
                                    onClick={() => forcerJour(date)}
                                    className="mt-2 px-3 py-2 rounded-xl bg-rose-600 text-white text-[11px] font-black hover:bg-rose-700 transition-colors min-h-[36px]"
                                >
                                    {tx(lang, L.reposConfirmer)}
                                </button>
                            </>
                        )}
                    </div>
                )}
                {/* Date a venir : toutes les cases sont fermees, et rien ne le disait.
                    On tapait dans un champ inerte sans comprendre — d'autant qu'un OF
                    lance depuis la Bibliotheque amene ici sa date de lancement, souvent
                    lointaine. On nomme la cause, et on offre la sortie. */}
                {jourAVenir && !loading && !hourGrid.closed && (
                    <div className="mb-3 rounded-2xl border border-sky-200 dark:border-sky-900/40 bg-sky-50 dark:bg-sky-900/20 px-4 py-3">
                        <p className="text-[12px] font-black text-sky-800 dark:text-sky-300">{tx(lang, L.jourFutur)}</p>
                        <p className="text-[10px] font-bold text-sky-700/80 dark:text-sky-400/80">{tx(lang, L.jourFuturHint)}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {/* Aller a aujourd'hui ne sert que si un OF y tourne deja.
                                Quand celui qu'on regarde a ete lance trop loin — le cas
                                qui amene ici — c'est LUI qu'il faut ramener, sinon on
                                arrive sur un jour vide et le releve reste impossible. */}
                            {onDeplacerOFAujourdhui && activePlanning && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!window.confirm(tx(lang, L.ramenerOFConfirme))) return;
                                        onDeplacerOFAujourdhui(activePlanning.id);
                                    }}
                                    className="px-3 py-2 rounded-xl bg-sky-600 text-white text-[11px] font-black hover:bg-sky-700 transition-colors min-h-[36px]"
                                >
                                    {tx(lang, L.ramenerOF)}
                                </button>
                            )}
                            {setGlobalDate && (
                                <button
                                    type="button"
                                    onClick={() => setGlobalDate(todayStr())}
                                    className="px-3 py-2 rounded-xl border border-sky-300 dark:border-sky-900/50 bg-white dark:bg-dk-surface text-sky-700 dark:text-sky-300 text-[11px] font-black hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors min-h-[36px]"
                                >
                                    {tx(lang, L.allerAujourdhui)}
                                </button>
                            )}
                        </div>
                    </div>
                )}
                {loading ? (
                    <div className="flex items-center justify-center py-16 text-slate-400 dark:text-dk-muted gap-2 text-sm font-bold">
                        <Loader2 className="w-4 h-4 animate-spin" /> {tx(lang, L.loading)}
                    </div>
                ) : hourGrid.closed && !jourForce ? (
                    /* Rien d'autre a montrer : sans creneau il n'y a pas de releve
                       possible, et afficher une grille de secours reviendrait a
                       proposer une saisie sous des heures qui n'existent pas. */
                    null
                ) : !activeModel || postes.length === 0 ? (
                    /* Trois causes distinctes se cachaient derriere le meme message
                       « Aucun modele planifie » : pas d'OF, un OF dont le modele a
                       disparu, ou un modele sans gamme. On dit laquelle, et ou aller
                       la corriger — sinon la page semble cassee alors que l'OF est
                       bien la, affiche juste au-dessus. */
                    <div className="flex flex-col items-center justify-center py-16 gap-4 px-6 max-w-2xl mx-auto">
                        <p className="text-slate-400 dark:text-dk-muted text-sm font-bold text-center">
                            {tx(lang, !activePlanning ? L.noModel : (!activeModel ? L.noModelIntrouvable : L.aucunPoste))}
                        </p>
                        {/* Sans gamme, on n'envoie plus l'utilisateur la construire
                            ailleurs : le poste se cree ICI, au pied de la chaine, en
                            tapant son libelle. Il rejoint la gamme du modele — donc le
                            catalogue des temps et le score des ouvriers. L'atelier des
                            methodes reste offert pour le travail de fond. */}
                        {!activePlanning && ofsAutresDates.length > 0 && (
                            <div className="w-full">
                                <p className="text-[11px] font-bold text-slate-400 dark:text-dk-muted mb-2 text-center">{tx(lang, L.ofsAilleurs)}</p>
                                <div className="flex flex-wrap justify-center gap-1.5">
                                    {ofsAutresDates.map(p => {
                                        const m = models.find(x => x.id === p.modelId);
                                        const ref = m?.meta_data?.reference || p.modelName || p.id.slice(0, 8);
                                        return (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => setGlobalDate?.(jourDeLOF(p))}
                                                className="px-3 py-2 min-h-[36px] rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-[11px] font-black text-slate-700 dark:text-dk-text hover:border-indigo-400 transition-colors"
                                            >
                                                {ref} <span className="font-bold text-slate-400 dark:text-dk-muted">{jourDeLOF(p)}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {activeModel && postes.length === 0 && onAddPoste && (
                            <>
                                <AjoutPosteRapide
                                    models={models}
                                    activeModel={activeModel}
                                    workers={workersSorted}
                                    chaineCourante={selectedChaineId}
                                    onCreerOuvrier={creerOuvrier}
                                    onAjouter={ajouterPoste}
                                />
                                {/* Un modele qui arrive de la Bibliotheque a deja sa gamme
                                    mais aucun releve : la liste des postes etait donc vide
                                    ET sans issue, puisque « Reprendre la gamme » ne
                                    s'affichait qu'une fois un premier poste cree a la main.
                                    Le raccourci doit exister d'abord ici, la ou il manque. */}
                                {gammeNonReprise.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => { void reprendreGamme(); }}
                                        className="px-4 py-2.5 min-h-[40px] rounded-xl border border-indigo-200 dark:border-dk-border bg-indigo-50 dark:bg-dk-elevated text-indigo-700 dark:text-dk-accent text-[12px] font-black hover:bg-indigo-100 dark:hover:bg-dk-accent/20 transition-colors"
                                    >
                                        {tx(lang, L.reprendreGamme)} ({gammeNonReprise.length})
                                    </button>
                                )}
                            </>
                        )}

                    </div>
                ) : (
                  <>
                    {/* Un poste peut manquer a une gamme par ailleurs complete : on
                        l'ajoute d'ici, sans quitter le releve en cours. */}
                    {activeModel && onAddPoste && (
                        <div className="mb-2 sm:mb-3 flex flex-wrap items-center gap-1.5">
                            <AjoutPosteRapide
                                models={models}
                                activeModel={activeModel}
                                workers={workersSorted}
                                chaineCourante={selectedChaineId}
                                onCreerOuvrier={creerOuvrier}
                                onAjouter={ajouterPoste}
                            />
                            {/* La gamme ne se deverse plus toute seule ici : elle sert au
                                prix de revient et contient des operations qu'on ne releve
                                pas. Mais quand on VEUT les suivre, un clic suffit. */}
                            {gammeNonReprise.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => { void reprendreGamme(); }}
                                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-600 dark:text-dk-text-soft text-[11px] font-black hover:border-indigo-400 hover:text-indigo-600 transition-colors"
                                >
                                    {tx(lang, L.reprendreGamme)} ({gammeNonReprise.length})
                                </button>
                            )}
                        </div>
                    )}
                    {/* ─── LE TABLEAU DU JOUR ────────────────────────────
                        Meme langue visuelle que « Releves Terrain » au
                        chronometrage : une ligne par poste, des colonnes
                        chiffrees, une ligne de total en pied. Les cartes
                        precedentes demandaient de derouler la page entiere pour
                        lire deux chiffres ; ici la journee tient d'un regard.

                        Sur telephone le tableau defile lateralement, la colonne
                        du poste restant collee a gauche — sans elle, on ne sait
                        plus quelle ligne on remplit. */}
                    {isMobile ? (
                    /* ─── TELEPHONE : le carnet ────────────────────────────
                       Au pied de la chaine on ne lit pas une journee : on note
                       l'heure qui vient de passer. L'ecran porte donc UN creneau
                       — celui de maintenant, en tete — et une ligne par poste :
                       son nom, l'ouvrier qui le tient, sa tendance, et la case a
                       remplir. Les autres creneaux restent atteignables par les
                       fleches, pour rattraper l'heure d'avant. */
                    <div className="space-y-1.5">
                        {(() => {
                            const blocs = hourGrid.blocks;
                            const idxCourant = Math.max(0, blocs.findIndex(b => b.key === (creneauVise || nowBlock.key)));
                            const bloc = blocs[idxCourant] || blocs[0];
                            if (!bloc) return null;
                            const futur = new Date(date).setHours(0, bloc.endMin, 0, 0) > Date.now();
                            return (
                                <>
                                    {/* Le creneau, en grand : c'est la premiere chose que
                                        demande celui qui note — quelle heure j'ecris ? */}
                                    <div className="rounded-xl border border-slate-200 dark:border-dk-border/60 bg-white dark:bg-dk-surface px-1.5 py-1.5 flex items-center justify-between gap-1">
                                        <button
                                            type="button"
                                            disabled={idxCourant === 0}
                                            onClick={() => setCreneauVise(blocs[idxCourant - 1]?.key || null)}
                                            aria-label={tx(lang, L.creneauPrecedent)}
                                            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 dark:text-dk-muted disabled:opacity-30"
                                        >
                                            ‹
                                        </button>
                                        <p className="min-w-0 text-center text-[14px] font-black tabular-nums text-slate-800 dark:text-dk-text truncate">
                                            {bloc.label}
                                            {bloc.duration < 60 ? (
                                                <span className="ml-1.5 text-[9px] font-bold text-indigo-500 dark:text-dk-accent-text">{bloc.duration} min</span>
                                            ) : bloc.pauseMin > 0 ? (
                                                <span className="ml-1.5 text-[9px] font-bold text-slate-400 dark:text-dk-muted">+{bloc.pauseMin} {tx(lang, L.pauseTag)}</span>
                                            ) : null}
                                        </p>
                                        <button
                                            type="button"
                                            disabled={idxCourant >= blocs.length - 1}
                                            onClick={() => setCreneauVise(blocs[idxCourant + 1]?.key || null)}
                                            aria-label={tx(lang, L.creneauSuivant)}
                                            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 dark:text-dk-muted disabled:opacity-30"
                                        >
                                            ›
                                        </button>
                                    </div>

                                    {postes.map(poste => {
                                        const cellule = celluleDe(poste.id, bloc.key);
                                        const val = cellule?.pieces_sorties;
                                        const enregistre = cellSavingId === idCellule(poste.id, bloc.key);
                                        const t = ecartPostePrecedent(poste);
                                        const nom = nomOuvrier(poste.id);
                                        const { total } = bilanPoste(poste);
                                        return (
                                            <div key={poste.id} className="rounded-xl border border-slate-200 dark:border-dk-border/60 bg-white dark:bg-dk-surface px-2.5 py-2">
                                                <div className="flex items-center gap-2">
                                                    <MenuPoste
                                                        poste={poste}
                                                        lang={lang}
                                                        ouvert={menuPosteId === poste.id}
                                                        onToggle={() => setMenuPosteId(cur => (cur === poste.id ? null : poste.id))}
                                                        onChangerOuvrier={() => { setChangementOuvrier(poste.id); setMenuPosteId(null); }}
                                                        onSupprimer={onRemovePoste ? () => void supprimerPoste(poste) : undefined}
                                                        onFixerTemps={onSetPosteTemps ? (sec) => void fixerTempsPoste(poste, sec) : undefined}
                                                        mesureSec={mesureChronoSec(poste.id)}
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                            <p className="font-black text-[13px] text-slate-800 dark:text-dk-text truncate">{poste.description || poste.id}</p>
                                                            {t && (
                                                                <span
                                                                    className={`shrink-0 text-[10px] font-black tabular-nums ${t.sens === 'hausse' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
                                                                    title={tx(lang, L.tendanceTitre)}
                                                                >
                                                                    {t.sens === 'hausse' ? '↑' : '↓'}{t.pct}%
                                                                </span>
                                                            )}
                                                        </div>
                                                        {/* L'ouvrier sous le poste, et son nom mene a sa fiche. */}
                                                        {nom ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => setFicheOuvrierId(ouvrierDuPoste(poste.id) || `nom:${nomOuvrier(poste.id)}`)}
                                                                title={tx(lang, L.voirOuvrier)}
                                                                className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-dk-accent-text"
                                                            >
                                                                <User className="w-3 h-3" /> {nom}
                                                            </button>
                                                        ) : (
                                                            <span className="text-[11px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang, L.sansOuvrier)}</span>
                                                        )}
                                                    </div>

                                                    <span className="shrink-0 text-right">
                                                        <span className="block text-[10px] font-bold text-slate-400 dark:text-dk-muted tabular-nums">{total} pcs</span>
                                                        {(() => {
                                                            const obj = objectifPoste(poste);
                                                            if (!obj) return null;
                                                            return (
                                                                <span className="block text-[10px] font-black tabular-nums text-indigo-600 dark:text-dk-accent-text" title={tx(lang, L.objectifTitre)}>
                                                                    {tx(lang, L.objectif)} {obj.parCreneau}
                                                                </span>
                                                            );
                                                        })()}
                                                    </span>
                                                </div>

                                                {/* La case du creneau : le seul geste de cet ecran, donc
                                                    la pleine largeur et le doigt qui tombe dessus. */}
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    pattern="[0-9]*"
                                                    disabled={futur}
                                                    value={val === undefined || val === null || val === 0 ? '' : String(val)}
                                                    onChange={(e) => {
                                                        const chiffres = e.target.value.replace(/[^0-9]/g, '');
                                                        void saveCellule(poste, bloc.key, chiffres === '' ? null : parseInt(chiffres, 10));
                                                    }}
                                                    placeholder="—"
                                                    title={futur ? tx(lang, L.creneauFutur) : undefined}
                                                    aria-label={futur ? tx(lang, L.creneauFutur) : tx(lang, L.productionHeure)}
                                                    className={`mt-1.5 w-full h-12 text-center text-[18px] font-black tabular-nums rounded-xl border outline-none transition-all ${
                                                        futur
                                                            ? 'bg-slate-50 dark:bg-dk-bg/50 border-slate-100 dark:border-dk-border/50 text-slate-300 dark:text-dk-muted'
                                                            : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border text-slate-800 dark:text-dk-text focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600'
                                                    } ${enregistre ? 'opacity-60' : ''}`}
                                                />

                                                {/* Le reste tient sur une ligne discrete : on le lit si on
                                                    le cherche, il ne gene pas le geste de saisie. */}
                                                <div className="mt-1.5 flex items-center gap-1.5">
                                                    {/* Le selecteur ne s'ouvre qu'a la demande : l'ouvrier se
                                                        choisit une fois le matin, pas a chaque releve — il
                                                        occupait une ligne entiere pour rien. */}
                                                    {changementOuvrier === poste.id ? (
                                                        <div className="flex-1 min-w-0">
                                                            <ChampOuvrier
                                                                valeur={nomOuvrier(poste.id)}
                                                                workers={workersSorted}
                                                                lang={lang}
                                                                chaineCourante={selectedChaineId}
                                                                onCreerOuvrier={creerOuvrier}
                                                                onValider={(nom) => { void changerOuvrierPoste(poste, nom); setChangementOuvrier(null); }}
                                                                onAnnuler={() => setChangementOuvrier(null)}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <span className="flex-1" />
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => setChronoOpenFor(cur => (cur === poste.id ? null : poste.id))}
                                                        title={tx(lang, L.chronoTitre)}
                                                        aria-label={tx(lang, L.chronoTitre)}
                                                        className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border transition-colors ${
                                                            chronoOpenFor === poste.id
                                                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                                                : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border text-slate-500 dark:text-dk-muted'
                                                        }`}
                                                    >
                                                        <Clock className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>

                                                {chronoOpenFor === poste.id && (
                                                    <div className="mt-2">
                                                        <MiniChrono
                                                            open
                                                            onToggle={() => setChronoOpenFor(null)}
                                                            onFinish={(ms, secMaj) => { setDraft(poste.id, { tempsMs: ms }); void appliquerChrono(poste, ms, secMaj); }}
                                                            lang={lang}
                                                            tempsMs={getDraft(poste.id).tempsMs}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {/* Le total du creneau affiche, puis celui de la journee. */}
                                    <div className="rounded-xl border border-slate-200 dark:border-dk-border/60 bg-slate-50 dark:bg-dk-elevated/40 px-2.5 py-2 flex items-center justify-between">
                                        <span className="min-w-0">
                                            <span className="block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-dk-muted" title={tx(lang, L.sortieChaineTitre)}>
                                                {tx(lang, L.sortieChaine)}
                                            </span>
                                            {(() => {
                                                const g = goulotDuJour();
                                                if (!g) return null;
                                                return (
                                                    <span className="block text-[9px] font-bold text-amber-600 dark:text-amber-400 truncate" title={tx(lang, L.goulotTitre)}>
                                                        {tx(lang, L.goulot)} : {g.poste.description || g.poste.id} ({g.pieces})
                                                    </span>
                                                );
                                            })()}
                                        </span>
                                        <span className="text-right shrink-0">
                                            <span className="block text-[14px] font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                                                {sortieChaineCreneau(bloc.key) || '—'}
                                            </span>
                                            <span className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted tabular-nums">
                                                {sortieChaineJour()} {tx(lang, L.piecesJour)}
                                            </span>
                                        </span>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                    ) : (
                    <div className="rounded-2xl border border-slate-200 dark:border-dk-border/60 bg-white dark:bg-dk-surface overflow-hidden">
                        <div className="px-3 sm:px-4 py-2.5 border-b border-slate-100 dark:border-dk-border/50 bg-slate-50 dark:bg-dk-elevated/40">
                            <p className="text-[12px] font-black text-slate-700 dark:text-dk-text">{tx(lang, L.releves)}</p>
                            <p className="text-[10px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang, L.relevesHint)}</p>
                        </div>

                        <div className="overflow-x-auto scrollbar-thin">
                            <table className="w-full text-[12px] border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-dk-elevated/60 text-slate-500 dark:text-dk-muted text-[10px] uppercase tracking-wider font-black">
                                        <th className="w-8 px-2 py-2.5 text-center">#</th>
                                        <th className="text-left px-3 py-2.5 sticky left-0 bg-slate-50 dark:bg-dk-elevated/60 z-10 min-w-[160px]">{tx(lang, L.poste)}</th>
                                        <th className="text-left px-3 py-2.5 min-w-[150px]">{tx(lang, L.worker)}</th>
                                        <th className="px-2 py-2.5 text-center w-20">{tx(lang, L.cadence)}</th>
                                        <th className="px-2 py-2.5 text-center w-24 bg-indigo-50/70 dark:bg-dk-accent/10 text-indigo-700 dark:text-dk-accent-text" title={tx(lang, L.objectifTitre)}>{tx(lang, L.objectif)}</th>
                                        {hourGrid.blocks.map(b => (
                                            <th
                                                key={b.key}
                                                className={`text-center px-1 py-2.5 w-[86px] border-l border-slate-100 dark:border-dk-border/40 ${b.key === nowBlock.key ? 'bg-indigo-50 dark:bg-dk-accent/20 text-indigo-700 dark:text-dk-accent-text' : ''}`}
                                                title={`${b.label} — ${b.duration} min`}
                                            >
                                                {/* La plage entiere, comme au Suivi : « 06:30/07:30 » dit
                                                    ce que « 06:30 » laissait deviner, surtout quand une
                                                    pause raccourcit le creneau. */}
                                                {b.label}
                                                {b.duration < 60 ? (
                                                    <span className="block text-[8px] normal-case tracking-normal text-indigo-500 dark:text-dk-accent-text">{b.duration} min</span>
                                                ) : b.pauseMin > 0 ? (
                                                    <span className="block text-[8px] normal-case tracking-normal text-slate-400 dark:text-dk-muted">+{b.pauseMin} min {tx(lang, L.pauseTag)}</span>
                                                ) : null}
                                            </th>
                                        ))}
                                        <th className="px-2 py-2.5 text-center w-16 border-l border-slate-200 dark:border-dk-border/60" title={tx(lang, L.defTitre)}>{tx(lang, L.defCourt)}</th>
                                        <th className="px-2 py-2.5 text-center w-16 bg-emerald-50/70 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-300">{tx(lang, L.total)}</th>
                                        <th className="px-2 py-2.5 text-center w-16 bg-slate-800 text-white dark:bg-dk-elevated">{tx(lang, L.score)}</th>
                                    </tr>
                                </thead>

                                <tbody className="divide-y divide-slate-100 dark:divide-dk-border/40">
                                    {postes.map((poste, rang) => {
                                        const d = getDraft(poste.id);
                                        const cad = cadencePoste(poste);
                                        const rowsToday = suivisByPoste.get(poste.id) || [];
                                        const totalJour = rowsToday.reduce((somme, r) => somme + (r.pieces_sorties || 0), 0);
                                        const scoresJour = rowsToday.map(scoreReleve).filter((x): x is number => x !== null);
                                        const scoreMesure = rowsToday.some(scoreChronometre);
                                        const scorePoste = scoresJour.length > 0
                                            ? Math.round(scoresJour.reduce((a, b) => a + b, 0) / scoresJour.length)
                                            : null;
                                        const celluleCourante = celluleDe(poste.id, nowBlock.key);
                                        const defautsCourants = celluleCourante?.pieces_defaut ?? 0;
                                        const chronoOuvert = chronoOpenFor === poste.id;
                                        return (
                                            <React.Fragment key={poste.id}>
                                                <tr className="hover:bg-slate-50/60 dark:hover:bg-dk-elevated/30">
                                                    <td className="px-2 py-2 text-center text-[10px] font-black tabular-nums text-slate-400 dark:text-dk-muted">{rang + 1}</td>

                                                    <td className="px-3 py-2 sticky left-0 bg-white dark:bg-dk-surface z-10">
                                                        <div className="flex items-center gap-2">
                                                            <div className="min-w-0">
                                                                <p className="font-black text-slate-800 dark:text-dk-text truncate">{poste.description || poste.id}</p>
                                                                {/* L'ouvrier qui tient le poste, sous son nom : quand le
                                                                    tableau defile, la colonne collee a gauche est la
                                                                    seule visible — elle doit dire QUI produit ces
                                                                    chiffres, pas seulement OU. */}
                                                                {nomOuvrier(poste.id) && (
                                                                    <p className="text-[10px] font-bold text-indigo-600 dark:text-dk-accent-text truncate">{nomOuvrier(poste.id)}</p>
                                                                )}
                                                                {poste.machineName && (
                                                                    <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-dk-bg text-[9px] font-black text-slate-500 dark:text-dk-muted truncate max-w-[140px]">
                                                                        {poste.machineName}
                                                                    </span>
                                                                )}
                                                                {/* Un poste sans temps standard ne produit ni rendement
                                                                    ni prime : on le dit ici, et le menu le corrige. */}
                                                                {poste.time > 0 ? (
                                                                    <span className="ml-1 inline-block mt-0.5 px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/20 text-[9px] font-black text-amber-700 dark:text-amber-300 tabular-nums">
                                                                        TS {(poste.time * 60).toFixed(1)}s
                                                                    </span>
                                                                ) : (
                                                                    <span className="ml-1 inline-block mt-0.5 px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-900/20 text-[9px] font-black text-rose-700 dark:text-rose-300" title={tx(lang, L.sansTSTitre)}>
                                                                        {tx(lang, L.sansTS)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => setChronoOpenFor(cur => (cur === poste.id ? null : poste.id))}
                                                                title={tx(lang, L.chronoTitre)}
                                                                aria-label={tx(lang, L.chronoTitre)}
                                                                className={`ml-auto shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border transition-colors ${
                                                                    chronoOuvert
                                                                        ? 'bg-indigo-600 border-indigo-600 text-white'
                                                                        : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border text-slate-500 dark:text-dk-muted hover:border-indigo-400'
                                                                }`}
                                                            >
                                                                <Clock className="w-3.5 h-3.5" />
                                                            </button>
                                                            <MenuPoste
                                                                poste={poste}
                                                                lang={lang}
                                                                ouvert={menuPosteId === poste.id}
                                                                onToggle={() => setMenuPosteId(cur => (cur === poste.id ? null : poste.id))}
                                                                onChangerOuvrier={() => { setChangementOuvrier(poste.id); setMenuPosteId(null); }}
                                                                onSupprimer={onRemovePoste ? () => void supprimerPoste(poste) : undefined}
                                                                onFixerTemps={onSetPosteTemps ? (sec) => void fixerTempsPoste(poste, sec) : undefined}
                                                                mesureSec={mesureChronoSec(poste.id)}
                                                            />
                                                        </div>
                                                    </td>

                                                    <td className="px-3 py-2">
                                                        {changementOuvrier === poste.id ? (
                                                            <ChampOuvrier
                                                                valeur={nomOuvrier(poste.id)}
                                                                workers={workersSorted}
                                                                lang={lang}
                                                                chaineCourante={selectedChaineId}
                                                                onCreerOuvrier={creerOuvrier}
                                                                onValider={(nom) => { void changerOuvrierPoste(poste, nom); setChangementOuvrier(null); }}
                                                                onAnnuler={() => setChangementOuvrier(null)}
                                                            />
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => setChangementOuvrier(poste.id)}
                                                                className="w-full text-left min-h-[36px] px-2.5 rounded-lg border border-dashed border-slate-200 dark:border-dk-border text-[11px] font-bold text-slate-400 dark:text-dk-muted hover:border-indigo-400 hover:text-indigo-600"
                                                            >
                                                                {nomOuvrier(poste.id) || tx(lang, workersSorted.length === 0 ? L.aucunOuvrier : L.chooseWorker)}
                                                            </button>
                                                        )}
                                                        {/* Le nom mene a tout ce que cet ouvrier a tenu : la
                                                            page savait qui produit quoi sans jamais le rendre
                                                            par personne. */}
                                                        {nomOuvrier(poste.id) && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setFicheOuvrierId(ouvrierDuPoste(poste.id) || `nom:${nomOuvrier(poste.id)}`)}
                                                                title={tx(lang, L.voirOuvrier)}
                                                                className="mt-1 flex items-center gap-1 text-[10px] font-black text-indigo-600 dark:text-dk-accent-text hover:underline"
                                                            >
                                                                <User className="w-3 h-3" /> {nomOuvrier(poste.id)}
                                                            </button>
                                                        )}
                                                    </td>

                                                    <td className="px-2 py-2 text-center">
                                                        {cad.valeur === null ? (
                                                            <span className="text-slate-300 dark:text-dk-muted font-bold">—</span>
                                                        ) : (
                                                            <span
                                                                className={`inline-block px-2 py-1 rounded-lg text-[11px] font-black tabular-nums ${cad.mesuree ? 'bg-indigo-50 text-indigo-700 dark:bg-dk-accent/20 dark:text-dk-accent-text' : 'bg-slate-100 text-slate-500 dark:bg-dk-bg dark:text-dk-muted'}`}
                                                                title={tx(lang, cad.mesuree ? L.cadenceMesuree : L.cadenceGamme)}
                                                            >
                                                                {cad.mesuree ? '' : '~'}{cad.valeur}
                                                            </span>
                                                        )}
                                                    </td>

                                                    {/* L'objectif, a cote de la cadence : l'un est ce qu'on
                                                        attend, l'autre ce qu'on obtient. */}
                                                    <td className="px-2 py-2 text-center bg-indigo-50/40 dark:bg-dk-accent/5">
                                                        {(() => {
                                                            const obj = objectifPoste(poste);
                                                            if (!obj) return <span className="text-slate-300 dark:text-dk-muted font-bold">—</span>;
                                                            return (
                                                                <span className="block" title={tx(lang, L.objectifTitre)}>
                                                                    <span className="block text-[12px] font-black tabular-nums text-indigo-700 dark:text-dk-accent-text">{obj.parCreneau}</span>
                                                                    <span className="block text-[9px] font-bold tabular-nums text-indigo-500/80 dark:text-dk-muted">{obj.parHeure} p/h</span>
                                                                </span>
                                                            );
                                                        })()}
                                                    </td>

                                                    {hourGrid.blocks.map(b => {
                                                        const cellule = celluleDe(poste.id, b.key);
                                                        const val = cellule?.pieces_sorties;
                                                        /* Un creneau qui n'est pas encore fini ne se saisit pas :
                                                           on ne releve pas une heure qui n'a pas eu lieu. */
                                                        const futur = new Date(date).setHours(0, b.endMin, 0, 0) > Date.now();
                                                        const courant = b.key === nowBlock.key;
                                                        const enregistre = cellSavingId === idCellule(poste.id, b.key);
                                                        return (
                                                            <td key={b.key} className={`p-1 border-l border-slate-100 dark:border-dk-border/40 ${courant ? 'bg-indigo-50/40 dark:bg-dk-accent/10' : ''}`}>
                                                                <input
                                                                    type="text"
                                                                    inputMode="numeric"
                                                                    pattern="[0-9]*"
                                                                    disabled={futur}
                                                                    value={val === undefined || val === null || val === 0 ? '' : String(val)}
                                                                    onChange={(e) => {
                                                                        const chiffres = e.target.value.replace(/[^0-9]/g, '');
                                                                        void saveCellule(poste, b.key, chiffres === '' ? null : parseInt(chiffres, 10));
                                                                    }}
                                                                    placeholder="—"
                                                                    title={futur ? tx(lang, L.creneauFutur) : undefined}
                                                                    className={`w-full h-10 text-center text-[12px] font-black tabular-nums rounded-lg border outline-none transition-all ${
                                                                        futur
                                                                            ? 'bg-slate-50 dark:bg-dk-bg/50 border-slate-100 dark:border-dk-border/50 text-slate-300 dark:text-dk-muted'
                                                                            : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border text-slate-800 dark:text-dk-text focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600'
                                                                    } ${enregistre ? 'opacity-60' : ''}`}
                                                                />
                                                            </td>
                                                        );
                                                    })}

                                                    <td className="p-1 border-l border-slate-200 dark:border-dk-border/60">
                                                        <input
                                                            type="text"
                                                            inputMode="numeric"
                                                            pattern="[0-9]*"
                                                            value={defautsCourants === 0 ? '' : String(defautsCourants)}
                                                            onChange={(e) => {
                                                                const chiffres = e.target.value.replace(/[^0-9]/g, '');
                                                                void ecrireCellule(poste, nowBlock.key, { pieces_defaut: chiffres === '' ? 0 : parseInt(chiffres, 10) });
                                                            }}
                                                            placeholder="—"
                                                            title={tx(lang, L.defTitre)}
                                                            className="w-full h-10 text-center text-[12px] font-bold tabular-nums rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-600 dark:text-dk-text-soft outline-none focus:border-indigo-600"
                                                        />
                                                    </td>

                                                    <td className="px-2 py-2 text-center bg-emerald-50/40 dark:bg-emerald-900/5 font-black tabular-nums text-slate-800 dark:text-dk-text">
                                                        {totalJour || '—'}
                                                        {(() => {
                                                            const t = ecartPostePrecedent(poste);
                                                            if (!t) return null;
                                                            return (
                                                                <span
                                                                    className={`block text-[9px] font-black ${t.sens === 'hausse' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
                                                                    title={tx(lang, L.tendanceTitre)}
                                                                >
                                                                    {t.sens === 'hausse' ? '↑' : '↓'} {t.pct}%
                                                                </span>
                                                            );
                                                        })()}
                                                    </td>

                                                    <td className="px-2 py-2 text-center">
                                                        {scorePoste === null ? (
                                                            <span className="text-slate-300 dark:text-dk-muted font-bold">—</span>
                                                        ) : (
                                                            <span
                                                                className={`inline-block rounded-md px-2 py-1 text-[11px] font-black tabular-nums ${classeScore(scorePoste)}`}
                                                                title={scoreMesure ? undefined : tx(lang, L.scoreEstime)}
                                                            >
                                                                {scoreMesure ? '' : '~'}{scorePoste}%
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>

                                                {/* Le chrono s'ouvre SOUS sa ligne : on garde le poste sous
                                                    les yeux pendant la mesure. Le temps mesure se rattache au
                                                    creneau en cours, divise par les pieces qui y sont notees. */}
                                                {chronoOuvert && (
                                                    <tr className="bg-slate-50/70 dark:bg-dk-elevated/30">
                                                        <td colSpan={6 + hourGrid.blocks.length + 3} className="px-3 py-2.5">
                                                            <MiniChrono
                                                                open
                                                                onToggle={() => setChronoOpenFor(null)}
                                                                onFinish={(ms, secMaj) => { setDraft(poste.id, { tempsMs: ms }); void appliquerChrono(poste, ms, secMaj); }}
                                                                lang={lang}
                                                                tempsMs={d.tempsMs}
                                                            />
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>

                                {/* TOTAL GENERAL : la journee de la chaine, creneau par creneau. */}
                                <tfoot>
                                    <tr className="bg-slate-50 dark:bg-dk-elevated/60 border-t-2 border-slate-200 dark:border-dk-border">
                                        <td />
                                        <td className="px-3 py-2.5 sticky left-0 bg-slate-50 dark:bg-dk-elevated/60 z-10 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-dk-muted" title={tx(lang, L.sortieChaineTitre)}>
                                            {tx(lang, L.sortieChaine)}
                                            {(() => {
                                                const g = goulotDuJour();
                                                if (!g) return null;
                                                return (
                                                    <span className="block normal-case tracking-normal text-[9px] font-bold text-amber-600 dark:text-amber-400 truncate" title={tx(lang, L.goulotTitre)}>
                                                        {tx(lang, L.goulot)} : {g.poste.description || g.poste.id} ({g.pieces})
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                        <td />
                                        <td />
                                        <td className="px-2 py-2.5 text-center bg-indigo-50/40 dark:bg-dk-accent/5 text-[10px] font-black tabular-nums text-indigo-700 dark:text-dk-accent-text">
                                            {(() => {
                                                /* Objectif de la chaine sur le creneau : celui du poste le
                                                   plus lent, pas la somme — une chaine ne sort pas plus que
                                                   son goulot, quelles que soient les cadences en amont. */
                                                const objs = postes.map(objectifPoste).filter((o): o is { parHeure: number; parCreneau: number } => o !== null);
                                                if (objs.length === 0) return '—';
                                                return Math.min(...objs.map(o => o.parCreneau));
                                            })()}
                                        </td>
                                        {hourGrid.blocks.map(b => (
                                            <td key={b.key} className="px-1 py-2.5 text-center font-black tabular-nums text-slate-700 dark:text-dk-text border-l border-slate-100 dark:border-dk-border/40">
                                                {sortieChaineCreneau(b.key) || '—'}
                                            </td>
                                        ))}
                                        <td className="px-2 py-2.5 text-center font-bold tabular-nums text-slate-500 dark:text-dk-muted border-l border-slate-200 dark:border-dk-border/60">
                                            {postes.reduce((acc, poste) => acc + (celluleDe(poste.id, nowBlock.key)?.pieces_defaut || 0), 0) || '—'}
                                        </td>
                                        <td className="px-2 py-2.5 text-center font-black tabular-nums text-emerald-700 dark:text-emerald-300 bg-emerald-50/70 dark:bg-emerald-900/10" title={tx(lang, L.sortieChaineTitre)}>
                                            {sortieChaineJour() || '—'}
                                        </td>
                                        <td className="px-2 py-2.5 text-center bg-slate-800 dark:bg-dk-elevated">
                                            {(() => {
                                                const tous = postes.flatMap(poste => (suivisByPoste.get(poste.id) || []).map(scoreReleve)).filter((x): x is number => x !== null);
                                                if (tous.length === 0) return <span className="text-slate-500 font-bold">—</span>;
                                                const moyenne = Math.round(tous.reduce((a, b) => a + b, 0) / tous.length);
                                                return <span className="text-white font-black tabular-nums text-[11px]">{moyenne}%</span>;
                                            })()}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                    )}

                  </>
                )}

                {/* Progression : ce que les releves accumules finissent par dire de
                    chaque ouvrier — sa moyenne, ses pieces, ses postes tenus. */}
                {!loading && (
                    <div className="mt-3 sm:mt-4 rounded-2xl border border-slate-200 dark:border-dk-border/60 bg-white dark:bg-dk-surface p-3 sm:p-4">
                        <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-dk-muted">
                            <User className="w-3.5 h-3.5" /> {tx(lang, L.progression)}
                        </div>
                        {/* Sans regle decidee, aucune prime ne s'affiche : on le dit
                            plutot que de laisser croire qu'il n'y a jamais de prime. */}
                        {!(configPrimeEffective(settings)?.paliers || []).some(p => p.montant > 0) && (
                            <p className="mb-2 text-[10px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang, L.primeAucuneRegle)}</p>
                        )}
                        {progression.length === 0 ? (
                            <p className="text-[11px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang, L.progressionVide)}</p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {progression.map(p => (
                                    <div key={p.id} className="rounded-xl bg-slate-50 dark:bg-dk-bg px-3 py-2 space-y-1.5">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="min-w-0 truncate text-[12px] font-bold text-slate-700 dark:text-dk-text">{p.nom}</span>
                                            <span className="shrink-0 text-right">
                                                <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-black tabular-nums ${p.moyenne === null ? 'text-slate-300 dark:text-dk-muted' : classeScore(p.moyenne)}`}>
                                                    {p.moyenne === null ? '—' : `${p.moyenne}%`}
                                                </span>
                                                <span className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted tabular-nums">
                                                    {p.pieces} pcs · {p.postes} {tx(lang, L.postesTenus)}
                                                </span>
                                            </span>
                                        </div>

                                        {/* Scores de periode : ce sur quoi la prime se decide. */}
                                        <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-black tabular-nums">
                                            <span className="px-1.5 py-0.5 rounded bg-white dark:bg-dk-surface text-slate-500 dark:text-dk-muted">
                                                {tx(lang, L.primeJour)} {p.scoreJour === null ? '—' : `${p.scoreJour}%`}
                                            </span>
                                            <span className="px-1.5 py-0.5 rounded bg-white dark:bg-dk-surface text-slate-500 dark:text-dk-muted">
                                                {tx(lang, L.primeSemaine)} {p.scoreSemaine === null ? '—' : `${p.scoreSemaine}%`}
                                            </span>
                                            {p.prime > 0 && (
                                                <span
                                                    className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                                                    title={p.detailPrime.join(' · ')}
                                                >
                                                    {tx(lang, L.prime)} {p.prime} {settings?.currency || ''}
                                                </span>
                                            )}
                                        </div>

                                        {/* Postes tenus, les mieux notes d'abord : c'est la reponse a
                                            « qui je mets sur ce poste la prochaine fois ». */}
                                        {p.postesMaitrises.length > 0 && (
                                            <div className="flex flex-wrap gap-1" title={tx(lang, L.postesMaitrises)}>
                                                {p.postesMaitrises.map(pm => (
                                                    <span key={pm.id} className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${classeScore(pm.score)}`}>
                                                        {pm.nom} {pm.score}%
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Fiche ouvrier : sa semaine sur le modele ouvert, puis tous les
                postes qu'il a tenus, tous modeles et toutes chaines. */}
            {ficheOuvrierId && (
                <FicheOuvrier
                    workerId={ficheOuvrierId}
                    workerName={workers.find(w => String(w.id) === String(ficheOuvrierId))?.full_name || ficheOuvrierId.replace(/^nom:/, '')}
                    posteSuivis={posteSuivis}
                    models={models}
                    planningEvents={planningEvents}
                    activeModelId={activeModel?.id}
                    date={date}
                    scoreReleve={scoreReleve}
                    classeScore={classeScore}
                    onClose={() => setFicheOuvrierId(null)}
                />
            )}
        </div>
    );
}

// Chronometre minimal : demarrer/arreter, le temps ecoule (ms) remonte au parent
// qui le divise par la quantite saisie pour obtenir le temps reel par piece.
/**
 * Menu « ⋮ » d'un poste : ce qui ne se fait qu'une fois par jour ne doit pas
 * occuper la ligne en permanence — changer l'ouvrier, retirer le poste.
 */
function MenuPoste({ poste, lang, ouvert, onToggle, onChangerOuvrier, onSupprimer, onFixerTemps, mesureSec }: {
    poste: Operation; lang: string; ouvert: boolean; onToggle: () => void;
    onChangerOuvrier: () => void; onSupprimer?: () => void;
    /** Enregistre le temps standard, en SECONDES par piece. */
    onFixerTemps?: (tempsSec: number) => void;
    /** Temps deja mesure au chrono sur ce poste, en secondes — a adopter d'un clic. */
    mesureSec?: number | null;
}) {
    const [confirme, setConfirme] = useState(false);
    const [tsSaisi, setTsSaisi] = useState<string>(poste.time > 0 ? String(Number((poste.time * 60).toFixed(1))) : '');
    // Le menu referme : la confirmation ne doit pas attendre, armee, sa reouverture.
    useEffect(() => { if (!ouvert) setConfirme(false); }, [ouvert]);

    return (
        <div className="relative shrink-0">
            <button
                type="button"
                onClick={onToggle}
                title={tx(lang, L.menuPoste)}
                aria-label={tx(lang, L.menuPoste)}
                className="w-8 h-8 rounded-lg flex items-center justify-center border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-400 dark:text-dk-muted hover:text-slate-700"
            >
                <MoreVertical className="w-3.5 h-3.5" />
            </button>
            {ouvert && (
                <>
                    {/* Un voile ferme le menu au premier clic ailleurs : sans lui, il
                        reste ouvert sous le doigt pendant qu'on saisit. */}
                    <div className="fixed inset-0 z-30" onClick={() => { setConfirme(false); onToggle(); }} />
                    <div className="absolute left-0 sm:left-auto sm:right-0 z-40 mt-1 w-52 rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface shadow-lg overflow-hidden">
                        <button
                            type="button"
                            onClick={onChangerOuvrier}
                            className="w-full text-left px-3 py-2.5 text-[12px] font-bold text-slate-700 dark:text-dk-text hover:bg-slate-50 dark:hover:bg-dk-elevated/50 flex items-center gap-2"
                        >
                            <User className="w-3.5 h-3.5" /> {tx(lang, L.changerOuvrier)}
                        </button>

                        {/* Le temps standard : c'est lui qui rend le rendement et la
                            prime possibles. On le saisit en secondes — la langue de
                            l'atelier — et la conversion en minutes se fait plus bas. */}
                        {onFixerTemps && (
                            <div className="px-3 py-2.5 border-t border-slate-100 dark:border-dk-border/50">
                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-dk-muted flex items-center gap-1.5">
                                    <Timer className="w-3.5 h-3.5" /> {tx(lang, L.definirTS)}
                                </p>
                                <p className="mt-0.5 text-[9px] font-bold text-slate-400 dark:text-dk-muted leading-snug">{tx(lang, L.tsAide)}</p>
                                <div className="mt-1.5 flex items-center gap-1.5">
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={tsSaisi}
                                        onChange={e => setTsSaisi(e.target.value.replace(/[^0-9.]/g, ''))}
                                        onKeyDown={e => { if (e.key === 'Enter' && tsSaisi) onFixerTemps(Number(tsSaisi)); }}
                                        placeholder="—"
                                        className="w-20 h-8 text-center text-[12px] font-black tabular-nums rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-800 dark:text-dk-text outline-none focus:border-indigo-600"
                                    />
                                    <span className="text-[10px] font-bold text-slate-400 dark:text-dk-muted">s</span>
                                    <button
                                        type="button"
                                        onClick={() => tsSaisi && onFixerTemps(Number(tsSaisi))}
                                        disabled={!tsSaisi}
                                        className="ml-auto h-8 px-3 rounded-lg bg-indigo-600 text-white text-[11px] font-black disabled:opacity-40"
                                    >
                                        OK
                                    </button>
                                </div>
                                {/* Le chrono a deja mesure ce poste : autant s'en servir
                                    plutot que de retaper un chiffre qu'on vient de lire. */}
                                {mesureSec ? (
                                    <button
                                        type="button"
                                        onClick={() => onFixerTemps(mesureSec)}
                                        className="mt-1.5 w-full h-8 rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/20 text-[11px] font-black text-emerald-700 dark:text-emerald-300"
                                    >
                                        {tx(lang, L.adopterMesure)} · {mesureSec.toFixed(1)} s
                                    </button>
                                ) : null}
                            </div>
                        )}
                        {onSupprimer && (
                            /* Deux temps, dans le menu meme : `window.confirm` sort de
                               l'application et, sur telephone, s'affiche loin du doigt —
                               on l'ecarte sans l'avoir lu. Ici la phrase explique ce qui
                               est detruit (rien) avant que le geste ne se termine. */
                            confirme ? (
                                <div className="border-t border-slate-100 dark:border-dk-border/50 bg-rose-50/60 dark:bg-rose-900/10 px-3 py-2.5">
                                    <p className="text-[10px] font-bold text-rose-700 dark:text-rose-300 leading-snug">{tx(lang, L.supprimerConfirme)}</p>
                                    <div className="mt-2 flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => { setConfirme(false); onSupprimer(); }}
                                            className="flex-1 h-8 rounded-lg bg-rose-600 text-white text-[11px] font-black"
                                        >
                                            {tx(lang, L.supprimerPoste)}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setConfirme(false)}
                                            className="h-8 px-3 rounded-lg text-[11px] font-bold text-slate-500 dark:text-dk-muted"
                                        >
                                            {tx(lang, L.chronoAnnuler)}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setConfirme(true)}
                                    className="w-full text-left px-3 py-2.5 text-[12px] font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 border-t border-slate-100 dark:border-dk-border/50 flex items-center gap-2"
                                >
                                    <Trash2 className="w-3.5 h-3.5" /> {tx(lang, L.supprimerPoste)}
                                </button>
                            )
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function MiniChrono({ open, onToggle, onFinish, lang, tempsMs }: { open: boolean; onToggle: () => void; onFinish: (msParPiece: number, secMajorees: number) => void; lang: string; tempsMs: number | null }) {
    /* Meme geste qu'au Chronometrage : on lance, on marque un tour a chaque
       cycle, on arrete. La moyenne des tours est le temps du poste — un seul
       cycle mesure a la main se trompe trop souvent pour valoir une note. */
    const [running, setRunning] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [tours, setTours] = useState<number[]>([]);
    /* Un cycle sort le plus souvent une piece ; parfois deux (paire de manches,
       travail par lot). La valeur par defaut ne suppose rien d'autre. */
    const [piecesParTour, setPiecesParTour] = useState(1);
    /** 1.15 est l'aisance usuelle en confection, celle du Chronometrage. */
    const [majoration, setMajoration] = useState(1.15);
    /** Mesure arretee, en attente de decision. */
    const [aGarder, setAGarder] = useState(false);
    const startRef = useRef(0);
    const dernierTourRef = useRef(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

    const demarrer = () => {
        startRef.current = Date.now() - elapsed;
        intervalRef.current = setInterval(() => setElapsed(Date.now() - startRef.current), 50);
        setRunning(true);
    };

    const marquerTour = () => {
        const t = elapsed - dernierTourRef.current;
        if (t <= 0) return;
        dernierTourRef.current = elapsed;
        setTours(prev => [...prev, t]);
    };

    const annulerDernier = () => {
        setTours(prev => {
            if (prev.length === 0) return prev;
            const suite = prev.slice(0, -1);
            dernierTourRef.current = suite.reduce((a, b) => a + b, 0);
            return suite;
        });
    };

    /* Arreter n'enregistre RIEN : on lit d'abord la moyenne, la cadence, les
       tours — puis on decide de garder. Une mesure ratee (un tour de trop, une
       piece coincee) ne doit pas redefinir le temps d'un poste par surprise. */
    const arreter = () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setRunning(false);
        // Un tour en cours au moment de l'arret compte : sinon le dernier cycle,
        // celui qu'on vient justement de mesurer, serait perdu.
        const enCours = elapsed - dernierTourRef.current;
        const tous = enCours > 0 ? [...tours, enCours] : tours;
        if (tous.length === 0) return;
        dernierTourRef.current = elapsed;
        setTours(tous);
        setAGarder(true);
    };

    const garder = () => {
        if (tours.length === 0) return;
        /* Deux temps sortent d'ici :
             — le temps par piece MESURE, pour la note du releve (le score
               compare le standard au reel : majorer ici le compterait deux fois) ;
             — le temps MAJORE, qui devient le standard du poste et donne la
               cadence : 3600 / majore = pieces par heure. */
        const cycleMoyen = tours.reduce((a, b) => a + b, 0) / tours.length;
        const parPiece = piecesParTour > 0 ? cycleMoyen / piecesParTour : cycleMoyen;
        onFinish(Math.round(parPiece), Number(((parPiece / 1000) * (majoration > 0 ? majoration : 1)).toFixed(2)));
        setAGarder(false);
        /* Enregistrer, c'est avoir fini : le panneau se replie sur son petit
           bouton, qui porte desormais le temps mesure. Le laisser ouvert
           occupait l'ecran pour une mesure deja rangee — et la ligne du poste
           montre le resultat (TS, objectif) juste au-dessus. */
        onToggle();
    };

    const effacer = () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setRunning(false);
        setElapsed(0);
        setTours([]);
        dernierTourRef.current = 0;
        setAGarder(false);
    };

    /** Secondes et centiemes : « 03.64 », la lecture du Chronometrage. */
    const fmt = (ms: number) => {
        const sec = Math.floor(ms / 1000);
        const cent = Math.floor((ms % 1000) / 10);
        return `${sec.toString().padStart(2, '0')}.${cent.toString().padStart(2, '0')}`;
    };

    /* Regle textile : le chrono donne un temps de CYCLE. Le temps par piece en
       decoule (un cycle peut sortir plusieurs pieces), puis le temps majore
       (aisance : repos, fatigue, aleas), et enfin la cadence horaire.

           T. piece  = T. cycle / pieces par cycle
           T. majore = T. piece × majoration
           P / H     = 3600 / T. majore

       C'est la cadence majoree qu'on tient une journee — la cadence brute ne
       vaut que le temps d'un cycle. */
    const moyenne = tours.length > 0 ? tours.reduce((a, b) => a + b, 0) / tours.length : 0;
    const msParPiece = piecesParTour > 0 ? moyenne / piecesParTour : 0;
    const secMajorees = (msParPiece / 1000) * (majoration > 0 ? majoration : 1);
    const piecesParHeure = secMajorees > 0 ? Math.round(3600 / secMajorees) : 0;
    const cumul = (idx: number) => tours.slice(0, idx + 1).reduce((a, b) => a + b, 0);

    if (!open) {
        return (
            <button
                type="button"
                onClick={onToggle}
                className="min-h-[36px] px-2.5 flex items-center gap-1.5 rounded-lg text-[11px] font-bold text-slate-500 dark:text-dk-muted bg-slate-50 dark:bg-dk-elevated/60 border border-slate-200 dark:border-dk-border"
            >
                <Clock className="w-3.5 h-3.5" />
                {tempsMs ? `${fmt(tempsMs)} s` : tx(lang, L.chrono)}
            </button>
        );
    }

    return (
        <div className="rounded-xl border border-slate-200 dark:border-dk-border/60 bg-slate-50 dark:bg-dk-elevated/40 p-2">
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-dk-muted">
                    {tx(lang, L.chronoTour)} {tours.length + (running ? 1 : 0)}
                </span>
                {tours.length > 0 && (
                    <span className="text-[10px] font-bold text-slate-400 dark:text-dk-muted tabular-nums">
                        {tx(lang, L.chronoMoyenne)} : <span className="text-slate-700 dark:text-dk-text font-black">{fmt(msParPiece)} s</span>
                    </span>
                )}
            </div>

            <div className="flex items-baseline gap-2">
                <span className="text-[22px] leading-none font-black tabular-nums text-slate-800 dark:text-dk-text">{fmt(elapsed)}</span>
                <span className="text-[13px] font-bold tabular-nums text-slate-400 dark:text-dk-muted">
                    {running ? fmt(elapsed - dernierTourRef.current) : ''}
                </span>
            </div>

            {/* Reglages et resultats sur UNE ligne : pieces par cycle, majoration,
                temps majore, cadence. Quatre nombres n'ont pas besoin de quatre
                blocs empiles. */}
            <div className="mt-1.5 grid grid-cols-4 gap-1">
                <label className="block">
                    <span className="block text-[8px] font-black uppercase tracking-wide text-slate-400 dark:text-dk-muted truncate" title={tx(lang, L.chronoPiecesTitre)}>{tx(lang, L.chronoPieces)}</span>
                    <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={String(piecesParTour)}
                        onChange={e => {
                            const chiffres = e.target.value.replace(/[^0-9]/g, '');
                            setPiecesParTour(chiffres === '' ? 1 : Math.max(1, parseInt(chiffres, 10)));
                        }}
                        className="w-full h-7 text-center text-[11px] font-black tabular-nums rounded-md border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-800 dark:text-dk-text outline-none"
                    />
                </label>
                <label className="block">
                    <span className="block text-[8px] font-black uppercase tracking-wide text-slate-400 dark:text-dk-muted truncate" title={tx(lang, L.chronoMajTitre)}>{tx(lang, L.chronoMaj)}</span>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={String(majoration)}
                        onChange={e => {
                            const propre = e.target.value.replace(/[^0-9.]/g, '');
                            const n = Number(propre);
                            setMajoration(Number.isFinite(n) && n > 0 ? n : 1);
                        }}
                        className="w-full h-7 text-center text-[11px] font-black tabular-nums rounded-md border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-800 dark:text-dk-text outline-none"
                    />
                </label>
                <span className="block">
                    <span className="block text-[8px] font-black uppercase tracking-wide text-slate-400 dark:text-dk-muted truncate">{tx(lang, L.chronoTMaj)}</span>
                    <span className="mt-px h-7 flex items-center justify-center rounded-md bg-emerald-50 dark:bg-emerald-900/20 text-[11px] font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                        {tours.length > 0 ? `${secMajorees.toFixed(2)}s` : '—'}
                    </span>
                </span>
                <span className="block" title={tx(lang, L.chronoPHTitre)}>
                    <span className="block text-[8px] font-black uppercase tracking-wide text-slate-400 dark:text-dk-muted truncate">{tx(lang, L.chronoPH)}</span>
                    <span className="mt-px h-7 flex items-center justify-center rounded-md bg-slate-800 dark:bg-dk-elevated text-[11px] font-black tabular-nums text-white">
                        {tours.length > 0 ? piecesParHeure : '—'}
                    </span>
                </span>
            </div>

            {aGarder && (
                <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-indigo-200 dark:border-dk-border bg-indigo-50 dark:bg-dk-accent/10 px-2 py-1.5">
                    <span className="min-w-0 flex-1 text-[10px] font-bold tabular-nums text-indigo-800 dark:text-dk-accent-text truncate" title={tx(lang, L.chronoQuestion)}>
                        {fmt(msParPiece)}s → {secMajorees.toFixed(2)}s · {piecesParHeure} P/H
                    </span>
                    <button
                        type="button"
                        onClick={garder}
                        className="shrink-0 h-7 px-2.5 rounded-md bg-indigo-600 text-white text-[11px] font-black flex items-center gap-1"
                    >
                        <Save className="w-3 h-3" /> {tx(lang, L.chronoGarder)}
                    </button>
                    <button
                        type="button"
                        onClick={effacer}
                        className="shrink-0 h-7 px-2 rounded-md text-[10px] font-bold text-slate-500 dark:text-dk-muted"
                    >
                        {tx(lang, L.chronoRefaire)}
                    </button>
                </div>
            )}

            <div className="mt-2 flex items-center gap-1.5">
                {!running ? (
                    <button
                        type="button"
                        onClick={demarrer}
                        className="h-8 px-4 rounded-lg bg-emerald-500 text-white text-[11px] font-black flex items-center justify-center gap-1.5"
                    >
                        <Play className="w-3.5 h-3.5" /> {tx(lang, L.chronoDebut)}
                    </button>
                ) : (
                    <>
                        <button
                            type="button"
                            onClick={marquerTour}
                            className="h-8 px-5 rounded-lg bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border text-slate-700 dark:text-dk-text text-[11px] font-black"
                        >
                            {tx(lang, L.chronoTour)}
                        </button>
                        <button
                            type="button"
                            onClick={annulerDernier}
                            disabled={tours.length === 0}
                            className="h-8 px-2 rounded-lg text-[10px] font-bold text-slate-500 dark:text-dk-muted disabled:opacity-30"
                        >
                            {tx(lang, L.chronoAnnuler)}
                        </button>
                        <button
                            type="button"
                            onClick={arreter}
                            className="h-8 px-3 rounded-lg bg-rose-500 text-white text-[11px] font-black flex items-center justify-center gap-1.5"
                        >
                            <Square className="w-3.5 h-3.5" /> {tx(lang, L.chronoArret)}
                        </button>
                    </>
                )}
                <button type="button" onClick={onToggle} className="h-8 px-2 text-[11px] font-bold text-slate-400 ml-auto">×</button>
            </div>

            {tours.length > 0 && (
                <div className="mt-2 rounded-lg bg-white dark:bg-dk-surface border border-slate-100 dark:border-dk-border/50 overflow-hidden">
                    <div className="max-h-24 overflow-y-auto scrollbar-thin">
                    <table className="w-full text-[11px]">
                        <thead>
                            <tr className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-dk-muted border-b border-slate-100 dark:border-dk-border/50">
                                <th className="text-left px-2 py-1">{tx(lang, L.chronoTour)}</th>
                                <th className="text-center px-2 py-1">{tx(lang, L.chronoTTour)}</th>
                                <th className="text-right px-2 py-1">{tx(lang, L.chronoTTotal)}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-dk-border/30">
                            {tours.map((t, idx) => (
                                <tr key={idx}>
                                    <td className="px-2 py-1 font-black tabular-nums text-slate-700 dark:text-dk-text">{String(idx + 1).padStart(2, '0')}</td>
                                    <td className="px-2 py-1 text-center font-bold tabular-nums text-slate-700 dark:text-dk-text">{fmt(t)}</td>
                                    <td className="px-2 py-1 text-right font-bold tabular-nums text-slate-400 dark:text-dk-muted">{fmt(cumul(idx))}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
                    <button
                        type="button"
                        onClick={effacer}
                        className="w-full py-1.5 text-[11px] font-black text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 border-t border-rose-100 dark:border-rose-900/30"
                    >
                        × {tx(lang, L.chronoEffacer)}
                    </button>
                </div>
            )}

        </div>
    );
}

