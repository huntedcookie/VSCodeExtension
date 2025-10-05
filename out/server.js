"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
const documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
// Tabla de variables por documento
const variableTable = {}; // uri -> lista de variables
connection.onInitialize((_params) => {
    return {
        capabilities: {
            textDocumentSync: node_1.TextDocumentSyncKind.Incremental,
            completionProvider: { resolveProvider: false }
        }
    };
});
async function validateTextDocument(document) {
    const text = document.getText();
    const diagnostics = [];
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
        if (!line.trim().endsWith(";")) {
            diagnostics.push({
                severity: node_1.DiagnosticSeverity.Error,
                range: {
                    start: { line: i, character: 0 },
                    end: { line: i, character: line.length }
                },
                message: "missing ;",
                source: "mylang"
            });
        }
    });
    connection.sendDiagnostics({ uri: document.uri, diagnostics });
}
documents.onDidChangeContent((change) => {
    const doc = change.document;
    const lines = doc.getText().split(/\r?\n/);
    const vars = [];
    lines.forEach(line => {
        const match = line.match(/var (\w+)/);
        if (match)
            vars.push(match[1]);
    });
    variableTable[doc.uri] = vars;
    validateTextDocument(doc);
});
connection.onCompletion((params) => {
    const docUri = params.textDocument.uri;
    const vars = variableTable[docUri] || [];
    const suggestions = [
        { label: "clamp", kind: node_1.CompletionItemKind.Keyword, detail: "Define una función" },
        { label: "if", kind: node_1.CompletionItemKind.Keyword, detail: "Condicional" },
        { label: "while", kind: node_1.CompletionItemKind.Keyword, detail: "Bucle" }
    ];
    vars.forEach(v => suggestions.push({ label: v, kind: node_1.CompletionItemKind.Variable, detail: "Variable declarada" }));
    return suggestions;
});
documents.listen(connection);
connection.listen();
