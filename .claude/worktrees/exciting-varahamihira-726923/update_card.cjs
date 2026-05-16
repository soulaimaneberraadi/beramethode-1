const fs = require('fs');
const path = 'c:\\Users\\HP\\3D Objects\\BERAMETHODE\\components\\Implantation.tsx';
let content = fs.readFileSync(path, 'utf8');

const startStr = "    const StationCard: React.FC<{ station: Workstation; isGrid?: boolean; isMini?: boolean }> = ({ station, isGrid = false, isMini = false }) => {";
const endStr = "    return (\n        <div className=\"flex flex-col h-full gap-2 relative\">";

const startIdx = content.indexOf(startStr);
const endIdx = content.indexOf(endStr);

if (startIdx !== -1 && endIdx !== -1) {
    const newCard = `    const StationCard: React.FC<{ station: Workstation; isGrid?: boolean; isMini?: boolean }> = ({ station, isGrid = false, isMini = false }) => {
        const color = station.color; const isVide = station.machine === 'VIDE'; const timeInSeconds = Math.round(station.totalTime * 60); const hasNotes = station.notes && station.notes.trim().length > 0; const hasOperator = station.operatorName && station.operatorName.trim().length > 0; const isOverridden = station.timeOverride !== undefined; const mySimIndex = station.index - 1; const isActive = !isMini && simStep === mySimIndex; const isPassed = simStep > mySimIndex; const isControl = station.machine.toUpperCase().includes('CONTROLE'); const isFer = station.machine.toUpperCase().includes('FER') || station.machine.toUpperCase().includes('REPASSAGE'); const isFinition = station.machine.toUpperCase().includes('FINITION'); const isBroken = station.notes?.includes('#PANNE');
        let bodyBgClass = 'bg-white'; if (isControl) bodyBgClass = 'bg-orange-50'; if (isFer) bodyBgClass = 'bg-rose-50'; if (isFinition) bodyBgClass = 'bg-purple-50'; const isSpecial = isControl || isFer || isFinition;
        const isFeeder = station.isFeeder; if (isFeeder) bodyBgClass = 'bg-blue-50';
        const isSwapSource = swapSourceId === station.id; const isSwapTarget = swapSourceId && swapSourceId !== station.id; const isLinkSource = linkSource === station.id; const isLinkTargetCandidate = isLinking && linkSource && linkSource !== station.id;
        const cardHeightClass = isGrid ? 'min-h-[140px]' : (isMini ? 'min-h-[80px]' : 'h-full min-h-[140px]'); const cardWidthClass = isMini ? 'w-full' : (isGrid ? 'w-full' : 'w-44 sm:w-48 shrink-0'); const miniCardStyle = isMini ? 'border-slate-200 border' : 'border'; const cursorClass = (canEdit && isManualMode && !swapSourceId && !isLinking && !isSpacePressed) ? 'cursor-move' : 'cursor-default';

        // Get Guides / Accessories used
        const guidesUsedStr = station.operations.filter(op => (op.guideName && op.guideName.trim() !== '') || (op.guideFactor !== undefined && op.guideFactor > 1.2)).map(op => op.guideName || \`Guide \${op.guideFactor}\`);
        const guidesUsed = Array.from(new Set(guidesUsedStr));

        if (isVide && !isMini) {
            return (
                <div
                    id={\`station-card-\${station.id}\`}
                    draggable={canEdit && isManualMode && !swapSourceId && !isLinking && layoutType !== 'free' && !isSpacePressed}
                    onDragStart={(e) => handleDragStart(e, station.originalIndex, false, station.id)}
                    onDragEnd={() => setDraggedStationIdx(null)}
                    onMouseDown={(e) => layoutType === 'free' && handleFreeStart(e, station.id, station.x || 0, station.y || 0)}
                    onTouchStart={(e) => layoutType === 'free' && handleFreeStart(e, station.id, station.x || 0, station.y || 0)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(e, station.originalIndex); }}
                    onContextMenu={(e) => { handleContextMenu(e, station); }}
                    className={\`relative rounded-md border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center gap-2 group z-10 transition-transform \${(canEdit && isManualMode && !swapSourceId && !isLinking && !isSpacePressed && layoutType !== 'free') ? 'cursor-move' : ''} \${cardWidthClass} \${cardHeightClass} \${isManualMode && !isSpacePressed ? 'hover:bg-slate-100 hover:border-slate-400 hover:-translate-y-[2px]' : ''} \${layoutType === 'free' ? 'cursor-move hover:shadow-lg' : ''}\`}
                >
                    <div className="font-mono text-[10px] font-bold text-slate-400 uppercase pointer-events-none">Emplacement Vide</div>
                    {layoutType === 'free' && (
                        <button onClick={(e) => { e.stopPropagation(); handleRemoveFromCanvas(station.id); }} className="absolute top-2 right-2 p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity">
                            <X className="w-3 h-3" />
                        </button>
                    )}
                </div>
            );
        }

        return (
            <div
                id={isMini ? \`station-card-mini-\${station.id}\` : \`station-card-\${station.id}\`}
                onClick={() => handleStationClick(station)}
                onContextMenu={(e) => { handleContextMenu(e, station); }}
                onDoubleClick={(e) => handleOpenEditModal(e, station)}
                draggable={canEdit && isManualMode && !swapSourceId && !isLinking && layoutType !== 'free' && !isSpacePressed}
                onDragStart={(e) => handleDragStart(e, station.originalIndex, isMini, station.id)}
                onDragEnd={() => setDraggedStationIdx(null)}
                onDragOver={handleDragOver}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(e, station.originalIndex); }}
                className={\`relative rounded-sm overflow-hidden group shadow-sm z-10 \${cardWidthClass} \${cardHeightClass} \${canEdit && isManualMode && !isLinking && layoutType !== 'free' && !isSpacePressed ? 'hover:-translate-y-[2px] hover:shadow-md' : ''} \${cursorClass} \${isActive ? 'ring-2 ring-emerald-400 border-emerald-500 shadow-md z-20' : isLinkSource ? 'ring-2 ring-indigo-500 border-indigo-600 shadow-md z-20 animate-pulse' : isLinkTargetCandidate ? 'cursor-pointer hover:ring-2 hover:ring-indigo-300 hover:border-indigo-400' : isSwapSource ? 'ring-2 ring-indigo-500 border-indigo-600 shadow-md z-20' : isSwapTarget ? 'cursor-pointer hover:ring-2 hover:ring-indigo-300 hover:border-indigo-400' : isPassed ? 'border-emerald-200' : 'border-slate-300 border-y border-r'} \${isBroken ? 'ring-1 ring-rose-500 border-rose-600 bg-rose-50' : ''} \${miniCardStyle} transition-transform duration-200 flex flex-col select-none\`}
            >
                <div className={\`absolute left-0 top-0 bottom-0 w-[4px] \${isActive ? 'bg-emerald-500' : (isBroken ? 'bg-rose-500' : (isMini ? color.fill : color.fill))}\`}></div>
                <div className={\`px-2 pl-3 py-1 flex justify-between items-center bg-slate-100 border-b border-slate-200 relative\`}>
                    {isOverridden && <div className="absolute top-1 right-1 w-2 h-2 bg-purple-500" title="Temps Forcé"></div>}
                    {isBroken && <div className="absolute top-1 right-3 text-rose-600 animate-pulse"><AlertTriangle className="w-3 h-3 fill-current" /></div>}
                    <div className="flex items-center gap-1.5">
                        {(canEdit && isManualMode && !isSpacePressed && layoutType !== 'free') && <div className="text-slate-300 text-[10px] leading-none opacity-0 group-hover:opacity-100 transition-opacity">⠿</div>}
                        <span className={\`font-mono text-[10px] tracking-wider font-bold \${isActive ? 'text-emerald-700' : 'text-slate-700'}\`}> #{station.name.replace('P', '').split('.')[0]} </span>
                        <span className={\`font-mono text-[9px] font-bold uppercase truncate max-w-[70px] \${isActive ? 'text-emerald-600' : 'text-slate-500'}\`} title={station.name}> [{station.machine}] </span>
                    </div>

                    {showLinks && manualLinks && manualLinks.some(l => l.from === station.id || l.to === station.id) && (
                        <button onClick={(e) => { e.stopPropagation(); const linkToDelete = manualLinks.find(l => l.from === station.id || l.to === station.id); if (linkToDelete) handleRemoveLink(linkToDelete.id); }} className="p-0.5 rounded-sm bg-rose-100 text-rose-600 hover:bg-rose-500 hover:text-white transition-colors z-30" title="Supprimer la liaison"><Unlink2 className="w-2.5 h-2.5" /></button>
                    )}

                    {!isMini && (
                        <div className="ml-auto mr-0.5 flex items-center gap-0.5">
                            {isManualMode && (
                                <button onClick={(e) => { e.stopPropagation(); handleRemoveFromCanvas(station.id); }} className="p-0.5 rounded-sm hover:bg-rose-100 hover:text-rose-600 text-slate-400 transition-colors opacity-0 group-hover:opacity-100 z-50" title="Retirer du plan"><X className="w-3 h-3" /></button>
                            )}
                            <button onClick={(e) => handleContextMenu(e, station)} className="p-0.5 rounded-sm hover:bg-slate-200 text-slate-400 transition-colors"><MoreVertical className="w-3 h-3" /></button>
                        </div>
                    )}
                    {!isMini && (<div className="flex items-center gap-0.5"> {isFeeder && <div title={\`Alimente: \${station.targetStationName || 'Poste Suivant'}\`}><GitMerge className={\`w-3 h-3 \${isActive ? 'text-slate-600' : 'text-blue-500'}\`} /></div>} {hasOperator && <div title={station.operatorName}><User className={\`w-3 h-3 \${isActive ? 'text-slate-600' : 'text-slate-400'}\`} /></div>} {hasNotes && <div title="Notes"><FileText className={\`w-3 h-3 \${isActive ? 'text-yellow-500' : 'text-amber-500'}\`} /></div>} </div>)}
                </div>
                <div className={\`p-2 pl-3 flex-1 flex flex-col justify-between gap-1 \${isMini ? 'bg-white' : bodyBgClass}\`}> 
                    {station.groups && station.groups.length > 0 && !isMini && (<div className="flex flex-wrap gap-1 mb-1"> {station.groups.slice(0, 2).map(grp => (<span key={grp} className="font-mono text-[7px] font-bold uppercase text-slate-700 bg-slate-200 px-1 border border-slate-300 truncate max-w-full"> {grp} </span>))} {station.groups.length > 2 && <span className="font-mono text-[7px] text-slate-400">+{station.groups.length - 2}</span>} </div>)} 
                    
                    {/* GUIDES / ACCESSORIES BADGE */}
                    {guidesUsed.length > 0 && !isMini && (
                        <div className="flex flex-col gap-0.5 mb-1 mt-0.5">
                            {guidesUsed.map((gd, idx) => (
                                <span key={idx} className="font-mono text-[8px] font-bold py-[1px] px-1 bg-amber-50 text-amber-700 border border-amber-200 self-start truncate max-w-[120px] shadow-sm">
                                    [G] {gd}
                                </span>
                            ))}
                        </div>
                    )}

                    <div className="space-y-0.5"> {station.operations.length > 0 ? (<> {station.operations.slice(0, isMini ? 100 : 3).map((op, i) => { const groupStyle = op.groupId ? getGroupStyle(op.groupId) : null; return (<div key={i} className={\`flex justify-between items-center gap-1.5 py-0.5 \${groupStyle && isMini ? groupStyle.bg + ' px-1.5 rounded-sm -mx-1.5 my-0.5 border border-transparent' : ''}\`}> <span className={\`font-mono text-[8px] font-bold px-1 border shrink-0 \${groupStyle && isMini ? 'bg-white/50 border-transparent ' + groupStyle.text : 'bg-slate-50 text-slate-400 border-slate-200'}\`}> {op.order} </span> <div className={\`font-mono text-[8px] font-bold leading-tight line-clamp-2 flex-1 \${groupStyle && isMini ? groupStyle.text : 'text-slate-600'}\`} title={op.description}> {op.description} </div> {groupStyle && isMini && <LinkIcon className={\`w-2 h-2 shrink-0 \${groupStyle.text}\`} />} </div>) })} {station.operations.length > (isMini ? 100 : 3) && <div className="font-mono text-[7px] text-slate-400 font-medium">... +{station.operations.length - (isMini ? 100 : 3)}</div>} </>) : (<div className={\`font-mono text-[9px] italic flex items-center justify-center \${isMini ? 'h-8' : 'h-12'} \${isOverridden ? 'text-purple-500 font-bold' : (isSpecial ? 'text-slate-400' : 'text-slate-300')}\`}> {isOverridden ? 'FORCED' : 'VIDE'} </div>)} </div> 
                    <div className="flex items-center justify-between mt-auto pt-1.5 border-t border-slate-200"> 
                        <div className="flex flex-col"> <span className="font-mono text-[7px] font-bold text-slate-400 uppercase tracking-widest">Temps(s)</span> <span className={\`font-mono text-sm font-bold \${isActive ? 'text-emerald-600' : (isOverridden ? 'text-purple-600' : 'text-slate-700')}\`}>{timeInSeconds}</span> </div> 
                        <div className="flex flex-col items-end"> <span className="font-mono text-[7px] font-bold text-slate-400 uppercase tracking-widest">Sat.</span> <div className="flex items-center gap-0.5"> {station.operators > 1 && <span className={\`font-mono text-[8px] font-black px-1 bg-slate-200 text-slate-600\`}>x{station.operators}</span>} <span className={\`font-mono text-[9px] font-black \${station.saturation > 100 ? 'text-rose-500' : 'text-emerald-600'}\`}>{Math.round(station.saturation)}%</span> </div> </div> 
                    </div> 
                </div> 
                <div className="absolute bottom-0 left-0 h-1 bg-slate-200 w-full"> <div className={\`h-full \${isActive ? 'bg-emerald-400' : (isFer ? 'bg-rose-500' : (isControl ? 'bg-orange-500' : (isFinition ? 'bg-purple-500' : color.fill)))}\`} style={{ width: \`\${Math.min(station.saturation, 100)}%\` }}></div> </div> 
            </div>
        );
    };
`;
    content = content.substring(0, startIdx) + newCard + endStr;
    fs.writeFileSync(path, content);
    console.log("Updated StationCard successfully.");
} else {
    console.log("Could not find start or end strings.");
}
