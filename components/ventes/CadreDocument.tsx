import React from 'react';

/**
 * Un document A4 dans un ecran de telephone.
 *
 * Le document a une largeur fixe — c'est une feuille, pas une page web. Le
 * mettre tel quel dans un cadre etroit coupait la moitie du tableau a droite.
 * On le rend donc a sa vraie largeur, puis on le REDUIT a l'echelle du cadre :
 * tout reste lisible et rien n'est perdu, comme un apercu avant impression.
 */
const CadreDocument: React.FC<{ html: string; largeurDoc?: number; titre?: string }> = ({ html, largeurDoc = 800, titre = 'Document' }) => {
    const hote = React.useRef<HTMLDivElement>(null);
    const [echelle, setEchelle] = React.useState(1);
    const [hauteur, setHauteur] = React.useState(900);

    React.useLayoutEffect(() => {
        const mesurer = () => {
            const large = hote.current?.clientWidth || largeurDoc;
            setEchelle(Math.min(1, large / largeurDoc));
        };
        mesurer();
        window.addEventListener('resize', mesurer);
        return () => window.removeEventListener('resize', mesurer);
    }, [largeurDoc]);

    // La hauteur utile ne se devine pas : elle se lit dans le document une
    // fois pose, sinon le cadre coupe la derniere page ou laisse un grand vide.
    const auChargement = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
        const doc = e.currentTarget.contentDocument;
        if (doc?.body) setHauteur(Math.max(400, doc.body.scrollHeight + 24));
    };

    return (
        <div ref={hote} className="w-full overflow-hidden" style={{ height: hauteur * echelle }}>
            <iframe
                title={titre}
                srcDoc={html}
                onLoad={auChargement}
                className="border-0 bg-white"
                style={{
                    width: largeurDoc,
                    height: hauteur,
                    transform: `scale(${echelle})`,
                    transformOrigin: 'top left',
                }}
            />
        </div>
    );
};

export default CadreDocument;
