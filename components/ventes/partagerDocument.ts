/**
 * Fabriquer un vrai fichier PDF a partir du document imprimable, puis le
 * partager.
 *
 * Aucun lien WhatsApp ne peut joindre un fichier : wa.me ouvre une
 * conversation avec du texte, rien d'autre. Le seul chemin qui met le PDF
 * dans la main du client sans passer par l'API payante de Meta est le partage
 * natif du systeme — une fenetre ou l'on choisit WhatsApp puis le contact.
 * C'est un geste au lieu de trois (imprimer, enregistrer, joindre).
 *
 * Quand le systeme ne sait pas partager de fichiers (la plupart des
 * navigateurs de bureau), on telecharge le PDF et on ouvre la conversation :
 * le fichier est pret a etre glisse. On le DIT plutot que de laisser croire
 * a un envoi qui n'a pas eu lieu.
 */

const chargerHtml2Canvas = () => import('html2canvas').then(m => m.default);
const chargerJsPdf = () => import('jspdf').then(m => m.jsPDF);

/** Rend le document dans un cadre hors ecran, a la largeur d'une page A4. */
const rendreCanvas = async (html: string, largeurPx: number) => {
    const cadre = document.createElement('iframe');
    cadre.style.cssText = `position:fixed;left:-10000px;top:0;width:${largeurPx}px;height:100px;border:0;opacity:0`;
    document.body.appendChild(cadre);
    try {
        const doc = cadre.contentWindow?.document;
        if (!doc) throw new Error('Rendu impossible dans ce navigateur.');
        doc.open();
        doc.write(html);
        doc.close();

        // Les images sont des data-URL : elles sont pretes des le parse, mais
        // la mise en page a besoin d'un tour de boucle pour se poser.
        await new Promise(r => window.setTimeout(r, 350));
        const corps = doc.body;
        cadre.style.height = `${corps.scrollHeight + 40}px`;
        await new Promise(r => window.setTimeout(r, 60));

        const html2canvas = await chargerHtml2Canvas();
        return await html2canvas(corps, { scale: 2, backgroundColor: '#ffffff', useCORS: true, windowWidth: largeurPx });
    } finally {
        cadre.remove();
    }
};

/** Le document imprimable devient un PDF A4, decoupe en pages s'il deborde. */
export const enPdf = async (html: string, nomFichier: string): Promise<File> => {
    const LARGEUR_A4 = 794; // 210 mm a 96 dpi
    const canvas = await rendreCanvas(html, LARGEUR_A4);

    const jsPDF = await chargerJsPdf();
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const largeurMm = 210;
    const hauteurMm = 297;
    const hauteurImage = (canvas.height * largeurMm) / canvas.width;

    const image = canvas.toDataURL('image/jpeg', 0.92);
    if (hauteurImage <= hauteurMm) {
        pdf.addImage(image, 'JPEG', 0, 0, largeurMm, hauteurImage);
    } else {
        // Plus haut qu'une page : on decale la meme image page apres page,
        // ce qui evite de recouper le canvas et de perdre une ligne au pli.
        let reste = hauteurImage;
        let position = 0;
        while (reste > 0.5) {
            pdf.addImage(image, 'JPEG', 0, -position, largeurMm, hauteurImage);
            reste -= hauteurMm;
            position += hauteurMm;
            if (reste > 0.5) pdf.addPage();
        }
    }

    const blob = pdf.output('blob');
    return new File([blob], nomFichier.endsWith('.pdf') ? nomFichier : `${nomFichier}.pdf`, { type: 'application/pdf' });
};

export type ResultatPartage = 'PARTAGE' | 'TELECHARGE';

/**
 * Partage le fichier par le systeme quand c'est possible ; sinon le
 * telecharge et ouvre la conversation WhatsApp.
 */
export const partagerOuTelecharger = async (
    fichier: File,
    texte: string,
    numeroInternational: string | null,
): Promise<ResultatPartage> => {
    const nav = navigator as Navigator & { canShare?: (d: any) => boolean; share?: (d: any) => Promise<void> };

    if (nav.share && nav.canShare?.({ files: [fichier] })) {
        try {
            await nav.share({ files: [fichier], text: texte, title: fichier.name });
            return 'PARTAGE';
        } catch (e: any) {
            // L'utilisateur a ferme la feuille de partage : ce n'est pas une
            // panne, on ne bascule pas sur le telechargement.
            if (e?.name === 'AbortError') return 'PARTAGE';
        }
    }

    const url = URL.createObjectURL(fichier);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = fichier.name;
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);

    if (numeroInternational) {
        window.open(`https://wa.me/${numeroInternational}?text=${encodeURIComponent(texte)}`, '_blank', 'noopener');
    }
    return 'TELECHARGE';
};
