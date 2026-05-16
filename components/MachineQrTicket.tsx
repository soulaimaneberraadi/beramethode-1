import React, { useMemo, useRef, useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { Printer, X, CheckCircle, AlertTriangle, Wrench } from 'lucide-react';
import type { CompanyProfile, Machine } from '../types';
import { buildMachineQrPayload } from '../lib/machineQrPayload';

// ── Helpers ──────────────────────────────────────────────
function formatAddress(p: CompanyProfile): string | null {
  const parts = [
    p.address?.trim(),
    [p.city?.trim(), p.country?.trim()].filter(Boolean).join(', '),
  ].filter(Boolean) as string[];
  return parts.join(' · ') || null;
}

function getStatus(s?: string) {
  if (s === 'PANNE') return { label: 'Panne', color: '#ef4444', bg: '#fef2f2', dot: '#ef4444' };
  if (s === 'MAINT') return { label: 'Maintenance', color: '#d97706', bg: '#fffbeb', dot: '#d97706' };
  return { label: 'Opérationnel', color: '#16a34a', bg: '#f0fdf4', dot: '#16a34a' };
}

// ── Print helper — serializes SVG → full label HTML ─────
function buildPrintHtml(opts: {
  displayName: string;
  addressLine: string | null;
  phone: string;
  machine: Machine;
  svgString: string;
  fileName: string;
}) {
  const { displayName, addressLine, phone, machine, svgString } = opts;
  const st = getStatus(machine.status);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${opts.fileName}</title>
  <style>
    @page { size: 90mm 60mm landscape; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 90mm; height: 60mm;
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: #fff;
      display: flex;
    }
    /* Left stripe */
    .stripe {
      width: 8mm; background: #1e1b4b;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .stripe-text {
      writing-mode: vertical-rl; transform: rotate(180deg);
      font-size: 5pt; font-weight: 900; letter-spacing: 0.2em;
      text-transform: uppercase; color: #818cf8;
    }
    /* Main body */
    .body {
      flex: 1; display: flex; flex-direction: column;
      padding: 3mm 3mm 3mm 3mm;
      overflow: hidden;
    }
    /* Top row */
    .top-row {
      display: flex; align-items: flex-start;
      justify-content: space-between; gap: 3mm;
      padding-bottom: 2.5mm; border-bottom: 0.5pt solid #e2e8f0;
      margin-bottom: 2.5mm;
    }
    .company-block {}
    .company-name { font-size: 7pt; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; color: #1e1b4b; }
    .company-sub { font-size: 5pt; color: #64748b; font-weight: 500; margin-top: 1mm; line-height: 1.4; }
    .status-badge {
      display: flex; align-items: center; gap: 1.5mm;
      background: ${st.bg}; border: 0.5pt solid ${st.dot};
      border-radius: 2mm; padding: 0.7mm 2mm; flex-shrink: 0;
    }
    .status-dot { width: 2mm; height: 2mm; border-radius: 50%; background: ${st.dot}; }
    .status-text { font-size: 5pt; font-weight: 800; color: ${st.color}; text-transform: uppercase; letter-spacing: 0.07em; }
    /* Middle */
    .mid-row { display: flex; gap: 3mm; flex: 1; min-height: 0; }
    /* Info side */
    .info-side { flex: 1; display: flex; flex-direction: column; justify-content: space-between; }
    .mach-name { font-size: 11pt; font-weight: 900; color: #0f172a; letter-spacing: -0.03em; line-height: 1.15; margin-bottom: 2.5mm; }
    .mach-cat { display: inline-block; background: #f1f5f9; color: #475569; border-radius: 1.5mm; padding: 0.5mm 1.5mm; font-size: 5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 1.5mm; }
    /* Fields grid */
    .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5mm 3mm; }
    .field { display: flex; flex-direction: column; gap: 0.5mm; }
    .field-lbl { font-size: 4.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; }
    .field-val { font-size: 7.5pt; font-weight: 700; color: #1e293b; }
    .field-val-mono { font-family: 'Courier New', monospace; font-size: 7pt; font-weight: 700; color: #334155; letter-spacing: 0.04em; }
    /* QR side */
    .qr-side {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 1.5mm; flex-shrink: 0;
    }
    .qr-wrap {
      background: #fff; border: 0.5pt solid #e2e8f0;
      border-radius: 2mm; padding: 2mm;
      display: flex; align-items: center; justify-content: center;
    }
    .qr-hint { font-size: 4pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #94a3b8; text-align: center; }
    /* Footer */
    .footer {
      display: flex; align-items: center; justify-content: space-between;
      padding-top: 2mm; border-top: 0.5pt solid #f1f5f9; margin-top: 2mm;
    }
    .footer-id { font-family: 'Courier New', monospace; font-size: 5pt; color: #94a3b8; font-weight: 600; }
    .footer-parc { font-size: 5pt; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #c7d2fe; background: #1e1b4b; padding: 0.5mm 2mm; border-radius: 1.5mm; }
  </style>
</head>
<body>
  <div class="stripe">
    <span class="stripe-text">Parc Machines</span>
  </div>
  <div class="body">
    <div class="top-row">
      <div class="company-block">
        <div class="company-name">${displayName}</div>
        <div class="company-sub">${[addressLine, phone].filter(Boolean).join(' · ') || 'Industrial Fleet'}</div>
      </div>
      <div class="status-badge">
        <div class="status-dot"></div>
        <span class="status-text">${st.label}</span>
      </div>
    </div>

    <div class="mid-row">
      <div class="info-side">
        ${machine.machineCategory ? `<span class="mach-cat">${machine.machineCategory}</span>` : ''}
        <div class="mach-name">${machine.name}</div>
        <div class="fields">
          <div class="field">
            <span class="field-lbl">Matricule</span>
            <span class="field-val">${machine.matricule?.trim() || '—'}</span>
          </div>
          <div class="field">
            <span class="field-lbl">Classe</span>
            <span class="field-val">${machine.classe}</span>
          </div>
          <div class="field">
            <span class="field-lbl">N° Série</span>
            <span class="field-val-mono">${machine.serialNumber?.trim() || '—'}</span>
          </div>
          <div class="field">
            <span class="field-lbl">Marque</span>
            <span class="field-val">${machine.brand?.trim() || '—'}</span>
          </div>
        </div>
      </div>

      <div class="qr-side">
        <div class="qr-wrap">${svgString}</div>
        <span class="qr-hint">Fiche Technique</span>
      </div>
    </div>

    <div class="footer">
      <span class="footer-id">ID: ${machine.id.slice(0, 10).toUpperCase()}</span>
      <span class="footer-parc">${displayName}</span>
    </div>
  </div>
</body>
</html>`;
}

// ── Component ─────────────────────────────────────────────
export function MachineQrTicket({
  machine,
  companyProfile,
  onClose,
}: {
  machine: Machine;
  companyProfile: CompanyProfile;
  onClose: () => void;
}) {
  const qrRef  = useRef<HTMLDivElement>(null);
  const displayName = (companyProfile.companyName || companyProfile.legalName || '').trim() || 'BERAMETHODE';
  const addressLine  = formatAddress(companyProfile);
  const phone        = (companyProfile.phone || '').trim();
  const st           = getStatus(machine.status);

  const qrValue = useMemo(
    () => buildMachineQrPayload(machine, { companyName: displayName }),
    [machine, displayName],
  );

  const print = () => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;
    // Inline the SVG dimensions so it renders correctly when detached
    const svgClone = svg.cloneNode(true) as SVGElement;
    svgClone.setAttribute('width',  '90');
    svgClone.setAttribute('height', '90');
    const svgString = svgClone.outerHTML;

    const fileName = [
      displayName.replace(/[^a-zA-Z0-9À-ÿ]/g, '_').replace(/_+/g, '_').toUpperCase(),
      'ETQ',
      (machine.matricule || machine.id.slice(0, 6)).toUpperCase(),
      machine.name.replace(/[^a-zA-Z0-9À-ÿ]/g, '_').replace(/_+/g, '_'),
    ].join('_');

    const html = buildPrintHtml({ displayName, addressLine, phone, machine, svgString, fileName });

    const w = window.open('', '_blank', 'width=900,height=640');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 500);
  };

  // ── Preview data ──────────────────────────────────────
  const fields: { label: string; value: string; mono?: boolean }[] = [
    { label: 'Matricule', value: machine.matricule?.trim() || '—' },
    { label: 'Classe',    value: machine.classe },
    { label: 'N° Série',  value: machine.serialNumber?.trim() || '—', mono: true },
    { label: 'Marque',    value: machine.brand?.trim() || '—' },
  ];

  return (
    <div className="fixed inset-0 z-[1100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Sheet / Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="qrt-title"
        className="relative z-10 w-full sm:max-w-sm bg-white rounded-t-[32px] sm:rounded-[28px] shadow-2xl overflow-hidden
                   animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300"
      >
        {/* ── Handle bar (mobile) */}
        <div className="sm:hidden w-10 h-1 rounded-full bg-slate-200 mx-auto mt-3 mb-1" />

        {/* ── Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
          <div>
            <p id="qrt-title" className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">
              Étiquette Parc
            </p>
            <p className="text-sm font-black text-slate-900 mt-0.5 leading-tight truncate max-w-[220px]">
              {machine.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Label Preview Card */}
        <div className="p-4">
          {/* Card mimics the printed label proportions */}
          <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex bg-white" style={{ minHeight: 160 }}>

            {/* Vertical stripe */}
            <div className="w-7 bg-[#1e1b4b] flex-shrink-0 flex items-center justify-center">
              <p
                className="text-[7px] font-black uppercase tracking-[0.18em] text-[#818cf8]"
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              >
                Parc Machines
              </p>
            </div>

            {/* Content */}
            <div className="flex-1 p-3 flex flex-col gap-2.5 min-w-0">

              {/* Top: company + status */}
              <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-100">
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-widest text-[#1e1b4b] leading-none">{displayName}</p>
                  {(addressLine || phone) && (
                    <p className="text-[8px] text-slate-400 font-medium mt-0.5 truncate">
                      {[addressLine, phone].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <div
                  className="flex items-center gap-1 shrink-0 rounded-full px-2 py-0.5 border text-[7px] font-black uppercase tracking-wide"
                  style={{ background: st.bg, borderColor: st.dot, color: st.color }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} />
                  {st.label}
                </div>
              </div>

              {/* Middle: name + fields + QR */}
              <div className="flex gap-3 min-w-0">

                {/* Info */}
                <div className="flex-1 min-w-0">
                  {machine.machineCategory && (
                    <span className="inline-block bg-slate-100 text-slate-500 text-[7px] font-black uppercase tracking-wide rounded px-1.5 py-0.5 mb-1">
                      {machine.machineCategory}
                    </span>
                  )}
                  <p className="text-[14px] font-black text-slate-900 leading-none tracking-tight mb-2 truncate">
                    {machine.name}
                  </p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    {fields.map(f => (
                      <div key={f.label}>
                        <p className="text-[7px] font-black uppercase tracking-widest text-slate-400 leading-none mb-0.5">{f.label}</p>
                        <p className={`text-[9px] font-bold text-slate-800 truncate ${f.mono ? 'font-mono' : ''}`}>{f.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* QR */}
                <div ref={qrRef} className="flex flex-col items-center gap-1 shrink-0">
                  <div className="bg-white border border-slate-100 rounded-xl p-1.5 shadow-sm">
                    <QRCode value={qrValue} size={90} level="M" />
                  </div>
                  <p className="text-[6px] font-bold uppercase tracking-widest text-slate-400 text-center">
                    Fiche Technique
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="font-mono text-[8px] text-slate-400 font-semibold">
                  ID: {machine.id.slice(0, 10).toUpperCase()}
                </span>
                <span className="text-[7px] font-black uppercase tracking-widest text-[#c7d2fe] bg-[#1e1b4b] px-2 py-0.5 rounded-full">
                  {displayName}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Print button */}
        <div className="px-4 pb-5 pt-0">
          <button
            type="button"
            onClick={print}
            className="w-full flex items-center justify-center gap-2.5 bg-[#1e1b4b] hover:bg-indigo-900 active:scale-[0.98]
                       text-white text-[11px] font-black uppercase tracking-widest py-4 rounded-2xl
                       shadow-xl shadow-indigo-900/30 transition-all duration-200"
          >
            <Printer className="w-4 h-4 opacity-80" />
            Imprimer l'Étiquette
          </button>
        </div>
      </div>
    </div>
  );
}
