const ts = require("typescript");
const fs = require("fs");
const p = "components/Magasin.tsx";
const src = fs.readFileSync(p, "utf8");
const sf = ts.createSourceFile(p, src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
const dias = ts.getPreEmitDiagnostics(sf);
if (!dias.length) {
  console.log("NO_DIAGNOSTICS");
} else {
  dias.forEach(d => {
    const { line, character } = sf.getLineAndCharacterOfPosition(d.start || 0);
    console.log(`${line+1}:${character+1} ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`);
  });
}
