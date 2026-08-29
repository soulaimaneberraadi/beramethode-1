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

/**
 * Rend le document hors ecran, a la largeur d une page A4.
 *
 * Le rendu se fait dans un conteneur de LA page, pas dans un cadre isole :
 * html2canvas doit lire les styles calcules, et un iframe cache (opacity 0,
 * hors viewport) ne lui en donne aucun — la promesse ne se resolvait jamais
 * et le bouton restait sur « Preparation... ».
 */
const rendreCanvas = async (html: string, largeurPx: number) => {
    const corpsHtml = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
    const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join("\n");

    const hote = document.createElement("div");
    // Visible pour le moteur de rendu, invisible pour l oeil : derriere la
    // page et sans interaction, plutot que masque — un element masque n a pas
    // de styles calcules.
    hote.style.cssText = [
        "position:fixed", "left:0", "top:0", `width:${largeurPx}px`,
        "background:#fff", "z-index:-1", "pointer-events:none", "opacity:0.01",
    ].join(";");

    const style = document.createElement("style");
    // Les regles du document sont portees sur le conteneur pour ne pas
    // repeindre l application autour.
    style.textContent = styles.replace(/(^|\})\s*(body|html)\b/g, "$1 .bera-doc-rendu");
    hote.appendChild(style);

    const contenu = document.createElement("div");
    contenu.className = "bera-doc-rendu";
    contenu.innerHTML = corpsHtml.replace(/<script[\s\S]*?<\/script>/gi, "");
    hote.appendChild(contenu);
    document.body.appendChild(hote);

    try {
        // Les images sont des data-URL : elles n ont rien a telecharger, mais
        // le decodage prend un tour de boucle.
        await Promise.all([...contenu.querySelectorAll("img")].map(img => (img as HTMLImageElement).decode().catch(() => undefined)));
        await new Promise(r => window.setTimeout(r, 80));

        const html2canvas = await chargerHtml2Canvas();
        // Un rendu qui n aboutit pas doit rendre la main : sans ce garde-fou,
        // le bouton tourne indefiniment sans dire pourquoi.
        return await Promise.race([
            html2canvas(contenu, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false }),
            new Promise<never>((_, rejeter) => window.setTimeout(
                () => rejeter(new Error("Le rendu du PDF a pris trop de temps. Essayez sans les photos.")), 25000)),
        ]);
    } finally {
        hote.remove();
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

export type ResultatPartage = 'PARTAGE' | 'TELECHARGE' | 'NON_SECURISE';

/**
 * Partage le fichier par le systeme quand c est possible ; sinon le telecharge
 * et laisse l appelant proposer WhatsApp.
 *
 * Deux pieges tenus ici :
 *
 * 1. navigator.share n existe QUE dans un contexte securise. Ouvert en
 *    http://192.168.x.x depuis un telephone, il est absent — d ou un bouton
 *    qui semble ne rien faire. On le dit au lieu de le subir.
 *
 * 2. Ouvrir une fenetre APRES un await ne marche pas sur iOS : le geste de
 *    l utilisateur est deja consomme et Safari bloque. On ne tente donc plus
 *    window.open ici ; l ecran affiche un vrai lien, que le doigt touche.
 */
export const partagerOuTelecharger = async (
    fichier: File,
    texte: string,
): Promise<ResultatPartage> => {
    const nav = navigator as Navigator & { canShare?: (d: any) => boolean; share?: (d: any) => Promise<void> };

    if (nav.share && nav.canShare?.({ files: [fichier] })) {
        try {
            await nav.share({ files: [fichier], text: texte, title: fichier.name });
            return 'PARTAGE';
        } catch (e: any) {
            // Feuille de partage refermee : ce n est pas une panne.
            if (e?.name === 'AbortError') return 'PARTAGE';
        }
    }

    const url = URL.createObjectURL(fichier);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = fichier.name;
    lien.target = '_blank';
    lien.rel = 'noopener';
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 120000);

    return window.isSecureContext ? 'TELECHARGE' : 'NON_SECURISE';
};
