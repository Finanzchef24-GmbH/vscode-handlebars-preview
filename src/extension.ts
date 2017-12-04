import {
    workspace, window, commands,
    ExtensionContext, TextEditorSelectionChangeEvent, TextDocumentChangeEvent
} from "vscode";

import PreviewContentProvider from './lib/PreviewContentProvider';
import PREVIEW_URL from './lib/PREVIEW_URI';
import preview from './lib/preview';
import HbsOutlineProvider from './lib/hbs-tree';

export function activate(context: ExtensionContext) {
    let provider = new PreviewContentProvider();
    const hbsOutlineProvider = new HbsOutlineProvider(context)

    context.subscriptions.push(
        // Preview providers
        workspace.registerTextDocumentContentProvider("handlebars-preview", provider),

        window.registerTreeDataProvider('hbsOutline', hbsOutlineProvider),

        // Global handlers
        window.onDidChangeTextEditorSelection((e: TextEditorSelectionChangeEvent) => {
            if (e.textEditor === window.activeTextEditor) {
                provider.update(PREVIEW_URL);
            }
        }),
        workspace.onDidChangeTextDocument((e: TextDocumentChangeEvent) => {
            if (e.document === window.activeTextEditor.document) {
                provider.update(PREVIEW_URL);
            }
        }),

        // Commands
        commands.registerCommand('handlebarsPreview.preview', preview),
        
        commands.registerCommand('extension.changeValue', range => {
            hbsOutlineProvider.edit(range);
        }),
        commands.registerCommand('extension.openSelection', range => {
            hbsOutlineProvider.select(range);
        })
    );
}

export function deactivate() {
}