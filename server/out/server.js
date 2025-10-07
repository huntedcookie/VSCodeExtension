"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const node_2 = require("vscode-languageserver/node");
const node_3 = require("vscode-languageserver/node");
const node_4 = require("vscode-languageserver/node");
const connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
const documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
var TypeName;
(function (TypeName) {
    TypeName[TypeName["int"] = 0] = "int";
    TypeName[TypeName["float"] = 1] = "float";
    TypeName[TypeName["bool"] = 2] = "bool";
    TypeName[TypeName["float2"] = 3] = "float2";
    TypeName[TypeName["float3"] = 4] = "float3";
    TypeName[TypeName["float4"] = 5] = "float4";
})(TypeName || (TypeName = {}));
const tokenTypes = ["variable", "function", "keyword", "directiveInclude"];
const tokenModifiers = ["readonly", "input", "control", "deprecated", "singleUse"];
const legend = { tokenTypes, tokenModifiers };
const variableKinds = {};
connection.onInitialize((_params) => {
    return {
        capabilities: {
            textDocumentSync: node_1.TextDocumentSyncKind.Incremental,
            completionProvider: { resolveProvider: false },
            // signatureHelpProvider: {
            //     "triggerCharacters": ["("]
            // },
            semanticTokensProvider: {
                full: true,
                legend
            },
            documentFormattingProvider: true,
            hoverProvider: true,
            definitionProvider: true
        }
    };
});
connection.onDefinition((params) => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc)
        return null;
    const text = doc.getText();
    const lines = text.split(/\r?\n/);
    const line = lines[params.position.line];
    if (!line)
        return null;
    // Detectar la palabra bajo el cursor
    const regex = /\b[A-Za-z_]\w*\b/g;
    let match;
    let hoveredWord = null;
    while ((match = regex.exec(line)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (params.position.character >= start && params.position.character <= end) {
            hoveredWord = match[0];
            break;
        }
    }
    if (!hoveredWord)
        return null;
    // Buscar en el documento la línea de declaración
    for (let i = 0; i < lines.length; i++) {
        if (new RegExp(`\\b(?:in|out|const)?\\s*(int|float|bool|float2|float3|float4)\\s+${hoveredWord}\\b`).test(lines[i])) {
            const charStart = lines[i].indexOf(hoveredWord);
            return node_4.Location.create(params.textDocument.uri, node_2.Range.create(i, charStart, i, charStart + hoveredWord.length));
        }
    }
    return null;
});
connection.onHover((params) => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc)
        return null;
    const text = doc.getText();
    const lines = text.split(/\r?\n/);
    const line = lines[params.position.line];
    if (!line)
        return null;
    // Buscar palabra bajo el cursor
    const regex = /\b[A-Za-z_]\w*\b/g;
    let match;
    let hoveredWord = null;
    while ((match = regex.exec(line)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (params.position.character >= start && params.position.character <= end) {
            hoveredWord = match[0];
            break;
        }
    }
    if (!hoveredWord)
        return null;
    // Buscar info de variable
    const vars = variableKinds[params.textDocument.uri] || [];
    const v = vars.find(v => v.name === hoveredWord);
    if (!v)
        return null;
    // Devolver información tipo tooltip
    return {
        contents: {
            kind: node_3.MarkupKind.Markdown,
            value: `**${v.name}**: \`${TypeName[v.type]}\``
        }
    };
});
function formatMyLang(text) {
    const lines = text.split(/\r?\n/);
    const formatted = lines
        .map(line => {
        // eliminar espacios extra
        let trimmed = line.trim();
        // agregar indentación según llaves
        if (trimmed.startsWith("}")) {
            trimmed = "    " + trimmed; // 4 espacios
        }
        else if (trimmed.endsWith("{")) {
            trimmed = "    " + trimmed;
        }
        return trimmed;
    })
        .join("\n");
    return formatted + "\n";
}
connection.onDocumentFormatting(async (params, cancelToken) => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc)
        return [];
    // Esperar configuración correctamente
    const config = await connection.workspace.getConfiguration("mylang.enableAutoFormat");
    if (!config) {
        connection.console.log("Autoformat deshabilitado (config no encontrada)");
        return [];
    }
    if (config === false) {
        connection.console.log("Autoformat deshabilitado por settings");
        return [];
    }
    const text = doc.getText();
    const formatted = formatMyLang(text);
    const edit = {
        range: node_2.Range.create(0, 0, doc.lineCount, 0),
        newText: formatted
    };
    return [edit];
});
function findVariables(text) {
    const symbols = [];
    const lines = text.split(/\r?\n/);
    lines.forEach(line => {
        const trimmed = line.trim();
        const match = trimmed.match(/\b(?:in|out|const)?\s*(int|float|bool|float2|float3|float4)\s+(\w+)/);
        if (match) {
            const [, type, name] = match;
            let t;
            switch (type) {
                case "int":
                    t = TypeName.int;
                    break;
                case "float":
                    t = TypeName.float;
                    break;
                case "bool":
                    t = TypeName.bool;
                    break;
                case "float2":
                    t = TypeName.float2;
                    break;
                case "float3":
                    t = TypeName.float3;
                    break;
                case "float4":
                    t = TypeName.float4;
                    break;
                default: return;
            }
            symbols.push({ name, type: t });
        }
    });
    return symbols;
}
async function validateTextDocument(document) {
    const text = document.getText();
    const diagnostics = [];
    const lines = text.split(/\r?\n/);
    let inBlockComment = false;
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        const originalLine = line;
        // --- Manejo de comentarios multilínea / inline ---
        if (inBlockComment) {
            const endIdx = line.indexOf("*/");
            if (endIdx >= 0) {
                // cierra el comentario en esta línea -> queda lo que hay después
                line = line.slice(endIdx + 2);
                inBlockComment = false;
            }
            else {
                // seguimos dentro del bloque de comentario -> ignorar la línea entera
                continue;
            }
        }
        // eliminar cualquier comentario /* ... */ que esté en la misma línea (posible multiple)
        while (true) {
            const startIdx = line.indexOf("/*");
            if (startIdx === -1)
                break;
            const endIdx = line.indexOf("*/", startIdx + 2);
            if (endIdx === -1) {
                // inicia un bloque y no cierra en esta línea -> cortar y activar flag
                line = line.slice(0, startIdx);
                inBlockComment = true;
                break;
            }
            else {
                // bloque completo dentro de la misma línea -> eliminar
                line = line.slice(0, startIdx) + line.slice(endIdx + 2);
            }
        }
        // quitar comentarios de línea //
        const slIdx = line.indexOf("//");
        if (slIdx >= 0)
            line = line.slice(0, slIdx);
        const trimmed = line.trim();
        if (trimmed === "")
            continue; // línea vacía (o sólo comentario)
        // --- Reglas que NO requieren ';' ---
        // 1) líneas que sólo abren/cerran bloque (comienzan con { o })
        if (trimmed.startsWith("{") || trimmed.startsWith("}"))
            continue;
        // 2) sentencias de control: if, else, while, for, switch (no necesitan ;)
        if (/^(if|else|while|for|switch)\b/.test(trimmed))
            continue;
        // 3) declaración / cabecera de función: nombre(...)  (ej: main() { o main() )
        //    permitimos que tenga o no '{' al final
        if (/^[A-Za-z_]\w*\s*\([^)]*\)\s*\{?$/.test(trimmed)) {
            continue;
        }
        // A estas alturas, la mayoría de las líneas deben terminar en ';'
        if (!trimmed.endsWith(";")) {
            diagnostics.push({
                severity: node_1.DiagnosticSeverity.Error,
                range: {
                    start: { line: i, character: 0 },
                    end: { line: i, character: originalLine.length }
                },
                message: "Falta ';' al final de la instrucción (o línea no reconocida).",
                source: "mylang"
            });
            continue;
        }
        const declareAssign = line.match(/(\w+)\s+(\w+)\s*=\s*(.+);/);
        const plainAssign = line.match(/(\w+)\s*=\s*(.+);/);
        if (declareAssign) {
            const [, varType, varName, expr] = declareAssign;
            let declaredType;
            switch (varType) {
                case "int":
                    declaredType = TypeName.int;
                    break;
                case "float":
                    declaredType = TypeName.float;
                    break;
                case "bool":
                    declaredType = TypeName.bool;
                    break;
                case "float2":
                    declaredType = TypeName.float2;
                    break;
                case "float3":
                    declaredType = TypeName.float3;
                    break;
                case "float4":
                    declaredType = TypeName.float4;
                    break;
            }
            // Si la expresión es otra variable
            const usedVar = variableKinds[document.uri]?.find(s => s.name === expr.trim());
            if (declaredType && usedVar && declaredType !== usedVar.type) {
                diagnostics.push({
                    severity: node_1.DiagnosticSeverity.Error,
                    range: {
                        start: { line: i, character: 0 },
                        end: { line: i, character: line.length }
                    },
                    message: `No se puede asignar ${TypeName[usedVar.type]} a ${TypeName[declaredType]} sin cast`,
                    source: "mylang"
                });
            }
        }
        else if (plainAssign) {
            const [, varName, expr] = plainAssign;
            // Buscar la variable LHS en la tabla
            const lhsVar = variableKinds[document.uri]?.find(s => s.name === varName);
            const rhsVar = variableKinds[document.uri]?.find(s => s.name === expr.trim());
            if (lhsVar && rhsVar && lhsVar.type !== rhsVar.type) {
                diagnostics.push({
                    severity: node_1.DiagnosticSeverity.Warning,
                    range: {
                        start: { line: i, character: 0 },
                        end: { line: i, character: line.length }
                    },
                    message: `No se puede asignar ${TypeName[rhsVar.type]} a ${TypeName[lhsVar.type]} sin cast`,
                    source: "mylang"
                });
            }
        }
    }
    connection.sendDiagnostics({ uri: document.uri, diagnostics });
}
connection.languages.semanticTokens.on((params) => {
    connection.console.log("semanticTokens requested for " + params.textDocument.uri);
    const doc = documents.get(params.textDocument.uri);
    if (!doc)
        return { data: [] };
    const builder = new node_1.SemanticTokensBuilder();
    const text = doc.getText();
    const lines = text.split(/\r?\n/);
    // 1) variables declaradas
    const vars = findVariables(text); // VariableInfo[] (name,type)
    // 2) detectar const / in / out
    const constVars = new Set();
    const inputVars = new Set();
    const outputVars = new Set();
    for (const line of lines) {
        const constMatch = line.match(/\bconst\s+(?:int|float|bool|float2|float3|float4)\s+(\w+)/);
        if (constMatch)
            constVars.add(constMatch[1]);
        const inMatch = line.match(/\bin\s+(?:int|float|bool|float2|float3|float4)\s+(\w+)/);
        if (inMatch)
            inputVars.add(inMatch[1]);
        const outMatch = line.match(/\bout\s+(?:int|float|bool|float2|float3|float4)\s+(\w+)/);
        if (outMatch)
            outputVars.add(outMatch[1]);
    }
    // 3) contar usos IGNORANDO la propia línea de declaración
    const useCount = {};
    vars.forEach(v => useCount[v.name] = 0);
    for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        for (const v of vars) {
            // si esta línea es la declaración de v, saltarla
            const declRegex = new RegExp(`\\b(?:in|out|const)?\\s*(?:int|float|bool|float2|float3|float4)\\s+${v.name}\\b`);
            if (declRegex.test(line))
                continue;
            const regex = new RegExp(`\\b${v.name}\\b`, "g");
            let m;
            while ((m = regex.exec(line)) !== null) {
                useCount[v.name] = (useCount[v.name] || 0) + 1;
            }
        }
    }
    connection.console.log("useCount: " + JSON.stringify(useCount));
    const diagnostics = [];
    // 4) recorrer de nuevo y empujar tokens con modificadores
    for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        for (const v of vars) {
            const regex = new RegExp(`\\b${v.name}\\b`, "g");
            let m;
            while ((m = regex.exec(line)) !== null) {
                const startChar = m.index;
                const length = v.name.length;
                var typeIndex = tokenTypes.indexOf("variable"); // siempre variable para nombres
                // calcular máscara de modificadores
                let modMask = 0;
                // readonly (const / in)
                const idxReadonly = tokenModifiers.indexOf("readonly");
                if (idxReadonly >= 0 && (constVars.has(v.name) || inputVars.has(v.name))) {
                    modMask |= (1 << idxReadonly);
                }
                // output
                const idxOutput = tokenModifiers.indexOf("control");
                if (idxOutput >= 0 && outputVars.has(v.name)) {
                    typeIndex = tokenTypes.indexOf("directiveInclude");
                    // modMask |= (1 << idxOutput);
                }
                // deprecated = usado solo una vez
                const idxDeprecated = tokenModifiers.indexOf("deprecated");
                if (idxDeprecated >= 0 && (useCount[v.name] || 0) === 1) {
                    modMask |= (1 << idxDeprecated);
                    diagnostics.push({
                        severity: node_1.DiagnosticSeverity.Warning,
                        range: {
                            start: { line: li, character: startChar },
                            end: { line: li, character: startChar + length }
                        },
                        message: `La variable "${v.name}" está marcada como deprecated (solo se usa una vez).`,
                        source: "mylang"
                    });
                }
                builder.push(li, startChar, length, typeIndex, modMask);
            }
        }
    }
    connection.sendDiagnostics({ uri: params.textDocument.uri, diagnostics });
    connection.console.log("semanticTokens: built tokens for " + params.textDocument.uri);
    return builder.build();
});
documents.onDidChangeContent(change => {
    const doc = change.document;
    variableKinds[doc.uri] = findVariables(doc.getText());
    validateTextDocument(doc);
});
connection.onCompletion((params) => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc)
        return [];
    const vars = findVariables(doc.getText());
    variableKinds[doc.uri] = vars;
    const suggestions = [
        { label: "clamp()", kind: node_1.CompletionItemKind.Function, detail: "Clamp function" },
        { label: "if2", kind: node_1.CompletionItemKind.Keyword, detail: "Condicional" }
    ];
    // Agregar SIEMPRE todas las variables
    vars.forEach(v => {
        suggestions.push({
            label: v.name,
            kind: node_1.CompletionItemKind.Variable,
            detail: `Variable declarada (${TypeName[v.type]})`
        });
    });
    // Ahora verificamos si la posición actual está en una asignación
    const text = doc.getText();
    const lines = text.split(/\r?\n/);
    const posLine = lines[params.position.line] || "";
    const assignMatch = posLine.match(/(?:int|float|bool|float2|float3|float4)?\s*(\w+)\s*=/);
    if (assignMatch) {
        const varName = assignMatch[1];
        const lhsVar = vars.find(v => v.name === varName);
        if (lhsVar) {
            // Filtrar solo compatibles
            return suggestions.filter(s => {
                const v = vars.find(v => v.name === s.label);
                return !v || v.type === lhsVar.type; // funciones/keywords siempre pasan
            });
        }
    }
    // Si no estamos en asignación, devolvemos todo
    return suggestions;
});
documents.listen(connection);
connection.listen();
